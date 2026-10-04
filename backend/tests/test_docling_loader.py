from unittest.mock import MagicMock
from io import BytesIO
import pytest
from langchain_core.documents import Document

from app.utils.MinIODoclingLoader import MinIODoclingLoader


def test_minio_docling_loader_fallback_on_error():
    mock_minio = MagicMock()
    mock_response = MagicMock()
    # Provide simple bytes that would fail Docling
    mock_response.read.return_value = b"invalid pdf content"
    mock_minio.get_object.return_value = mock_response

    loader = MinIODoclingLoader(mock_minio, "test-bucket", "test.pdf")
    
    # Mocking _load_with_docling to simulate an exception
    loader._load_with_docling = MagicMock(side_effect=RuntimeError("Docling layout error"))
    # Mocking _fallback_pypdf to simulate fallback
    loader._fallback_pypdf = MagicMock(return_value=[
        Document(page_content="Fallback page 1 text", metadata={"source": "test.pdf", "page": 1})
    ])

    docs = loader.load()
    assert len(docs) == 1
    assert docs[0].page_content == "Fallback page 1 text"
    assert docs[0].metadata["page"] == 1
    assert docs[0].metadata["source"] == "test.pdf"
    loader._fallback_pypdf.assert_called_once()


def test_minio_docling_loader_successful_docling():
    mock_minio = MagicMock()
    mock_response = MagicMock()
    mock_response.read.return_value = b"%PDF-1.4 mock pdf bytes"
    mock_minio.get_object.return_value = mock_response

    loader = MinIODoclingLoader(mock_minio, "test-bucket", "policy.pdf")
    
    expected_docs = [
        Document(
            page_content="# Policy Title\n\n| Item | Value |\n|---|---|\n| A | 10 |",
            metadata={"source": "policy.pdf", "page": 1, "total_pages": 1}
        )
    ]
    loader._load_with_docling = MagicMock(return_value=expected_docs)

    docs = loader.load()
    assert len(docs) == 1
    assert docs[0].page_content.startswith("# Policy Title")
    assert docs[0].metadata["page"] == 1
    assert docs[0].metadata["total_pages"] == 1
    loader._load_with_docling.assert_called_once()
