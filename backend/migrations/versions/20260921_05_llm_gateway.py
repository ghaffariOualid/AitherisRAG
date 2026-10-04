"""LLM Gateway providers table and user is_admin flag.

Revision ID: 20260921_05
Revises: 20260920_04
Create Date: 2026-09-21
"""
from alembic import op
import sqlalchemy as sa
from app.db.models import LLMProvider

revision = "20260921_05"
down_revision = "20260920_04"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    # Check if is_admin column already exists
    insp = sa.inspect(bind)
    columns = [c["name"] for c in insp.get_columns("users")]
    if "is_admin" not in columns:
        op.add_column(
            "users",
            sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false"))
        )
    LLMProvider.__table__.create(bind, checkfirst=True)


def downgrade():
    bind = op.get_bind()
    LLMProvider.__table__.drop(bind, checkfirst=True)
    insp = sa.inspect(bind)
    columns = [c["name"] for c in insp.get_columns("users")]
    if "is_admin" in columns:
        op.drop_column("users", "is_admin")
