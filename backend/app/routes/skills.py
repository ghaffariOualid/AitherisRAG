"""Routes for managing and selecting skills in RAGio."""
from fastapi import APIRouter, Depends, HTTPException, Body, Request, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from app.db.database import get_db
from app.db.models import Skill
from app.utils.auth import get_current_user
from app.services.skill_service import (
    parse_skill_md,
    format_skill_md,
    validate_skill_content,
    sync_skills_from_disk,
    get_active_skills,
    get_skill_by_identifier,
)
from app.utils.logger import log_info, log_error, log_warning

router = APIRouter()


def _serialize_skill(skill: Skill, include_content: bool = False) -> Dict[str, Any]:
    """Serialize a Skill model to a dictionary."""
    data = {
        "id": skill.id,
        "name": skill.name,
        "slug": skill.slug,
        "description": skill.description,
        "icon": skill.icon or "Sparkles",
        "temperature": skill.temperature,
        "is_active": skill.is_active,
        "is_system": skill.is_system,
        "frontmatter": skill.frontmatter or {},
        "created_at": skill.created_at.isoformat() if skill.created_at else None,
        "updated_at": skill.updated_at.isoformat() if skill.updated_at else None,
    }
    if include_content:
        data["content_md"] = skill.content_md
        data["system_prompt"] = skill.system_prompt
    return data


@router.get("")
@router.get("/")
def list_skills(
    include_inactive: bool = Query(default=False),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List skills for the chat selector and skills management."""
    query = db.query(Skill)
    if not include_inactive:
        query = query.filter(Skill.is_active == True)
    skills = query.order_by(Skill.is_system.desc(), Skill.name.asc()).all()
    return [_serialize_skill(s, include_content=False) for s in skills]


@router.get("/{id_or_slug}")
def get_skill(
    id_or_slug: str,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get full details of a skill, including raw SKILL.md content."""
    skill = get_skill_by_identifier(db, id_or_slug)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill introuvable.")
    return _serialize_skill(skill, include_content=True)


@router.post("/validate")
def validate_skill(
    payload: Dict[str, Any] = Body(...),
    user_id: int = Depends(get_current_user),
):
    """Validate a SKILL.md string and return errors/warnings."""
    content_md = payload.get("content_md", "")
    return validate_skill_content(content_md)


@router.post("")
@router.post("/")
def create_skill(
    payload: Dict[str, Any] = Body(...),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new skill from SKILL.md content or structured fields."""
    content_md = payload.get("content_md")
    
    if content_md:
        validation = validate_skill_content(content_md)
        if not validation["valid"]:
            raise HTTPException(status_code=400, detail={"message": "Fichier SKILL.md invalide", "errors": validation["errors"]})
        meta, body = parse_skill_md(content_md)
    else:
        # Build from structured fields
        name = payload.get("name", "").strip()
        slug = payload.get("slug", "").strip().lower()
        if not name or not slug:
            raise HTTPException(status_code=400, detail="Le nom et le slug sont requis.")
        meta = {
            "name": name,
            "slug": slug,
            "description": payload.get("description", ""),
            "icon": payload.get("icon", "Sparkles"),
            "temperature": payload.get("temperature", 0.5),
            "roles": payload.get("roles", ["chat", "rag"]),
            "tags": payload.get("tags", []),
        }
        body = payload.get("system_prompt", payload.get("instructions", "# Instructions\n")).strip()
        content_md = format_skill_md(meta, body)

    slug = meta.get("slug", "").strip().lower()
    existing = db.query(Skill).filter(Skill.slug == slug).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Une compétence avec le slug '{slug}' existe déjà.")

    now = datetime.now(timezone.utc)
    new_skill = Skill(
        name=meta.get("name"),
        slug=slug,
        description=meta.get("description"),
        icon=meta.get("icon", "Sparkles"),
        content_md=content_md,
        system_prompt=body,
        frontmatter=meta,
        temperature=float(meta.get("temperature")) if meta.get("temperature") is not None else None,
        is_active=True,
        is_system=False,
        created_by_id=user_id,
        created_at=now,
        updated_at=now,
    )
    db.add(new_skill)
    db.commit()
    db.refresh(new_skill)
    log_info(f"Skill '{new_skill.slug}' created by user {user_id}", context="skills_route")
    return _serialize_skill(new_skill, include_content=True)


@router.put("/{skill_id}")
def update_skill(
    skill_id: int,
    payload: Dict[str, Any] = Body(...),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing skill."""
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill introuvable.")

    content_md = payload.get("content_md")
    if content_md:
        validation = validate_skill_content(content_md)
        if not validation["valid"]:
            raise HTTPException(status_code=400, detail={"message": "Fichier SKILL.md invalide", "errors": validation["errors"]})
        meta, body = parse_skill_md(content_md)
    else:
        meta = skill.frontmatter or {}
        if "name" in payload:
            meta["name"] = payload["name"]
        if "description" in payload:
            meta["description"] = payload["description"]
        if "icon" in payload:
            meta["icon"] = payload["icon"]
        if "temperature" in payload:
            meta["temperature"] = payload["temperature"]
        if "roles" in payload:
            meta["roles"] = payload["roles"]
        if "tags" in payload:
            meta["tags"] = payload["tags"]
        body = payload.get("system_prompt", skill.system_prompt)
        content_md = format_skill_md(meta, body)

    # Check slug collision if slug changed
    new_slug = meta.get("slug", skill.slug).strip().lower()
    if new_slug != skill.slug:
        collision = db.query(Skill).filter(Skill.slug == new_slug, Skill.id != skill.id).first()
        if collision:
            raise HTTPException(status_code=409, detail=f"Le slug '{new_slug}' est déjà utilisé par une autre compétence.")
        skill.slug = new_slug

    skill.name = meta.get("name", skill.name)
    skill.description = meta.get("description", skill.description)
    skill.icon = meta.get("icon", skill.icon or "Sparkles")
    skill.content_md = content_md
    skill.system_prompt = body
    skill.frontmatter = meta
    temp = meta.get("temperature")
    skill.temperature = float(temp) if temp is not None else None
    if "is_active" in payload:
        skill.is_active = bool(payload["is_active"])
    skill.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(skill)
    log_info(f"Skill '{skill.slug}' updated", context="skills_route")
    return _serialize_skill(skill, include_content=True)


@router.delete("/{skill_id}")
def delete_skill(
    skill_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a custom skill. System skills cannot be deleted."""
    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill introuvable.")
    if skill.is_system:
        raise HTTPException(status_code=403, detail="Les compétences système ne peuvent pas être supprimées. Vous pouvez les désactiver.")

    slug = skill.slug
    db.delete(skill)
    db.commit()
    log_info(f"Skill '{slug}' deleted", context="skills_route")
    return {"success": True, "message": f"Compétence '{slug}' supprimée avec succès."}


@router.post("/sync")
def sync_skills(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Resynchronize built-in system skills from disk."""
    result = sync_skills_from_disk(db)
    return result
