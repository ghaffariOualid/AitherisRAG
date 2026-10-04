"""FastAPI routes for LLM Gateway Administration.

Provides endpoints for:
- Listing, creating, updating, and deleting LLM providers
- Testing provider connectivity and latency
- Auto-discovering local Ollama models
- Assigning model roles and fallback priorities
All endpoints require admin privileges (verified by get_current_admin).
"""
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import LLMProvider, User
from app.services.llm_gateway import (
    decrypt_api_key,
    encrypt_api_key,
    llm_gateway,
    mask_api_key,
)
from app.utils.auth import get_current_admin
from app.utils.logger import log_error, log_info

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class ProviderBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    provider_type: str = Field(..., description="ollama, mistral, openai, groq, openrouter, custom")
    base_url: str = Field(..., min_length=1, max_length=500)
    api_key: Optional[str] = Field(None, max_length=500)
    model_name: str = Field(..., min_length=1, max_length=150)
    temperature: float = Field(0.6, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(None, ge=1, le=128000)
    is_active: bool = Field(True)
    priority: int = Field(0, ge=0)
    assigned_roles: List[str] = Field(default_factory=lambda: ["chat"])


class ProviderCreate(ProviderBase):
    pass


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    provider_type: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None
    assigned_roles: Optional[List[str]] = None


class ProviderOut(BaseModel):
    id: int
    name: str
    provider_type: str
    base_url: str
    api_key_masked: Optional[str]
    has_api_key: bool
    model_name: str
    temperature: float
    max_tokens: Optional[int]
    is_active: bool
    priority: int
    assigned_roles: List[str]
    created_at: datetime
    updated_at: datetime


class TestConnectionRequest(BaseModel):
    base_url: str
    api_key: Optional[str] = None
    model_name: str
    provider_type: str = "custom"
    provider_id: Optional[int] = None


class RoleAssignmentRequest(BaseModel):
    role_mapping: Dict[str, List[int]] = Field(
        ...,
        description="Mapping from role name ('chat', 'rag', 'summary', 'query_expansion') to list of provider IDs in priority order"
    )


def _serialize_provider(p: LLMProvider) -> ProviderOut:
    """Format an LLMProvider database record for safe API output."""
    masked = mask_api_key(p.api_key)
    return ProviderOut(
        id=p.id,
        name=p.name,
        provider_type=p.provider_type,
        base_url=p.base_url,
        api_key_masked=masked,
        has_api_key=bool(p.api_key),
        model_name=p.model_name,
        temperature=p.temperature,
        max_tokens=p.max_tokens,
        is_active=p.is_active,
        priority=p.priority,
        assigned_roles=p.assigned_roles or [],
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/providers", response_model=List[ProviderOut])
def list_providers(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """List all configured LLM providers, ordered by priority."""
    providers = (
        db.query(LLMProvider)
        .order_by(LLMProvider.priority.asc(), LLMProvider.id.asc())
        .all()
    )
    return [_serialize_provider(p) for p in providers]


@router.post("/providers", response_model=ProviderOut, status_code=status.HTTP_201_CREATED)
def create_provider(
    data: ProviderCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Create a new LLM provider configuration."""
    encrypted_key = encrypt_api_key(data.api_key) if data.api_key else None

    new_provider = LLMProvider(
        name=data.name.strip(),
        provider_type=data.provider_type.strip().lower(),
        base_url=data.base_url.strip(),
        api_key=encrypted_key,
        model_name=data.model_name.strip(),
        temperature=data.temperature,
        max_tokens=data.max_tokens,
        is_active=data.is_active,
        priority=data.priority,
        assigned_roles=data.assigned_roles,
    )
    db.add(new_provider)
    db.commit()
    db.refresh(new_provider)

    llm_gateway.invalidate_cache()
    log_info(f"Admin {admin.email} created provider {new_provider.name} (id={new_provider.id})", context="admin_llm")

    return _serialize_provider(new_provider)


@router.put("/providers/{provider_id}", response_model=ProviderOut)
def update_provider(
    provider_id: int,
    data: ProviderUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Update an existing LLM provider configuration."""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    if data.name is not None:
        provider.name = data.name.strip()
    if data.provider_type is not None:
        provider.provider_type = data.provider_type.strip().lower()
    if data.base_url is not None:
        provider.base_url = data.base_url.strip()
    if data.model_name is not None:
        provider.model_name = data.model_name.strip()
    if data.temperature is not None:
        provider.temperature = data.temperature
    if data.max_tokens is not None:
        provider.max_tokens = data.max_tokens
    if data.is_active is not None:
        provider.is_active = data.is_active
    if data.priority is not None:
        provider.priority = data.priority
    if data.assigned_roles is not None:
        provider.assigned_roles = data.assigned_roles

    # Only update API key if provided and not masked
    if data.api_key is not None:
        key_val = data.api_key.strip()
        if key_val and not ("..." in key_val or key_val == "****"):
            provider.api_key = encrypt_api_key(key_val)
        elif not key_val:
            # Cleared key (e.g. switching to local Ollama)
            provider.api_key = None

    provider.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(provider)

    llm_gateway.invalidate_cache()
    log_info(f"Admin {admin.email} updated provider {provider.name} (id={provider.id})", context="admin_llm")

    return _serialize_provider(provider)


@router.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(
    provider_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Delete an LLM provider configuration."""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")

    db.delete(provider)
    db.commit()

    llm_gateway.invalidate_cache()
    log_info(f"Admin {admin.email} deleted provider id={provider_id}", context="admin_llm")


@router.post("/test")
def test_provider_connection(
    req: TestConnectionRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Test connectivity and measure response latency for a model configuration."""
    actual_key = req.api_key
    # If key was not sent or is masked, and provider_id is passed, look up in DB
    if (not actual_key or "..." in actual_key or actual_key == "****") and req.provider_id:
        existing = db.query(LLMProvider).filter(LLMProvider.id == req.provider_id).first()
        if existing and existing.api_key:
            actual_key = decrypt_api_key(existing.api_key)

    result = llm_gateway.test_connection(
        base_url=req.base_url,
        api_key=actual_key,
        model_name=req.model_name,
        provider_type=req.provider_type,
    )
    return result


@router.get("/ollama/models")
def get_ollama_models(
    base_url: str = Query("http://host.docker.internal:11434", description="Ollama server URL"),
    admin: User = Depends(get_current_admin),
):
    """Discover available models on the given Ollama server instance."""
    models = llm_gateway.fetch_ollama_models(base_url)
    return {"models": models, "count": len(models), "base_url": base_url}


@router.post("/roles/assign")
def assign_roles(
    req: RoleAssignmentRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Batch update role assignments and priorities across providers."""
    all_providers = db.query(LLMProvider).all()
    prov_map = {p.id: p for p in all_providers}

    # Reset role lists first
    for p in all_providers:
        p.assigned_roles = []

    # Assign roles based on mapping
    for role_name, provider_ids in req.role_mapping.items():
        for rank, p_id in enumerate(provider_ids):
            if p_id in prov_map:
                prov = prov_map[p_id]
                current_roles = list(prov.assigned_roles or [])
                if role_name not in current_roles:
                    current_roles.append(role_name)
                    prov.assigned_roles = current_roles
                # If this is the primary chat role, set priority
                if role_name == "chat":
                    prov.priority = rank

    db.commit()
    llm_gateway.invalidate_cache()
    log_info(f"Admin {admin.email} updated role assignments", context="admin_llm")

    return {"message": "Role assignments updated successfully"}
