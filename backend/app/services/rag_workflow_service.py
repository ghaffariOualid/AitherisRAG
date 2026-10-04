"""Production adapters for the RAG graph: permissions, retrieval, LLM, checkpoints."""
from __future__ import annotations

import asyncio
import hashlib
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import OperationalError

from app.db.models import RagRun, UploadedFile, Project
from app.services.project_service import require_project, accessible_projects
from sqlalchemy import or_, and_
from app.services.rag_graph import VERSION, build_rag_graph

RUN_TIMEOUT = 180
SAFE_ERROR = "L'analyse a été interrompue. Vous pouvez reprendre son exécution sauvegardée."


def file_version(file):
    # Includes processing task identity: reindexing invalidates a pending approval.
    value = [file.id, file.file_name, file.embedding_path, file.file_size,
             str(file.upload_date), file.task_id, file.processing_status]
    return hashlib.sha256(json.dumps(value, ensure_ascii=False).encode()).hexdigest()


def authorized_documents(db, owner_id, file_ids, versions=None, project_id=None):
    if project_id is not None:
        from app.services.project_service import require_project_documents
        require_project_documents(db, project_id, owner_id, file_ids)
    if not file_ids:
        raise HTTPException(422, "Sélectionnez au moins un document.")
    query = db.query(UploadedFile)
    if project_id is None:
        query = query.filter(UploadedFile.owner_id == owner_id)
    files = query.filter(
        UploadedFile.id.in_(file_ids),
        UploadedFile.processing_status == "completed", UploadedFile.embedding_path.isnot(None),
    ).populate_existing().all()
    if {f.id for f in files} != set(file_ids):
        raise HTTPException(409, "Un document n'est plus accessible ou son traitement n'est pas terminé.")
    if versions and any(versions.get(str(f.id)) != file_version(f) for f in files):
        raise HTTPException(409, "Les documents ont changé. Lancez une nouvelle analyse.")
    return files


def owned_run(db, run_id, owner_id, lock=False):
    projects = accessible_projects(db, owner_id).with_entities(Project.id)
    query = db.query(RagRun).filter(RagRun.id == str(run_id), or_(
        RagRun.project_id.in_(projects), and_(RagRun.project_id.is_(None), RagRun.owner_id == owner_id)))
    if lock:
        query = query.with_for_update(nowait=True)
    try:
        run = query.populate_existing().first()
    except OperationalError as exc:
        db.rollback()
        if getattr(exc.orig, "pgcode", None) == "55P03" or getattr(exc.orig, "sqlstate", None) == "55P03":
            raise HTTPException(409, "Cette analyse est déjà en cours.") from exc
        raise
    if run is None:
        raise HTTPException(404, "Analyse introuvable.")
    return run


def serialize_run(run, detail=True):
    data = {"id": run.id, "project_id": run.project_id, "question": run.question, "status": run.status,
            "file_ids": run.file_ids, "require_review": run.require_review,
            "graph_version": run.graph_version, "created_at": run.created_at,
            "updated_at": run.updated_at, "error": run.error}
    if detail:
        data["result"] = run.result
        data["review"] = {"decision": run.review_decision, "reviewer_id": run.reviewer_id,
                          "reviewed_at": run.reviewed_at}
    return data


def checkpoint_connection_string():
    from app.config import DATABASE_URL
    from psycopg.conninfo import make_conninfo
    url = DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://", 1)
    return make_conninfo(url, options="-c search_path=aitheris_graph", connect_timeout=10)


@asynccontextmanager
async def checkpoint_store():
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    async with AsyncPostgresSaver.from_conn_string(checkpoint_connection_string()) as saver:
        yield saver


async def setup_checkpoints():
    """Run once at startup after Alembic has created the dedicated schema."""
    async with checkpoint_store() as saver:
        # setup uses CREATE INDEX CONCURRENTLY: autocommit is enabled by the saver.
        await saver.conn.execute("SELECT pg_advisory_lock(8192026)")
        try:
            await saver.setup()
        finally:
            await saver.conn.execute("SELECT pg_advisory_unlock(8192026)")


