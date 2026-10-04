"""Configuration regression checks without downloading ML weights."""
import ast
import hashlib
import os
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load_collection_namer(model):
    tree = ast.parse((ROOT / "app/services/document_service.py").read_text(encoding="utf-8"))
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "get_user_collection_name")
    scope = {"EMBEDDING_MODEL": model, "hashlib": hashlib}
    exec(compile(ast.Module(body=[function], type_ignores=[]), "collection_namer", "exec"), scope)
    return scope[function.name]


class BGEConfigurationTests(unittest.TestCase):
    def test_defaults_use_bge(self):
        names = {"MODEL_NAME", "EMBEDDING_MODEL", "RERANKER_MODEL", "CROSS_ENCODER_MODEL"}
        tree = ast.parse((ROOT / "app/config.py").read_text(encoding="utf-8"))
        assignments = [n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets)]
        scope = {"os": os}
        with patch.dict(os.environ, {}, clear=True):
            exec(compile(ast.Module(body=assignments, type_ignores=[]), "config_defaults", "exec"), scope)
        self.assertEqual(scope["EMBEDDING_MODEL"], "BAAI/bge-m3")
        self.assertEqual(scope["MODEL_NAME"], scope["EMBEDDING_MODEL"])
        self.assertEqual(scope["RERANKER_MODEL"], "BAAI/bge-reranker-v2-m3")
        self.assertEqual(scope["CROSS_ENCODER_MODEL"], scope["RERANKER_MODEL"])

    def test_legacy_collection_preserved(self):
        self.assertEqual(load_collection_namer("sentence-transformers/all-MiniLM-L6-v2")(7), "user_7_knowledge")

    def test_embedding_spaces_and_users_are_isolated(self):
        bge = load_collection_namer("BAAI/bge-m3")
        legacy = load_collection_namer("sentence-transformers/all-MiniLM-L6-v2")
        self.assertNotEqual(bge(7), legacy(7))
        self.assertNotEqual(bge(7), bge(8))
        self.assertEqual(bge(7), load_collection_namer("BAAI/bge-m3")(7))

    def test_baai_identifier_is_not_prefixed(self):
        tree = ast.parse((ROOT / "app/config.py").read_text(encoding="utf-8"))
        block = next(n for n in ast.walk(tree) if isinstance(n, ast.If) and ast.unparse(n.test).startswith("'/' not in embedding_model_name"))
        scope = {"os": os, "embedding_model_name": "BAAI/bge-m3"}
        exec(compile(ast.Module(body=[block], type_ignores=[]), "normalize", "exec"), scope)
        self.assertEqual(scope["embedding_model_name"], "BAAI/bge-m3")


if __name__ == "__main__":
    unittest.main()
