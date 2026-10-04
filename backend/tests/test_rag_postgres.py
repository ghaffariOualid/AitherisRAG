"""Optional isolated PostgreSQL integration tests; never point this at a project DB.

Set RAG_TEST_DATABASE_URL to an empty disposable database (psycopg URL).
"""
import os
import asyncio
import sys
import unittest
from unittest.mock import patch, AsyncMock
from types import SimpleNamespace, ModuleType
import importlib
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.types import Command

from app.db.models import Base, User, UploadedFile, RagRun, Project, ProjectDocument, ProjectMember
from app.services.rag_workflow_service import authorized_documents, file_version, owned_run, production_graph, execute_run
from test_rag_graph import Scenario, state

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@unittest.skipUnless(os.getenv('RAG_TEST_DATABASE_URL'), 'Disposable PostgreSQL required')
class PostgresTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.url = os.environ['RAG_TEST_DATABASE_URL']
        self.engine = create_engine(self.url)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        user = User(user_name=str(uuid4()))
        self.db.add(user)
        self.db.flush()
        self.owner = user.id
        self.file = UploadedFile(owner_id=self.owner, file_name='policy.pdf',
            embedding_path='collection', processing_status='completed', task_id='original')
        self.db.add(self.file)
        self.db.flush()
        self.db.refresh(self.file)
        self.run = RagRun(id=str(uuid4()), owner_id=self.owner, question='Test question',
            file_ids=[self.file.id], document_versions={str(self.file.id): file_version(self.file)},
            graph_version='rag-v1', status='running')
        self.db.add(self.run)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def collaboration(self, role='reader'):
        user = User(user_name=str(uuid4()))
        project = Project(id=str(uuid4()), owner_id=self.owner, name='Shared')
        self.db.add_all([user, project]); self.db.flush()
        member = ProjectMember(project_id=project.id, user_id=user.id, role=role)
        self.db.add_all([member, ProjectDocument(project_id=project.id, file_id=self.file.id)])
        self.run.project_id = project.id
        self.db.commit()
        return user, project, member

    async def test_roles_and_revocation_block_cached_analysis(self):
        from app.services.project_service import require_project
        user, project, member = self.collaboration()
        self.assertEqual(owned_run(self.db, self.run.id, user.id).id, self.run.id)
        self.assertEqual(len(authorized_documents(self.db, user.id, [self.file.id], project_id=project.id)), 1)
        for action in ['contribute', 'review', 'manage_members']:
            with self.assertRaises(HTTPException) as denied:
                require_project(self.db, project.id, user.id, action)
            self.assertEqual(denied.exception.status_code, 403)
        member.role = 'contributor'; self.db.commit()
        require_project(self.db, project.id, user.id, 'contribute')
        with self.assertRaises(HTTPException):
            require_project(self.db, project.id, user.id, 'review')
        member.role = 'admin'; self.db.commit()
        require_project(self.db, project.id, user.id, 'review')
        with self.assertRaises(HTTPException):
            require_project(self.db, project.id, user.id, 'manage_members')
        with Session(self.engine) as other:
            other.delete(other.get(ProjectMember, (project.id, user.id))); other.commit()
        with self.assertRaises(HTTPException):
            owned_run(self.db, self.run.id, user.id)
        with self.assertRaises(HTTPException):
            await execute_run(self.db, self.run, actor_id=user.id)

    async def test_retrieval_searches_each_owner_with_only_project_ids(self):
        user, project, member = self.collaboration('contributor')
        shared = UploadedFile(owner_id=user.id, file_name='shared.pdf', embedding_path='other', processing_status='completed')
        self.db.add(shared); self.db.flush()
        self.db.refresh(shared)
        self.db.add(ProjectDocument(project_id=project.id, file_id=shared.id))
        self.run.file_ids = [self.file.id, shared.id]
        self.run.document_versions = {str(f.id): file_version(f) for f in [self.file, shared]}
        self.db.commit()
        async def retrieve(**kwargs):
            return SimpleNamespace(chunks=[SimpleNamespace(file_id=i, page=1, text='A quoted source passage') for i in kwargs['file_ids']])
        pipeline = SimpleNamespace(retrieve=AsyncMock(side_effect=retrieve))
        module = ModuleType('app.services.rag_pipeline')
        module.get_rag_pipeline = lambda: pipeline
        module.RAGConfig = lambda **kwargs: kwargs
        with patch.dict(sys.modules, {'app.services.rag_pipeline': module}), patch('app.services.rag_workflow_service.build_rag_graph', side_effect=lambda *args: args):
            retrieve_callback, _, authorize, _ = production_graph(self.db, self.run, None, user.id)
            output = await retrieve_callback('Question', self.run.file_ids)
            self.assertEqual({item['file_id'] for item in output}, set(self.run.file_ids))
            calls = {call.kwargs['user_id']: call.kwargs['file_ids'] for call in pipeline.retrieve.await_args_list}
            self.assertEqual(calls, {self.owner: [self.file.id], user.id: [shared.id]})
            member.role = 'reader'; self.db.commit()
            with self.assertRaises(HTTPException):
                await authorize(self.run.file_ids)

    async def test_member_routes_protect_owner_and_prevent_role_escalation(self):
        user, project, member = self.collaboration('admin')
        database, auth = ModuleType('app.db.database'), ModuleType('app.utils.auth')
        database.get_db = lambda: None
        auth.get_current_user = lambda: None
        with patch.dict(sys.modules, {'app.db.database': database, 'app.utils.auth': auth}):
            routes = importlib.import_module('app.routes.projects')
        body = routes.MemberInput(user_name=user.user_name, role='reader')
        with self.assertRaises(HTTPException):
            routes.set_member(project.id, body, user.id, self.db)
        with self.assertRaises(HTTPException):
            routes.remove_member(project.id, self.owner, self.owner, self.db)
        routes.set_member(project.id, body, self.owner, self.db)
        self.assertEqual(member.role, 'reader')
        with self.assertRaises(HTTPException):
            routes.attach_document(project.id, self.file.id, user.id, self.db)
        routes.remove_member(project.id, user.id, self.owner, self.db)
        with self.assertRaises(HTTPException):
            routes.project_documents(project.id, user.id, self.db)

    async def test_admin_review_records_actual_reviewer_and_reader_cannot_start(self):
        from contextlib import asynccontextmanager
        from langgraph.checkpoint.memory import InMemorySaver
        from app.services.rag_graph import build_rag_graph
        from app.services.rag_workflow_service import initial_state
        from test_rag_graph import DOC
        user, project, member = self.collaboration('reader')
        database, auth = ModuleType('app.db.database'), ModuleType('app.utils.auth')
        database.get_db = lambda: None
        auth.get_current_user = lambda: None
        with patch.dict(sys.modules, {'app.db.database': database, 'app.utils.auth': auth}):
            routes = importlib.import_module('app.routes.rag_workflows')
        body = routes.RunCreate(id=uuid4(), project_id=project.id, question='Question?', file_ids=[self.file.id])
        with self.assertRaises(HTTPException) as denied:
            await routes.start_run(body, user.id, self.db)
        self.assertEqual(denied.exception.status_code, 403)
        member.role = 'admin'; self.run.require_review = True; self.db.commit()
        saver = InMemorySaver()
        scenario = Scenario()
        async def retrieve(query, ids):
            return [{**DOC, 'file_id': self.file.id}]
        async def authorize(ids):
            authorized_documents(self.db, user.id, ids, self.run.document_versions, project.id)
        graph = build_rag_graph(retrieve, scenario.complete, authorize, saver)
        cfg = {'configurable': {'thread_id': self.run.id}}
        result = await graph.ainvoke(initial_state(self.run), cfg)
        self.run.status = 'awaiting_review'
        self.run.result = {'draft_hash': result['draft_hash']}
        self.db.commit()
        @asynccontextmanager
        async def store():
            yield saver
        with patch('app.services.rag_workflow_service.checkpoint_store', store), patch('app.services.rag_workflow_service.production_graph', return_value=graph):
            decision = routes.ReviewDecision(action='approve', draft_hash=result['draft_hash'])
            response = await routes.review_run(self.run.id, decision, user.id, self.db)
            self.assertEqual(response['status'], 'completed')
            self.assertEqual(response['review']['reviewer_id'], user.id)
            repeated = await routes.review_run(self.run.id, decision, user.id, self.db)
            self.assertEqual(repeated['review'], response['review'])

    async def test_project_scope_rejects_foreign_project_and_unattached_document(self):
        project = Project(id=str(uuid4()), owner_id=self.owner, name='Audit')
        other = Project(id=str(uuid4()), owner_id=self.owner, name='Other')
        self.db.add_all([project, other])
        self.db.flush()
        link = ProjectDocument(project_id=project.id, file_id=self.file.id)
        self.db.add(link)
        self.db.commit()
        self.assertEqual(len(authorized_documents(self.db, self.owner, [self.file.id], project_id=project.id)), 1)
        with self.assertRaises(HTTPException) as missing:
            authorized_documents(self.db, self.owner + 100000, [self.file.id], project_id=project.id)
        self.assertEqual(missing.exception.status_code, 404)
        with self.assertRaises(HTTPException) as wrong_scope:
            authorized_documents(self.db, self.owner, [self.file.id], project_id=other.id)
        self.assertEqual(wrong_scope.exception.status_code, 409)
        self.db.delete(link)
        self.db.commit()
        with self.assertRaises(HTTPException):
            authorized_documents(self.db, self.owner, [self.file.id], project_id=project.id)

    async def test_owner_scope_reindex_and_concurrent_lock(self):
        with self.assertRaises(HTTPException) as missing:
            owned_run(self.db, self.run.id, self.owner + 100000)
        self.assertEqual(missing.exception.status_code, 404)
        with self.assertRaises(HTTPException):
            authorized_documents(self.db, self.owner + 100000, [self.file.id])
        owned_run(self.db, self.run.id, self.owner, lock=True)
        with Session(self.engine) as second:
            with self.assertRaises(HTTPException) as busy:
                owned_run(second, self.run.id, self.owner, lock=True)
            self.assertEqual(busy.exception.status_code, 409)
        self.file.task_id = 'reindexed'
        self.db.commit()
        with self.assertRaises(HTTPException) as changed:
            authorized_documents(self.db, self.owner, [self.file.id], self.run.document_versions)
        self.assertEqual(changed.exception.status_code, 409)

    async def test_postgres_resume_on_fresh_connection(self):
        from psycopg.conninfo import make_conninfo
        with self.engine.begin() as conn:
            conn.execute(text('CREATE SCHEMA IF NOT EXISTS aitheris_graph'))
        conninfo = make_conninfo(self.url.replace('postgresql+psycopg://', 'postgresql://'),
                                options='-c search_path=aitheris_graph')
        config = {'configurable': {'thread_id': str(uuid4())}}
        scenario = Scenario()
        async with AsyncPostgresSaver.from_conn_string(conninfo) as saver:
            await saver.setup()
            graph = scenario.graph(saver)
            await graph.ainvoke(state(review=True), config)
            saved = await graph.aget_state(config)
            self.assertEqual(saved.values['status'], 'awaiting_review')
            digest = saved.values['draft_hash']
        async with AsyncPostgresSaver.from_conn_string(conninfo) as saver:
            result = await scenario.graph(saver).ainvoke(Command(resume={
                'action': 'approve', 'draft_hash': digest,
                'reviewed_at': datetime.now(timezone.utc).isoformat()}), config)
            self.assertEqual(result['status'], 'completed')
            self.assertEqual(scenario.generations, 1)
