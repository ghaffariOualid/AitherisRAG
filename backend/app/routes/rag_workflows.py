"""Project RAG runs. Identity and checkpoint IDs are never accepted from the model."""
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import RagRun, User
from app.services.rag_graph import VERSION
from app.services.rag_workflow_service import (
    authorized_documents, execute_run, file_version, owned_run, serialize_run,
)
from app.services.project_service import require_project
from app.utils.auth import get_current_user

router = APIRouter()


class RunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    project_id: UUID
    question: str = Field(min_length=3, max_length=4000)
    file_ids: list[int] = Field(min_length=1, max_length=50)
    require_review: bool = False

    @field_validator("question")
    @classmethod
    def question_not_blank(cls, value):
        if len(value.strip()) < 3:
            raise ValueError("La question doit contenir au moins trois caractères.")
        return value.strip()

    @field_validator("file_ids")
    @classmethod
    def valid_files(cls, value):
        if any(v <= 0 for v in value):
            raise ValueError("Invalid document ID")
        return sorted(set(value))


class ReviewDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["approve", "reject"]
    draft_hash: str = Field(pattern=r"^[a-f0-9]{64}$")


def require_ready(request: Request):
    if not getattr(request.app.state, "rag_graph_ready", False):
        raise HTTPException(503, "Le moteur RAG contrôlé n'est pas prêt. Vérifiez les migrations et la connexion PostgreSQL.")


@router.get("/capabilities")
def capabilities(request: Request, user_id: int = Depends(get_current_user)):
    return {"ready": bool(getattr(request.app.state, "rag_graph_ready", False)),
            "graph_version": VERSION, "review_mode": "project_admin", "daily_run_limit": 50}


@router.get("/runs")
def list_runs(project_id: UUID, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.services.project_service import require_project
    require_project(db, project_id, user_id)
    runs = db.query(RagRun).filter(RagRun.project_id == str(project_id)).order_by(RagRun.created_at.desc()).limit(50).all()
    return {"runs": [serialize_run(run, detail=False) for run in runs]}


@router.get("/runs/{run_id}")
def get_run(run_id: UUID, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    run = owned_run(db, run_id, user_id)
    # Revocation or reindexing also blocks access to cached source excerpts.
    authorized_documents(db, user_id, run.file_ids, run.document_versions, run.project_id)
    return serialize_run(run)


@router.post("/runs", dependencies=[Depends(require_ready)])
async def start_run(body: RunCreate, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    require_project(db, body.project_id, user_id, "contribute")
    # Serialize short creation transactions per owner to make the daily limit exact.
    db.query(User).filter(User.id == user_id).with_for_update().first()
    existing = db.query(RagRun).filter(RagRun.id == str(body.id)).first()
    if existing:
        if existing.owner_id != user_id:
            raise HTTPException(404, "Analyse introuvable.")
        if (existing.question, existing.file_ids, existing.require_review, existing.project_id) != (body.question, body.file_ids, body.require_review, str(body.project_id)):
            raise HTTPException(409, "Cet identifiant appartient à une autre demande.")
        authorized_documents(db, user_id, existing.file_ids, existing.document_versions, existing.project_id)
        return serialize_run(existing)
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    if db.query(RagRun).filter(RagRun.owner_id == user_id, RagRun.created_at >= cutoff).count() >= 50:
        raise HTTPException(429, "Limite de 50 analyses sur 24 heures atteinte.")
    files = authorized_documents(db, user_id, body.file_ids, project_id=str(body.project_id))
    run = RagRun(id=str(body.id), project_id=str(body.project_id), owner_id=user_id, question=body.question, file_ids=body.file_ids,
                 document_versions={str(f.id): file_version(f) for f in files}, require_review=body.require_review,
                 graph_version=VERSION, status="running")
    db.add(run)
    db.commit()
    run = owned_run(db, body.id, user_id, lock=True)
    return await execute_run(db, run, actor_id=user_id)


@router.post("/runs/{run_id}/resume", dependencies=[Depends(require_ready)])
async def resume_run(run_id: UUID, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    run = owned_run(db, run_id, user_id, lock=True)
    if run.project_id:
        require_project(db, run.project_id, user_id, "contribute")
    authorized_documents(db, user_id, run.file_ids, run.document_versions, run.project_id)
    if run.status not in {"running", "failed", "created"}:
        return serialize_run(run)
    return await execute_run(db, run, actor_id=user_id)


@router.post("/runs/{run_id}/review", dependencies=[Depends(require_ready)])
async def review_run(run_id: UUID, body: ReviewDecision, user_id: int = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    run = owned_run(db, run_id, user_id, lock=True)
    authorized_documents(db, user_id, run.file_ids, run.document_versions, run.project_id)
    if run.project_id:
        require_project(db, run.project_id, user_id, "review")
    if run.review_decision:
        if run.review_decision == body.action and run.review_hash == body.draft_hash:
            return serialize_run(run)  # Idempotent double-click / network retry.
        raise HTTPException(409, "Une décision a déjà été enregistrée pour cette version.")
    if run.status not in {"awaiting_review", "failed"} or not run.require_review:
        raise HTTPException(409, "Cette analyse n'attend pas de validation.")
    if not run.result or run.result.get("draft_hash") != body.draft_hash:
        raise HTTPException(409, "La version affichée est périmée. Actualisez l'analyse.")
    decision = {**body.model_dump(), "reviewer_id": user_id, "reviewed_at": datetime.now(timezone.utc).isoformat()}
    return await execute_run(db, run, decision=decision, actor_id=user_id)
