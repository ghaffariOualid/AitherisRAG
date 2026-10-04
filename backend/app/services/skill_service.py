"""Skill Service for RAGio.

Handles SKILL.md parsing, validation, prompt compilation, and disk synchronization.
"""
from typing import Dict, Any, Tuple, List, Optional, Union
import os
import re
import yaml
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db.models import Skill
from app.utils.logger import log_info, log_error, log_warning

SKILLS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "skills"))


def parse_skill_md(content: str) -> Tuple[Dict[str, Any], str]:
    """Parse a SKILL.md file content into (metadata_dict, markdown_body).
    
    Format:
    ---
    name: "Skill Name"
    slug: "skill-slug"
    description: "..."
    icon: "ShieldAlert"
    temperature: 0.3
    roles: ["chat", "rag"]
    tags: ["cyber", "audit"]
    is_default: false
    ---
    # Markdown Body Instructions
    ...
    """
    if not content or not content.strip():
        return {}, ""

    text = content.strip()
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if not match:
        # No frontmatter delimiter found; treat entire content as body
        return {
            "name": "Compétence personnalisée",
            "slug": "custom-skill",
            "description": "Compétence sans frontmatter YAML",
            "icon": "Sparkles",
            "temperature": 0.5,
            "roles": ["chat", "rag"],
        }, text

    yaml_str, body = match.group(1), match.group(2).strip()
    try:
        metadata = yaml.safe_load(yaml_str) or {}
    except Exception as e:
        log_warning(f"Failed to parse YAML frontmatter: {e}", context="skill_service")
        metadata = {}
        for line in yaml_str.splitlines():
            if ":" in line and not line.strip().startswith("-"):
                k, v = line.split(":", 1)
                metadata[k.strip()] = v.strip().strip('"').strip("'")

    if not isinstance(metadata, dict):
        metadata = {}

    return metadata, body


def format_skill_md(metadata: Dict[str, Any], body: str) -> str:
    """Format metadata dictionary and body into a valid SKILL.md string."""
    clean_meta = {}
    # Preferred order of top-level keys
    key_order = ["name", "slug", "description", "icon", "temperature", "roles", "tags", "is_default"]
    for k in key_order:
        if k in metadata and metadata[k] is not None:
            clean_meta[k] = metadata[k]
    for k, v in metadata.items():
        if k not in clean_meta and v is not None:
            clean_meta[k] = v

    yaml_header = yaml.dump(clean_meta, allow_unicode=True, default_flow_style=False, sort_keys=False).strip()
    return f"---\n{yaml_header}\n---\n\n{body.strip()}\n"


def validate_skill_content(content: str) -> Dict[str, Any]:
    """Validate a SKILL.md string and return validation results."""
    errors = []
    warnings = []
    
    if not content or not content.strip():
        return {"valid": False, "errors": ["Le contenu du fichier SKILL.md ne peut pas être vide."], "warnings": []}

    if not content.strip().startswith("---"):
        warnings.append("Le fichier ne commence pas par l'en-tête frontmatter '---'.")

    meta, body = parse_skill_md(content)

    if not meta.get("name"):
        errors.append("Le champ 'name' est obligatoire dans le frontmatter.")
    if not meta.get("slug"):
        errors.append("Le champ 'slug' est obligatoire dans le frontmatter.")
    elif not re.match(r"^[a-z0-9-_]+$", str(meta.get("slug", "")).strip().lower()):
        errors.append("Le slug ne doit contenir que des lettres minuscules, chiffres, tirets et underscores.")

    if not body:
        warnings.append("Le corps des instructions Markdown est vide.")

    # Validate temperature if present
    temp = meta.get("temperature")
    if temp is not None:
        try:
            temp_float = float(temp)
            if not (0.0 <= temp_float <= 2.0):
                warnings.append("La température doit idéalement être comprise entre 0.0 et 1.0.")
        except ValueError:
            errors.append("La valeur de température est invalide (doit être un nombre).")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "metadata": meta,
        "body_preview": body[:200] + ("..." if len(body) > 200 else ""),
    }