def production_graph(db, run, saver, actor_id=None, action='contribute'):
    actor_id = run.owner_id if actor_id is None else actor_id
    async def authorize(ids):
        if ids != run.file_ids:
            raise PermissionError("Checkpoint scope mismatch")
        if run.project_id:
            require_project(db, run.project_id, actor_id, action)
        authorized_documents(db, actor_id, ids, run.document_versions, run.project_id)

    async def retrieve(query, ids):
        from app.services.rag_pipeline import get_rag_pipeline, RAGConfig
        files = authorized_documents(db, actor_id, ids, run.document_versions, run.project_id)
        names = {f.id: f.file_name for f in files}
        # Collections remain owner-scoped. Only explicitly authorized IDs are searched.
        groups = {}
        for file in files:
            groups.setdefault(file.owner_id, []).append(file.id)
        passages = []
        for document_owner, document_ids in groups.items():
            await authorize(ids)
            context = await get_rag_pipeline().retrieve(
                query=query, user_id=document_owner, file_ids=document_ids,
                max_tokens=6000, config=RAGConfig(enable_expansion=False, enable_verification=False, max_tokens=6000),
            )
            batch = []
            for chunk in context.chunks:
                if chunk.file_id not in document_ids:
                    raise PermissionError("Unexpected document returned by retrieval")
                batch.append({"file_id": chunk.file_id, "name": names[chunk.file_id],
                              "page": chunk.page, "text": chunk.text})
            passages.append(batch)
        # Interleave ranked lists: one contributor must not consume every source slot.
        output = []
        for index in range(max((len(batch) for batch in passages), default=0)):
            output.extend(batch[index] for batch in passages if index < len(batch))
        return output

    async def complete(system, payload):
        await authorize(run.file_ids)
        from openai import AsyncOpenAI
        from app.services.llm_gateway import rag_llm as llm
        if llm is None or not hasattr(llm, "client"):
            raise RuntimeError("No compatible LLM configured")
        # Only the configured primary provider; no implicit cross-provider data transfer.
        async with AsyncOpenAI(api_key=llm.client.api_key, base_url=llm.client.base_url,
                               timeout=50, max_retries=0) as client:
            response = await client.chat.completions.create(
                model=llm.model, temperature=0, max_tokens=2200,
                messages=[{"role": "system", "content": system},
                          {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
            )
        if response.choices[0].finish_reason == "length":
            raise ValueError("Model output budget exceeded")
        return response.choices[0].message.content or ""

    return build_rag_graph(retrieve, complete, authorize, saver)


def initial_state(run):
    return {"version": VERSION, "question": run.question, "file_ids": run.file_ids,
            "require_review": run.require_review, "retrieval_attempts": 0,
            "generation_attempts": 0, "checks": [], "trace": [], "status": "running"}


async def execute_run(db, run, decision=None, actor_id=None):
    """Caller holds the owner-scoped row lock until completion; checkpoint writes are separate."""
    from langgraph.types import Command
    actor_id = run.owner_id if actor_id is None else actor_id
    action = 'review' if decision is not None else 'contribute'
    if run.project_id:
        require_project(db, run.project_id, actor_id, action)
    if run.graph_version != VERSION:
        raise HTTPException(409, "Cette analyse utilise une ancienne version. Lancez une nouvelle analyse.")
    authorized_documents(db, actor_id, run.file_ids, run.document_versions, run.project_id)
    config = {"configurable": {"thread_id": run.id}, "recursion_limit": 24}
    try:
        async with asyncio.timeout(RUN_TIMEOUT):
            async with checkpoint_store() as saver:
                graph = production_graph(db, run, saver, actor_id, action)
                snapshot = await graph.aget_state(config)
                if snapshot.values.get("status") in {"completed", "rejected", "insufficient_evidence"} and not snapshot.next:
                    # Recover a successful graph execution whose envelope commit was lost.
                    state = snapshot.values
                else:
                    if decision is not None:
                        if snapshot.values.get("draft_hash") != decision["draft_hash"] or not snapshot.next:
                            raise HTTPException(409, "Cette validation est périmée. Actualisez l'analyse.")
                        graph_input = Command(resume=decision)
                    elif snapshot.values.get("status") == "awaiting_review":
                        graph_input = None
                    else:
                        graph_input = None if snapshot.values else initial_state(run)
                    if snapshot.values.get("status") == "awaiting_review" and decision is None:
                        state = snapshot.values
                    else:
                        await graph.ainvoke(graph_input, config)
                        state = (await graph.aget_state(config)).values
                if run.project_id:
                    require_project(db, run.project_id, actor_id, action)
                authorized_documents(db, actor_id, run.file_ids, run.document_versions, run.project_id)
                run.result = {key: state.get(key) for key in (
                    "answer", "claims", "sources", "checks", "trace", "draft_hash",
                    "grounded", "retrieval_attempts", "generation_attempts")}
                run.status = state["status"]
                recorded = state.get("review")
                if recorded:
                    run.review_decision = recorded["action"]
                    run.review_hash = recorded["draft_hash"]
                    run.reviewer_id = recorded.get("reviewer_id", run.owner_id)
                    run.reviewed_at = datetime.fromisoformat(recorded["reviewed_at"])
                run.error = None
    except HTTPException:
        raise
    except Exception as exc:
        # Never return provider errors, raw prompts, credentials, or unverified drafts.
        from app.utils.logger import log_warning
        log_warning("RAG graph failed", context="rag_graph", run_id=run.id, error_type=type(exc).__name__)
        run.status, run.error = "failed", SAFE_ERROR
    if run.project_id:
        require_project(db, run.project_id, actor_id, action)
    authorized_documents(db, actor_id, run.file_ids, run.document_versions, run.project_id)
    run.updated_at = datetime.now(timezone.utc)
    db.commit()
    return serialize_run(run)
