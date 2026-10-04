from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, DateTime, Index, Float
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import json
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import JSONB
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, index=True)
    last_name = Column(String, index=True)
    user_name = Column(String, index=True, unique=True)
    email = Column(String, index=True, unique=True)
    hashed_password = Column(String)
    refresh_token = Column(String, nullable=True)
    email_verified = Column(Boolean, default=False) 
    email_verification_token = Column(String, nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)

    uploaded_files = relationship("UploadedFile", back_populates="owner")
    chats = relationship("Chat", back_populates="user")
    document_conversations = relationship(
        "DocumentConversation",
        back_populates="owner",
        cascade="all, delete-orphan"
    )
    general_conversations = relationship(
        "GeneralConversation",
        back_populates="owner",
        cascade="all, delete-orphan"
    )


    def update_refresh_token(self, refresh_token):
        self.refresh_token = refresh_token


class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, index=True)
    file_type = Column(String, index=True)
    file_path = Column(String)
    embedding_path = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    upload_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))  
    file_size = Column(Integer)  
    
    # Background processing status
    processing_status = Column(String, default="pending")  # pending, processing, completed, failed
    task_id = Column(String, nullable=True)  # Celery task ID
    error_message = Column(String, nullable=True)  # Error details if processing failed

    owner = relationship("User", back_populates="uploaded_files")
    chats = relationship("Chat", back_populates="uploaded_file")
    document_conversations = relationship(
        "DocumentConversation",
        back_populates="uploaded_file",
        cascade="all, delete-orphan"
    )


   
class Chat(Base):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True, index=True)
    question = Column(String , nullable=True)
    response = Column(String , nullable=True)
    source = Column(JSONB , nullable=True)
    created_at_question = Column(DateTime, default=func.now() , nullable=True)  # Timestamp for when the question was created
    created_at_response = Column(DateTime , nullable=True)  # Timestamp for when the response was created
    user_id = Column(Integer, ForeignKey("users.id"))
    uploaded_file_id = Column(Integer, ForeignKey("uploaded_files.id"))
    document_conversation_id = Column(Integer, ForeignKey("document_conversations.id"), nullable=True, index=True)

    user = relationship("User", back_populates="chats")
    uploaded_file = relationship("UploadedFile", back_populates="chats")
    document_conversation = relationship("DocumentConversation", back_populates="messages")
    def set_source(self, source):
        self.source = json.dumps(source)

    def get_source(self):
        return json.loads(self.source) if self.source else []


class DocumentConversation(Base):
    """A named, durable chat thread for a single uploaded document."""
    __tablename__ = "document_conversations"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    uploaded_file_id = Column(Integer, ForeignKey("uploaded_files.id"), nullable=False, index=True)
    title = Column(String(120), nullable=False, default="Nouvelle conversation")
    skill_id = Column(Integer, ForeignKey("skills.id"), nullable=True)
    skill_slug = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    owner = relationship("User", back_populates="document_conversations")
    uploaded_file = relationship("UploadedFile", back_populates="document_conversations")
    messages = relationship(
        "Chat",
        back_populates="document_conversation",
        cascade="all, delete-orphan",
        order_by="Chat.id"
    )


class GeneralConversation(Base):
    """A durable multi-document conversation owned by one user."""
    __tablename__ = "general_conversations"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(120), nullable=False, default="Nouvelle conversation")
    skill_id = Column(Integer, ForeignKey("skills.id"), nullable=True)
    skill_slug = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    owner = relationship("User", back_populates="general_conversations")
    messages = relationship(
        "GeneralChatMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="GeneralChatMessage.id"
    )


class GeneralChatMessage(Base):
    """One user or assistant message within a general conversation."""
    __tablename__ = "general_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("general_conversations.id"), nullable=False, index=True)
    role = Column(String(16), nullable=False)
    content = Column(Text, nullable=False)
    sources = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    conversation = relationship("GeneralConversation", back_populates="messages")


class ChatUsageEvent(Base):
    """A durable, per-user record of accepted chat requests for quota enforcement."""
    __tablename__ = "chat_usage_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("idx_chat_usage_events_user_created", "user_id", "created_at"),
    )


class Project(Base):
    __tablename__ = "projects"
    id = Column(String(36), primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class ProjectMember(Base):
    __tablename__ = "project_members"
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role = Column(String(20), nullable=False)


class ProjectDocument(Base):
    __tablename__ = "project_documents"
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    file_id = Column(Integer, ForeignKey("uploaded_files.id", ondelete="CASCADE"), primary_key=True)


class RagRun(Base):
    """Owner-scoped workflow envelope; graph checkpoints live in their own schema."""
    __tablename__ = "rag_runs"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    file_ids = Column(JSONB, nullable=False)
    document_versions = Column(JSONB, nullable=False)
    require_review = Column(Boolean, nullable=False, default=False)
    graph_version = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False, default="created", index=True)
    result = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    review_decision = Column(String(16), nullable=True)
    review_hash = Column(String(64), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class LLMProvider(Base):
    __tablename__ = "llm_providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    provider_type = Column(String(50), nullable=False)  # ollama, mistral, openai, groq, openrouter, custom
    base_url = Column(String(500), nullable=False)
    api_key = Column(String(500), nullable=True)  # encrypted string or None for local
    model_name = Column(String(150), nullable=False)
    temperature = Column(Float, default=0.6, nullable=False)
    max_tokens = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    priority = Column(Integer, default=0, nullable=False)  # 0 = primary, 1 = 1st fallback, etc.
    assigned_roles = Column(JSONB, default=list, nullable=False)  # e.g. ["chat", "rag", "summary", "query_expansion"]
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), default="Sparkles", nullable=False)
    content_md = Column(Text, nullable=False)
    system_prompt = Column(Text, nullable=False)
    frontmatter = Column(JSONB, default=dict, nullable=False)
    temperature = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    is_system = Column(Boolean, default=False, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

