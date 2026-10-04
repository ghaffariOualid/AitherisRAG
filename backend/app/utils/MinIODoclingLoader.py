"""
MinIO Docling PDF Loader.
Converts PDF documents retrieved from MinIO into LangChain Document objects
using IBM Docling for rich layout and table extraction, with page-level provenance.
"""
import time
from io import BytesIO
from typing import List

from langchain_core.document_loaders.base import BaseLoader
from langchain_core.documents import Document
from minio import Minio

from app.config import DOCLING_DO_OCR, DOCLING_TABLE_STRUCTURE
from app.utils.logger import log_info, log_warning, log_error


class MinIODoclingLoader(BaseLoader):
    """Loader for PDF documents from MinIO using Docling with pypdf fallback."""

    def __init__(self, minio_client: Minio, bucket_name: str, object_name: str):
        self.minio_client = minio_client
        self.bucket_name = bucket_name
        self.object_name = object_name

    def load(self) -> List[Document]:
        start_time = time.time()
        response = self.minio_client.get_object(
            bucket_name=self.bucket_name,
            object_name=self.object_name
        )
        pdf_bytes = response.read()
        response.close()
        response.release_conn()

        try:
            documents = self._load_with_docling(pdf_bytes)
            log_info(
                "Docling document conversion successful",
                context="document_loader",
                object_name=self.object_name,
                num_pages=len(documents),
                duration=time.time() - start_time
            )
            return documents
        except Exception as exc:
            log_warning(
                f"Docling conversion failed for {self.object_name}: {exc}. Falling back to pypdf.",
                context="document_loader",
                object_name=self.object_name,
            )
            return self._fallback_pypdf(pdf_bytes)

    def _load_with_docling(self, pdf_bytes: bytes) -> List[Document]:
        from docling.document_converter import DocumentConverter, PdfFormatOption
        from docling.datamodel.base_models import DocumentStream, InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions

        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = DOCLING_DO_OCR
        pipeline_options.do_table_structure = DOCLING_TABLE_STRUCTURE
        pipeline_options.generate_page_images = False
        pipeline_options.generate_picture_images = False
        pipeline_options.generate_table_images = False

        converter = DocumentConverter(
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
        )

        doc_stream = DocumentStream(name=self.object_name, stream=BytesIO(pdf_bytes))
        conv_res = converter.convert(doc_stream)
        docling_doc = conv_res.document

        pages_content = {}
        for item, level in docling_doc.iterate_items():
            page_no = 1
            if hasattr(item, "prov") and item.prov and len(item.prov) > 0:
                page_no = getattr(item.prov[0], "page_no", 1)

            if page_no not in pages_content:
                pages_content[page_no] = []

            if hasattr(item, "export_to_markdown"):
                content = item.export_to_markdown()
                if content and content.strip():
                    pages_content[page_no].append(content.strip())
            elif hasattr(item, "text"):
                text = item.text
                if text and text.strip():
                    if hasattr(item, "level") and item.level is not None and item.level > 0:
                        pages_content[page_no].append(f"{'#' * item.level} {text.strip()}")
                    else:
                        pages_content[page_no].append(text.strip())

        documents = []
        total_pages = len(docling_doc.pages) if hasattr(docling_doc, "pages") else len(pages_content)

        for page_no in sorted(pages_content.keys()):
            page_text = "\n\n".join(pages_content[page_no]).strip()
            if page_text:
                documents.append(
                    Document(
                        page_content=page_text,
                        metadata={
                            "source": self.object_name,
                            "page": page_no,
                            "total_pages": total_pages,
                        }
                    )
                )

        if not documents:
            # Fallback to full document export if per-page items were empty
            full_md = docling_doc.export_to_markdown()
            if full_md and full_md.strip():
                documents.append(
                    Document(
                        page_content=full_md.strip(),
                        metadata={
                            "source": self.object_name,
                            "page": 1,
                            "total_pages": 1,
                        }
                    )
                )

        return documents

    def _fallback_pypdf(self, pdf_bytes: bytes) -> List[Document]:
        from pypdf import PdfReader
        pdf_stream = BytesIO(pdf_bytes)
        reader = PdfReader(pdf_stream)
        documents = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            metadata = {
                "source": self.object_name,
                "page": i + 1
            }
            documents.append(Document(page_content=text, metadata=metadata))
        return documents
