"""Skills table and conversation skill associations.

Revision ID: 20260922_06
Revises: 20260921_05
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime, timezone
import json
import os
import re

revision = "20260922_06"
down_revision = "20260921_05"
branch_labels = None
depends_on = None


def _parse_frontmatter(content: str):
    """Simple robust YAML frontmatter parser."""
    meta = {}
    body = content.strip()
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
    if match:
        yaml_block, body = match.group(1), match.group(2)
        try:
            import yaml
            meta = yaml.safe_load(yaml_block) or {}
        except Exception:
            # Fallback line-by-line
            for line in yaml_block.splitlines():
                if ":" in line and not line.strip().startswith("-"):
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta, body.strip()


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Create skills table if not exists
    if not insp.has_table("skills"):
        op.create_table(
            "skills",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("slug", sa.String(100), nullable=False, unique=True, index=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("icon", sa.String(50), nullable=False, server_default="Sparkles"),
            sa.Column("content_md", sa.Text(), nullable=False),
            sa.Column("system_prompt", sa.Text(), nullable=False),
            sa.Column("frontmatter", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("temperature", sa.Float(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    # 2. Add skill_id and skill_slug to document_conversations if missing
    doc_cols = [c["name"] for c in insp.get_columns("document_conversations")]
    if "skill_id" not in doc_cols:
        op.add_column("document_conversations", sa.Column("skill_id", sa.Integer(), sa.ForeignKey("skills.id"), nullable=True))
    if "skill_slug" not in doc_cols:
        op.add_column("document_conversations", sa.Column("skill_slug", sa.String(100), nullable=True))

    # 3. Add skill_id and skill_slug to general_conversations if missing
    gen_cols = [c["name"] for c in insp.get_columns("general_conversations")]
    if "skill_id" not in gen_cols:
        op.add_column("general_conversations", sa.Column("skill_id", sa.Integer(), sa.ForeignKey("skills.id"), nullable=True))
    if "skill_slug" not in gen_cols:
        op.add_column("general_conversations", sa.Column("skill_slug", sa.String(100), nullable=True))

    # 4. Seed initial system skills
    skills_dir = os.path.join(os.path.dirname(__file__), "..", "..", "app", "skills")
    if os.path.exists(skills_dir):
        skills_table = sa.table(
            "skills",
            sa.column("name", sa.String),
            sa.column("slug", sa.String),
            sa.column("description", sa.Text),
            sa.column("icon", sa.String),
            sa.column("content_md", sa.Text),
            sa.column("system_prompt", sa.Text),
            sa.column("frontmatter", JSONB),
            sa.column("temperature", sa.Float),
            sa.column("is_active", sa.Boolean),
            sa.column("is_system", sa.Boolean),
            sa.column("created_at", sa.DateTime),
            sa.column("updated_at", sa.DateTime),
        )

        for folder in os.listdir(skills_dir):
            skill_path = os.path.join(skills_dir, folder, "SKILL.md")
            if os.path.isfile(skill_path):
                try:
                    with open(skill_path, "r", encoding="utf-8") as f:
                        raw_content = f.read()
                    meta, body = _parse_frontmatter(raw_content)
                    slug = meta.get("slug") or folder
                    name = meta.get("name") or folder.replace("-", " ").title()
                    desc = meta.get("description", "")
                    icon = meta.get("icon", "Sparkles")
                    temp = meta.get("temperature", 0.5)
                    now = datetime.now(timezone.utc)

                    # Check if already exists
                    existing = bind.execute(sa.text("SELECT id FROM skills WHERE slug = :s"), {"s": slug}).fetchone()
                    if not existing:
                        bind.execute(
                            skills_table.insert().values(
                                name=name,
                                slug=slug,
                                description=desc,
                                icon=icon,
                                content_md=raw_content,
                                system_prompt=body,
                                frontmatter=meta,
                                temperature=float(temp) if temp is not None else None,
                                is_active=True,
                                is_system=True,
                                created_at=now,
                                updated_at=now,
                            )
                        )
                except Exception as e:
                    print(f"Warning: Failed to seed skill from {skill_path}: {e}")


def downgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("document_conversations"):
        doc_cols = [c["name"] for c in insp.get_columns("document_conversations")]
        if "skill_slug" in doc_cols:
            op.drop_column("document_conversations", "skill_slug")
        if "skill_id" in doc_cols:
            op.drop_column("document_conversations", "skill_id")

    if insp.has_table("general_conversations"):
        gen_cols = [c["name"] for c in insp.get_columns("general_conversations")]
        if "skill_slug" in gen_cols:
            op.drop_column("general_conversations", "skill_slug")
        if "skill_id" in gen_cols:
            op.drop_column("general_conversations", "skill_id")

    if insp.has_table("skills"):
        op.drop_table("skills")
