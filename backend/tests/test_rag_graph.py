import json
import tempfile
import unittest
from pathlib import Path

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command

from app.services.rag_graph import VERSION, build_rag_graph

TEXT = "Les sauvegardes sont exécutées chaque jour et conservées pendant trente jours."
DOC = {"file_id": 1, "name": "Politique.pdf", "page": 3, "text": TEXT}
DRAFT = {"sufficient": True, "claims": [{"text": "Les sauvegardes sont quotidiennes.",
         "evidence": [{"source_id": "S1", "quote": "Les sauvegardes sont exécutées chaque jour"}]}]}


class Scenario:
    def __init__(self, documents=None, drafts=None, grounded=True):
        self.documents = [DOC] if documents is None else documents
        self.drafts = drafts or [DRAFT]
        self.grounded = grounded
        self.searches = self.generations = self.checks = self.authorizations = 0
        self.revoked = False

    async def authorize(self, ids):
        self.authorizations += 1
        if self.revoked or ids != [1]:
            raise PermissionError("Access revoked")

    async def retrieve(self, query, ids):
        self.searches += 1
        return self.documents

    async def complete(self, system, payload):
        if "supported_claims" in system:
            self.checks += 1
            return json.dumps({"supported_claims": [0] if self.grounded else [],
                               "answers_question": True, "safe": True})
        if "Reformule" in system:
            return "fréquence des sauvegardes"
        value = self.drafts[min(self.generations, len(self.drafts) - 1)]
        self.generations += 1
        return value if isinstance(value, str) else json.dumps(value)

    def graph(self, saver):
        return build_rag_graph(self.retrieve, self.complete, self.authorize, saver)


def state(review=False):
    return {"version": VERSION, "question": "Quelle est la fréquence des sauvegardes ?",
            "file_ids": [1], "require_review": review, "trace": [], "checks": []}


class RagGraphTests(unittest.IsolatedAsyncioTestCase):
    async def test_answer_has_verified_source_and_no_review_by_default(self):
        scenario = Scenario()
        result = await scenario.graph(InMemorySaver()).ainvoke(state(), {"configurable": {"thread_id": "normal"}})
        self.assertEqual(result["status"], "completed")
        self.assertIn("[S1]", result["answer"])
        self.assertTrue(result["checks"][0]["citations_valid"])
        self.assertGreaterEqual(scenario.authorizations, 3)

    async def test_no_sources_abstains_after_one_extra_search(self):
        scenario = Scenario(documents=[])
        result = await scenario.graph(InMemorySaver()).ainvoke(state(), {"configurable": {"thread_id": "empty"}})
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(scenario.searches, 2)
        self.assertEqual(scenario.generations, 0)

    async def test_fake_citation_is_repaired_once(self):
        bad = json.loads(json.dumps(DRAFT))
        bad["claims"][0]["evidence"][0]["source_id"] = "S999"
        scenario = Scenario(drafts=[bad, DRAFT])
        result = await scenario.graph(InMemorySaver()).ainvoke(state(), {"configurable": {"thread_id": "repair"}})
        self.assertEqual(result["status"], "completed")
        self.assertEqual(scenario.generations, 2)
        self.assertFalse(result["checks"][0]["citations_valid"])

    async def test_existing_source_does_not_validate_fabricated_quote(self):
        bad = json.loads(json.dumps(DRAFT))
        bad["claims"][0]["evidence"][0]["quote"] = "Les sauvegardes sont mensuelles"
        scenario = Scenario(drafts=[bad])
        result = await scenario.graph(InMemorySaver()).ainvoke(state(), {"configurable": {"thread_id": "quote"}})
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(scenario.generations, 2)
        self.assertEqual(scenario.checks, 0)
        self.assertEqual(result["claims"], [])

    async def test_semantically_unsupported_claim_abstains(self):
        scenario = Scenario(grounded=False)
        result = await scenario.graph(InMemorySaver()).ainvoke(state(), {"configurable": {"thread_id": "meaning"}})
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(scenario.checks, 2)

    async def test_invalid_json_does_not_escape_into_answer(self):
        scenario = Scenario(drafts=['<script>alert("secret")</script>'])
        result = await scenario.graph(InMemorySaver()).ainvoke(state(), {"configurable": {"thread_id": "bad"}})
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertNotIn("script", result["answer"])

    async def test_foreign_document_is_rejected_before_generation(self):
        scenario = Scenario(documents=[{**DOC, "file_id": 2}])
        with self.assertRaises(PermissionError):
            await scenario.graph(InMemorySaver()).ainvoke(state(), {"configurable": {"thread_id": "scope"}})
        self.assertEqual(scenario.generations, 0)

    async def test_hitl_survives_checkpointer_and_graph_recreation(self):
        scenario = Scenario()
        config = {"configurable": {"thread_id": "durable-review"}}
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            path = str(Path(folder) / "checkpoints.sqlite")
            async with AsyncSqliteSaver.from_conn_string(path) as saver:
                graph = scenario.graph(saver)
                await graph.ainvoke(state(review=True), config)
                saved = await graph.aget_state(config)
                self.assertEqual(saved.values["status"], "awaiting_review")
                self.assertNotIn("answer", saved.values)
                digest = saved.values["draft_hash"]
            async with AsyncSqliteSaver.from_conn_string(path) as saver:
                result = await scenario.graph(saver).ainvoke(Command(resume={"action": "approve", "draft_hash": digest}), config)
                self.assertEqual(result["status"], "completed")
                self.assertEqual(result["review"]["action"], "approve")
                self.assertEqual(scenario.generations, 1)

    async def test_rejection_does_not_publish_draft(self):
        scenario = Scenario()
        graph = scenario.graph(InMemorySaver())
        config = {"configurable": {"thread_id": "reject"}}
        await graph.ainvoke(state(review=True), config)
        saved = await graph.aget_state(config)
        result = await graph.ainvoke(Command(resume={"action": "reject", "draft_hash": saved.values["draft_hash"]}), config)
        self.assertEqual(result["status"], "rejected")
        self.assertNotIn("quotidiennes", result["answer"])

    async def test_stale_approval_is_rejected(self):
        scenario = Scenario()
        graph = scenario.graph(InMemorySaver())
        config = {"configurable": {"thread_id": "stale"}}
        await graph.ainvoke(state(review=True), config)
        with self.assertRaises(ValueError):
            await graph.ainvoke(Command(resume={"action": "approve", "draft_hash": "0" * 64}), config)

    async def test_access_revocation_blocks_resume(self):
        scenario = Scenario()
        graph = scenario.graph(InMemorySaver())
        config = {"configurable": {"thread_id": "revoked"}}
        await graph.ainvoke(state(review=True), config)
        saved = await graph.aget_state(config)
        scenario.revoked = True
        with self.assertRaises(PermissionError):
            await graph.ainvoke(Command(resume={"action": "approve", "draft_hash": saved.values["draft_hash"]}), config)


if __name__ == "__main__":
    unittest.main()
