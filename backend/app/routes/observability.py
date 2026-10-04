"""FastAPI routes for Observability (Langfuse, Grafana, Prometheus) Administration.

Allows admins to:
- View current Langfuse configuration and connection status
- Dynamically update Langfuse public and secret API keys
- Test connectivity and send test traces to Langfuse
- Retrieve direct dashboard URLs for Grafana, Langfuse, and Flower
"""
import os
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Body, status
from pydantic import BaseModel, Field

from app.db.models import User
from app.utils.auth import get_current_admin
from app.utils.langfuse_client import (
    configure_langfuse,
    get_langfuse_status,
    test_langfuse_connection,
)
from app.utils.logger import log_info, log_error

router = APIRouter()


class LangfuseConfigRequest(BaseModel):
    public_key: str = Field(..., min_length=10, max_length=200)
    secret_key: Optional[str] = Field(None, max_length=200)
    host: Optional[str] = Field("http://langfuse:3000", max_length=500)
    browser_url: Optional[str] = Field("http://localhost:3002", max_length=500)
    enabled: bool = True


@router.get("/config")
async def get_observability_config(admin: User = Depends(get_current_admin)) -> Dict[str, Any]:
    """Retrieve current Langfuse and Observability settings and URLs."""
    status_info = get_langfuse_status()
    return {
        "langfuse": status_info,
        "dashboards": {
            "langfuse_url": status_info["browser_url"],
            "grafana_url": os.getenv("GRAFANA_URL", "http://localhost:3001"),
            "prometheus_url": os.getenv("PROMETHEUS_URL", "http://localhost:9090"),
            "flower_url": os.getenv("FLOWER_URL", "http://localhost:5555"),
        },
    }


@router.post("/config")
async def update_observability_config(
    payload: LangfuseConfigRequest,
    admin: User = Depends(get_current_admin),
) -> Dict[str, Any]:
    """Update Langfuse credentials dynamically and reconfigure the client."""
    try:
        log_info(
            f"Admin {admin.email} updating Langfuse configuration",
            context="observability",
        )
        if payload.browser_url:
            os.environ["LANGFUSE_BROWSER_URL"] = payload.browser_url.strip()

        updated_status = configure_langfuse(
            public_key=payload.public_key,
            secret_key=payload.secret_key,
            host=payload.host,
            enabled=payload.enabled,
        )
        return {
            "success": True,
            "message": "Configuration Langfuse mise à jour avec succès !",
            "config": updated_status,
        }
    except Exception as e:
        log_error(e, context="observability", message="Failed to update Langfuse configuration")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Échec de la mise à jour : {str(e)}",
        )


@router.post("/test")
async def test_observability_connection(
    admin: User = Depends(get_current_admin),
) -> Dict[str, Any]:
    """Send a live test event to Langfuse to verify connectivity and credentials."""
    result = test_langfuse_connection()
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("message", "Échec de connexion"),
        )
    return result
