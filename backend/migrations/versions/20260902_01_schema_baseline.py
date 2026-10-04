"""Create the managed schema and migrate existing document chat history.

Revision ID: 20260902_01
Revises:
Create Date: 2026-09-02
"""

from alembic import op

from app.db.models import Base


revision = "20260902_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create missing tables and make existing installations compatible."""
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)

    if bind.dialect.name != "postgresql":
        return

    op.execute("ALTER TABLE chats ADD COLUMN IF NOT EXISTS document_conversation_id INTEGER")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_chats_document_conversation "
        "ON chats(document_conversation_id, id DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_uploaded_files_owner_status "
        "ON uploaded_files(owner_id, processing_status)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_uploaded_files_type_date "
        "ON uploaded_files(file_type, upload_date DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_chats_user_file_conversation "
        "ON chats(user_id, uploaded_file_id, document_conversation_id, id DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_general_conversations_owner_updated "
        "ON general_conversations(owner_id, updated_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_general_chat_messages_conversation "
        "ON general_chat_messages(conversation_id, id DESC)"
    )

    # Old document-chat rows predate named document conversations. Preserve
    # their history by grouping them into one recoverable conversation per file.
    op.execute(
        """
        INSERT INTO document_conversations
            (owner_id, uploaded_file_id, title, created_at, updated_at)
        SELECT
            chats.user_id,
            chats.uploaded_file_id,
            'Conversation existante',
            MIN(COALESCE(chats.created_at_question, chats.created_at_response)),
            MAX(COALESCE(chats.created_at_response, chats.created_at_question))
        FROM chats
        WHERE chats.document_conversation_id IS NULL
        GROUP BY chats.user_id, chats.uploaded_file_id
        """
    )
    op.execute(
        """
        UPDATE chats
        SET document_conversation_id = document_conversations.id
        FROM document_conversations
        WHERE chats.document_conversation_id IS NULL
          AND chats.user_id = document_conversations.owner_id
          AND chats.uploaded_file_id = document_conversations.uploaded_file_id
        """
    )


def downgrade() -> None:
    # This is a baseline for a live schema. Rolling it back must not erase user
    # documents, conversations, or messages.
    pass
