"""
Microsoft Presidio Service for PII Detection & Reversible Anonymization.
Part of the AITHERIS RAG Guardrails layer.
"""

import re
import time
from typing import Dict, List, Tuple, Any, Optional
from app.utils.logger import log_info, log_error
from app.utils.prometheus_metrics import (
    guardrail_checks_total,
    guardrail_violations_total,
    guardrail_pii_entities_total,
    guardrail_duration_seconds,
)

# Custom Regex Patterns for additional European/French formats
FRENCH_NIR_PATTERN = r"\b[12]\s*\d{2}\s*(?:0[1-9]|1[0-2])\s*\d{2}\s*\d{3}\s*\d{3}(?:\s*\d{2})?\b"
FRENCH_PHONE_PATTERN = r"\b(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}\b"
SIREN_SIRET_PATTERN = r"\b\d{3}[\s.-]?\d{3}[\s.-]?\d{3}(?:[\s.-]?\d{5})?\b"


class PresidioService:
    """Service wrapping Microsoft Presidio Analyzer & Anonymizer with graceful fallback."""

    def __init__(self):
        self._analyzer = None
        self._anonymizer = None
        self._initialized = False
        self._init_presidio()

    def _init_presidio(self):
        try:
            from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
            from presidio_analyzer.nlp_engine import NlpEngineProvider
            from presidio_anonymizer import AnonymizerEngine

            # Use lightweight en_core_web_sm model
            nlp_configuration = {
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
            }
            try:
                provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
                nlp_engine = provider.create_engine()
                self._analyzer = AnalyzerEngine(nlp_engine=nlp_engine)
            except Exception:
                self._analyzer = AnalyzerEngine()

            self._anonymizer = AnonymizerEngine()

            # Add French NIR (Social Security) Recognizer
            nir_pattern = Pattern(name="french_nir_pattern", regex=FRENCH_NIR_PATTERN, score=0.85)
            nir_recognizer = PatternRecognizer(
                supported_entity="FR_NIR",
                patterns=[nir_pattern],
                supported_language="fr",
            )
            self._analyzer.registry.add_recognizer(nir_recognizer)

            # Add French Phone Recognizer
            phone_pattern = Pattern(name="french_phone_pattern", regex=FRENCH_PHONE_PATTERN, score=0.8)
            phone_recognizer = PatternRecognizer(
                supported_entity="FR_PHONE",
                patterns=[phone_pattern],
                supported_language="fr",
            )
            self._analyzer.registry.add_recognizer(phone_recognizer)

            self._initialized = True
            log_info("Microsoft Presidio initialized successfully with standard and custom recognizers", context="guardrails")
        except Exception as e:
            log_error(e, context="guardrails", message="Presidio not available or error during init. Using built-in fallback regex engine.")
            self._initialized = False

    def anonymize(self, text: str, language: str = "en") -> Tuple[str, List[Dict[str, Any]], Dict[str, str]]:
        """
        Detect and redact PII entities from text.
        Returns:
            - anonymized_text (str): Clean text with placeholders like <EMAIL_ADDRESS_1>
            - entities (list): List of detected entities with entity_type, start, end, score
            - mapping (dict): Placeholder -> Original text mapping for optional reversible de-anonymization
        """
        if not text or not text.strip():
            return text, [], {}

        start_time = time.time()
        entities = []
        mapping = {}
        anonymized_text = text

        try:
            if self._initialized and self._analyzer and self._anonymizer:
                # Run Presidio analysis
                lang_code = "fr" if language.lower() in ("fr", "french") else "en"
                results = self._analyzer.analyze(
                    text=text,
                    language=lang_code,
                    entities=[
                        "EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD", "CRYPTO",
                        "IBAN_CODE", "IP_ADDRESS", "FR_NIR", "FR_PHONE"
                    ]
                )

                # Sort descending by start position to replace without offset drift
                sorted_results = sorted(results, key=lambda x: x.start, reverse=True)
                counts: Dict[str, int] = {}

                # Create replacements and mapping
                for res in sorted_results:
                    entity_type = res.entity_type
                    counts[entity_type] = counts.get(entity_type, 0) + 1
                    token = f"<{entity_type}_{counts[entity_type]}>"
                    original_val = anonymized_text[res.start:res.end]
                    mapping[token] = original_val

                    anonymized_text = (
                        anonymized_text[:res.start] + token + anonymized_text[res.end:]
                    )

                    entities.append({
                        "entity_type": entity_type,
                        "start": res.start,
                        "end": res.end,
                        "score": res.score,
                        "placeholder": token,
                    })

                    # Prometheus metric
                    try:
                        guardrail_pii_entities_total.labels(entity_type=entity_type).inc()
                    except Exception:
                        pass
            else:
                # Fallback regex-based anonymization
                anonymized_text, entities, mapping = self._fallback_anonymize(text)

            # Record Prometheus metrics
            duration = time.time() - start_time
            try:
                status = "modified" if entities else "pass"
                guardrail_checks_total.labels(stage="input_pii", status=status).inc()
                guardrail_duration_seconds.labels(guardrail_type="presidio").observe(duration)
                if entities:
                    guardrail_violations_total.labels(violation_type="pii_detected", action="redacted").inc(len(entities))
            except Exception:
                pass

            return anonymized_text, entities, mapping

        except Exception as e:
            log_error(e, context="guardrails", message="Error during Presidio anonymization, returning original text")
            return text, [], {}

    def _fallback_anonymize(self, text: str) -> Tuple[str, List[Dict[str, Any]], Dict[str, str]]:
        """Lightweight regex fallback when Presidio is not installed."""
        entities = []
        mapping = {}
        anonymized = text

        patterns = [
            ("EMAIL_ADDRESS", r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"),
            ("PHONE_NUMBER", r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}\b"),
            ("CREDIT_CARD", r"\b(?:\d{4}[-\s]?){3}\d{4}\b"),
            ("IBAN_CODE", r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b"),
            ("IP_ADDRESS", r"\b\d{1,3}(?:\.\d{1,3}){3}\b"),
            ("FR_NIR", FRENCH_NIR_PATTERN),
        ]

        counter = 0
        for entity_type, regex in patterns:
            matches = list(re.finditer(regex, anonymized))
            for match in reversed(matches):
                counter += 1
                token = f"<{entity_type}_{counter}>"
                original = match.group(0)
                mapping[token] = original
                entities.append({
                    "entity_type": entity_type,
                    "start": match.start(),
                    "end": match.end(),
                    "score": 0.9,
                    "placeholder": token,
                })
                anonymized = anonymized[:match.start()] + token + anonymized[match.end():]

        return anonymized, entities, mapping

    def deanonymize(self, text: str, mapping: Dict[str, str]) -> str:
        """Restore redacted PII values back into the text using the mapping dictionary."""
        if not text or not mapping:
            return text

        restored = text
        for placeholder, original in mapping.items():
            restored = restored.replace(placeholder, original)
        return restored


# Singleton instance
_presidio_service: Optional[PresidioService] = None


def get_presidio_service() -> PresidioService:
    global _presidio_service
    if _presidio_service is None:
        _presidio_service = PresidioService()
    return _presidio_service
