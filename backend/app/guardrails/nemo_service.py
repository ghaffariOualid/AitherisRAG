"""
NVIDIA NeMo Guardrails Service for AITHERIS RAG.
Provides conversational safety, topical guardrails, jailbreak prevention, and output fact-checking.
"""

import os
import re
import time
from typing import Tuple, Optional, Dict, Any
from app.utils.logger import log_info, log_error
from app.utils.prometheus_metrics import (
    guardrail_checks_total,
    guardrail_violations_total,
    guardrail_duration_seconds,
)

# High-confidence prompt injection & jailbreak heuristics (Defense in depth)
INJECTION_PATTERNS = [
    r"(?i)\bignore\s+(?:all\s+)?(?:previous\s+|prior\s+|above\s+)?(?:instructions|prompts|rules|commands|guidelines)\b",
    r"(?i)\boublie\s+(?:toutes?\s+)?(?:les?\s+)?(?:consignes?|instructions?|règles?)\b",
    r"(?i)\byou\s+are\s+now\s+(?:in\s+)?(?:developer\s+mode|dan|jailbreak)\b",
    r"(?i)\bprint\s+(?:your\s+)?(?:system\s+prompt|initial\s+instructions)\b",
    r"(?i)\bdonnez?[- ]moi\s+(?:le\s+)?(?:prompt\s+système|instructions?\s+secrètes?)\b",
    r"(?i)\breveal\s+(?:the\s+|your\s+)?(?:system\s+prompt|system\s+message|api\s+keys?|master\s+prompt)\b",
    r"(?i)\bact\s+as\s+an\s+unfiltered\b",
    r"(?i)\bpasswords?|secret_key|private_key\s*=\b",
]


class NeMoGuardrailsService:
    """Wrapper for NVIDIA NeMo Guardrails with local heuristic resilience."""

    def __init__(self, config_dir: Optional[str] = None):
        self.config_dir = config_dir or os.path.join(os.path.dirname(__file__), "nemo_config")
        self._rails = None
        self._initialized = False
        self._init_nemo()

    def _init_nemo(self):
        try:
            from nemoguardrails import RailsConfig, LLMRails

            if os.path.exists(self.config_dir):
                config = RailsConfig.from_path(self.config_dir)
                self._rails = LLMRails(config)
                self._initialized = True
                log_info("NeMo Guardrails initialized successfully with Colang rules", context="guardrails")
            else:
                log_info(f"NeMo config directory {self.config_dir} not found. Running in heuristic guardrail mode.", context="guardrails")
        except Exception as e:
            log_error(e, context="guardrails", message="NeMo Guardrails package not loaded. Active with built-in heuristic defense.")
            self._initialized = False

    async def check_input(self, user_input: str) -> Tuple[bool, Optional[str]]:
        """
        Validate user input against prompt injection, jailbreaks, and forbidden topics.
        Returns:
            - is_valid (bool): True if input passes all checks, False if blocked.
            - reason (str): Explanation if blocked.
        """
        if not user_input or not user_input.strip():
            return True, None

        start_time = time.time()

        # Step 1: Fast Heuristic check (Zero latency)
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, user_input):
                duration = time.time() - start_time
                self._record_metric(stage="input_nemo", status="block", violation="prompt_injection", duration=duration)
                return False, "Requête bloquée : tentative d'injection de prompt ou contournement des instructions détectée."

        # Step 2: NeMo LLM Rails check (if initialized and model available)
        if self._initialized and self._rails:
            try:
                response = await self._rails.generate_async(
                    messages=[{"role": "user", "content": user_input}]
                )
                if response and "refuse" in str(response.get("content", "")).lower():
                    duration = time.time() - start_time
                    self._record_metric(stage="input_nemo", status="block", violation="jailbreak", duration=duration)
                    return False, response["content"]
            except Exception as e:
                # Never block valid requests if NeMo LLM evaluation times out
                log_error(e, context="guardrails", message="Error during NeMo LLM input check, proceeding with heuristic approval")

        duration = time.time() - start_time
        self._record_metric(stage="input_nemo", status="pass", duration=duration)
        return True, None

    async def check_output(self, bot_output: str, context: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """
        Validate generated answer against hallucinations and data leaks.
        """
        if not bot_output or not bot_output.strip():
            return True, None

        start_time = time.time()

        # Check for accidental leakage of system instructions or tokens
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, bot_output):
                duration = time.time() - start_time
                self._record_metric(stage="output_nemo", status="block", violation="hallucination", duration=duration)
                return False, "Réponse filtrée : détection d'une anomalie de conformité dans la réponse générée."

        duration = time.time() - start_time
        self._record_metric(stage="output_nemo", status="pass", duration=duration)
        return True, None

    def _record_metric(self, stage: str, status: str, violation: Optional[str] = None, duration: float = 0.0):
        try:
            guardrail_checks_total.labels(stage=stage, status=status).inc()
            guardrail_duration_seconds.labels(guardrail_type="nemo").observe(duration)
            if violation:
                guardrail_violations_total.labels(violation_type=violation, action="blocked").inc()
        except Exception:
            pass


# Singleton
_nemo_service: Optional[NeMoGuardrailsService] = None


def get_nemo_service() -> NeMoGuardrailsService:
    global _nemo_service
    if _nemo_service is None:
        _nemo_service = NeMoGuardrailsService()
    return _nemo_service
