"""
Unified Guardrails Pipeline for AITHERIS RAG.
Orchestrates Microsoft Presidio (PII redaction) and NVIDIA NeMo Guardrails (Input & Output Safety).
"""

from typing import Dict, Any, Optional, Tuple, List
from app.guardrails.presidio_service import get_presidio_service
from app.guardrails.nemo_service import get_nemo_service
from app.utils.langfuse_client import RAGTrace
from app.utils.logger import log_info, log_error


class GuardrailResult:
    """Encapsulates the outcome of Guardrail processing."""

    def __init__(
        self,
        passed: bool,
        text: str,
        original_text: str,
        refusal_message: Optional[str] = None,
        pii_entities: Optional[List[Dict[str, Any]]] = None,
        pii_mapping: Optional[Dict[str, str]] = None,
        guardrails_applied: Optional[Dict[str, Any]] = None,
    ):
        self.passed = passed
        self.text = text
        self.original_text = original_text
        self.refusal_message = refusal_message
        self.pii_entities = pii_entities or []
        self.pii_mapping = pii_mapping or {}
        self.guardrails_applied = guardrails_applied or {}


class GuardrailsManager:
    """Central orchestrator for all input and output guardrails."""

    def __init__(self):
        self.presidio = get_presidio_service()
        self.nemo = get_nemo_service()

    async def process_input(
        self,
        user_input: str,
        language: str = "en",
        mask_pii: bool = True,
        trace: Optional[RAGTrace] = None,
    ) -> GuardrailResult:
        """
        Process user question before passing it to the RAG pipeline or LLM.
        1. NeMo Input check for injection / jailbreak attacks.
        2. Presidio PII detection and reversible anonymization.
        """
        # Step 1: NeMo Input Safety check
        is_safe, refusal_reason = await self.nemo.check_input(user_input)
        if not is_safe:
            log_info(f"Guardrails blocked input: {refusal_reason}", context="guardrails")
            if trace:
                trace.event(
                    name="guardrail_input_blocked",
                    input_data={"user_input": user_input},
                    output_data={"refusal": refusal_reason},
                    metadata={"violation": "prompt_injection"},
                )
            return GuardrailResult(
                passed=False,
                text=user_input,
                original_text=user_input,
                refusal_message=refusal_reason or "Demande bloquée par la politique de sécurité.",
                guardrails_applied={"nemo_input": "blocked"},
            )

        # Step 2: Presidio PII Anonymization
        anonymized_text = user_input
        pii_entities = []
        pii_mapping = {}

        if mask_pii:
            anonymized_text, pii_entities, pii_mapping = self.presidio.anonymize(
                text=user_input, language=language
            )
            if pii_entities and trace:
                trace.event(
                    name="guardrail_pii_redacted",
                    input_data={"entities_count": len(pii_entities)},
                    output_data={"entities": [e["entity_type"] for e in pii_entities]},
                )

        return GuardrailResult(
            passed=True,
            text=anonymized_text,
            original_text=user_input,
            pii_entities=pii_entities,
            pii_mapping=pii_mapping,
            guardrails_applied={
                "nemo_input": "passed",
                "pii_detected": len(pii_entities) > 0,
                "pii_count": len(pii_entities),
            },
        )

    async def process_output(
        self,
        bot_response: str,
        pii_mapping: Optional[Dict[str, str]] = None,
        restore_pii: bool = True,
        trace: Optional[RAGTrace] = None,
    ) -> str:
        """
        Process the generated LLM response before sending back to client:
        1. NeMo Output check for policy violations or leaks.
        2. Presidio de-anonymization (restoring masked values into response if present).
        """
        # Step 1: NeMo Output Check
        is_valid, refusal_reason = await self.nemo.check_output(bot_response)
        if not is_valid:
            if trace:
                trace.event(
                    name="guardrail_output_blocked",
                    output_data={"refusal": refusal_reason},
                )
            return refusal_reason or "La réponse a été filtrée pour des raisons de conformité."

        # Step 2: Restore PII if mapping exists
        final_text = bot_response
        if restore_pii and pii_mapping:
            final_text = self.presidio.deanonymize(bot_response, pii_mapping)

        return final_text


_guardrails_manager: Optional[GuardrailsManager] = None


def get_guardrails_manager() -> GuardrailsManager:
    global _guardrails_manager
    if _guardrails_manager is None:
        _guardrails_manager = GuardrailsManager()
    return _guardrails_manager
