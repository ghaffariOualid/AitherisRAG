"""
API endpoints for Guardrails (NeMo + Presidio) management and testing.
"""

from fastapi import APIRouter, Depends, Body
from typing import Dict, Any, Optional
from app.utils.auth import get_current_user
from app.guardrails import get_guardrails_manager

router = APIRouter()


@router.get("/status")
async def guardrails_status(user_id: int = Depends(get_current_user)) -> Dict[str, Any]:
    """Check the status and health of Presidio and NeMo Guardrails engines."""
    manager = get_guardrails_manager()
    return {
        "status": "operational",
        "presidio_enabled": manager.presidio._initialized,
        "nemo_enabled": manager.nemo._initialized,
        "mode": "hybrid_defense",
        "features": {
            "pii_anonymization": True,
            "prompt_injection_detection": True,
            "jailbreak_prevention": True,
            "output_moderation": True,
        }
    }


@router.post("/test")
async def test_guardrails(
    text: str = Body(..., embed=True),
    language: str = Body(default="en", embed=True),
    user_id: int = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Test input text against Presidio (PII redaction) and NeMo (Jailbreak / Injection detection).
    """
    manager = get_guardrails_manager()
    result = await manager.process_input(user_input=text, language=language)

    return {
        "passed": result.passed,
        "original_text": result.original_text,
        "sanitized_text": result.text,
        "refusal_message": result.refusal_message,
        "pii_entities_detected": result.pii_entities,
        "guardrails_applied": result.guardrails_applied,
    }
