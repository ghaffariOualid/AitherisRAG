"""Project collaboration roles."""
from alembic import op
from app.db.models import ProjectMember
revision = "20260920_04"
down_revision = "20260920_03"
branch_labels = None
depends_on = None

def upgrade():
    ProjectMember.__table__.create(op.get_bind(), checkfirst=True)

def downgrade():
    ProjectMember.__table__.drop(op.get_bind(), checkfirst=True)