def compile_prompt_for_skill(skill: Skill, language: str) -> str:
    """Compile the prompt template for LangChain using the given skill and language.
    
    Returns a template string containing placeholders {context}, {memory}, and {question}.
    """
    body = skill.system_prompt or ""
    # If the skill body already has all required placeholders, use it directly with language injection
    has_context = "{context}" in body
    has_question = "{question}" in body
    has_memory = "{memory}" in body

    if has_context and has_question and has_memory:
        # Prompt already defines complete flow
        compiled = body.replace("{language}", language)
        return compiled

    # Otherwise, build standard prompt wrapper around the skill's instructions
    instructions = body.strip()
    return f"""{instructions}

RÈGLES IMPORTANTES :
- Répondre impérativement en {language}.
- Ne jamais utiliser de balises internes de réflexion comme <think>, <thinking> ou <thought> dans votre réponse.
- Utiliser rigoureusement et fidèlement les éléments fournis dans le contexte documentaire RAG ci-dessous.

CONTEXTE DOCUMENTAIRE (RÉFÉRENTIELS ET SOURCES FOURNIS) :
{{context}}

HISTORIQUE DE CONVERSATION :
{{memory}}

CONSTAT OU QUESTION DE L'UTILISATEUR :
{{question}}

RÉPONSE :"""


def get_active_skills(db: Session) -> List[Skill]:
    """Retrieve all active skills, ordered with system/default skills first."""
    return (
        db.query(Skill)
        .filter(Skill.is_active == True)
        .order_by(Skill.is_system.desc(), Skill.name.asc())
        .all()
    )


def get_skill_by_identifier(db: Session, identifier: Optional[Union[int, str]] = None) -> Optional[Skill]:
    """Find a skill by ID or slug. Falls back to default 'cyber-audit-dnssi' or first active skill."""
    if identifier is not None:
        if isinstance(identifier, int) or (isinstance(identifier, str) and identifier.isdigit()):
            skill = db.query(Skill).filter(Skill.id == int(identifier)).first()
            if skill:
                return skill
        
        # Search by slug
        slug_str = str(identifier).strip().lower()
        skill = db.query(Skill).filter(Skill.slug == slug_str).first()
        if skill:
            return skill

    # Fallback 1: 'cyber-audit-dnssi'
    default_skill = db.query(Skill).filter(Skill.slug == "cyber-audit-dnssi").first()
    if default_skill:
        return default_skill

    # Fallback 2: First active skill
    first_active = db.query(Skill).filter(Skill.is_active == True).first()
    return first_active


def sync_skills_from_disk(db: Session) -> Dict[str, Any]:
    """Scan backend/app/skills/ directory and upsert skills into the database."""
    if not os.path.exists(SKILLS_DIR):
        log_warning(f"Skills directory {SKILLS_DIR} does not exist.", context="skill_service")
        return {"synced": 0, "errors": [f"Directory {SKILLS_DIR} not found"]}

    synced = []
    errors = []

    for folder_name in os.listdir(SKILLS_DIR):
        folder_path = os.path.join(SKILLS_DIR, folder_name)
        if not os.path.isdir(folder_path):
            continue

        skill_md_path = os.path.join(folder_path, "SKILL.md")
        if not os.path.isfile(skill_md_path):
            continue

        try:
            with open(skill_md_path, "r", encoding="utf-8") as f:
                content = f.read()

            meta, body = parse_skill_md(content)
            slug = meta.get("slug") or folder_name.lower().strip()
            name = meta.get("name") or folder_name.replace("-", " ").title()
            description = meta.get("description", "")
            icon = meta.get("icon", "Sparkles")
            temp = meta.get("temperature", 0.5)
            is_default = bool(meta.get("is_default", False))

            existing = db.query(Skill).filter(Skill.slug == slug).first()
            now = datetime.now(timezone.utc)

            if existing:
                existing.name = name
                existing.description = description
                existing.icon = icon
                existing.content_md = content
                existing.system_prompt = body
                existing.frontmatter = meta
                existing.temperature = float(temp) if temp is not None else None
                existing.updated_at = now
            else:
                new_skill = Skill(
                    name=name,
                    slug=slug,
                    description=description,
                    icon=icon,
                    content_md=content,
                    system_prompt=body,
                    frontmatter=meta,
                    temperature=float(temp) if temp is not None else None,
                    is_active=True,
                    is_system=True,
                    created_at=now,
                    updated_at=now,
                )
                db.add(new_skill)

            synced.append(slug)
        except Exception as e:
            msg = f"Failed to sync {skill_md_path}: {e}"
            log_error(e, context="sync_skills_from_disk", path=skill_md_path)
            errors.append(msg)

    db.commit()
    log_info(f"Synchronized {len(synced)} skills from disk.", context="skill_service", synced=synced)
    return {"synced": len(synced), "slugs": synced, "errors": errors}
