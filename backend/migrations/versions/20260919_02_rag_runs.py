"""Durable owner-scoped LangGraph runs and isolated checkpoint schema."""
from alembic import op
from app.db.models import RagRun, Project

revision = "20260919_02"
down_revision = "20260902_01"
branch_labels = None
depends_on = None


def upgrade():
    # The baseline uses current model metadata; satisfy the current run FK too.
    Project.__table__.create(op.get_bind(), checkfirst=True)
    RagRun.__table__.create(op.get_bind(), checkfirst=True)
    op.execute("CREATE SCHEMA IF NOT EXISTS aitheris_graph")


def downgrade():
    # Preserve checkpoints for recovery. Their retention is an explicit admin operation.
    RagRun.__table__.drop(op.get_bind(), checkfirst=True)
