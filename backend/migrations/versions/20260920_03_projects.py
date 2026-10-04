"""Personal projects and backfill of existing RAG analyses."""
from uuid import uuid4
from alembic import op
import sqlalchemy as sa
from app.db.models import Project, ProjectDocument

revision = "20260920_03"
down_revision = "20260919_02"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    Project.__table__.create(conn, checkfirst=True)
    ProjectDocument.__table__.create(conn, checkfirst=True)
    if "project_id" not in {c["name"] for c in sa.inspect(conn).get_columns("rag_runs")}:
        op.add_column("rag_runs", sa.Column("project_id", sa.String(36), nullable=True))
        op.create_foreign_key("fk_rag_runs_project", "rag_runs", "projects", ["project_id"], ["id"])
        op.create_index("ix_rag_runs_project_id", "rag_runs", ["project_id"])
    for user_id in conn.execute(sa.text("SELECT id FROM users")).scalars():
        project_id = str(uuid4())
        conn.execute(Project.__table__.insert().values(id=project_id, owner_id=user_id, name="Espace personnel"))
        conn.execute(sa.text("INSERT INTO project_documents (project_id, file_id) SELECT :project, id FROM uploaded_files WHERE owner_id = :owner"), {"project": project_id, "owner": user_id})
        conn.execute(sa.text("UPDATE rag_runs SET project_id = :project WHERE owner_id = :owner AND project_id IS NULL"), {"project": project_id, "owner": user_id})


def downgrade():
    op.drop_column("rag_runs", "project_id")
    ProjectDocument.__table__.drop(op.get_bind(), checkfirst=True)
    Project.__table__.drop(op.get_bind(), checkfirst=True)
