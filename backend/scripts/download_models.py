#!/usr/bin/env python3
"""Download the configured Aitheris embedding and ranking models."""
import os

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
RERANKER_MODEL = os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
CROSS_ENCODER_MODEL = os.getenv("CROSS_ENCODER_MODEL", RERANKER_MODEL)


import sys
import time
import threading
from pathlib import Path


class DownloadProgressSpinner:
    """Animated spinner and progress reporter for model downloads."""

    SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

    def __init__(self, model_name: str):
        self.model_name = model_name
        self._stop_event = threading.Event()
        self._thread = None
        self._start_time = None
        self._is_tty = sys.stdout.isatty()

    def _get_cache_dir(self) -> Path:
        hf_home = os.environ.get("HF_HOME") or os.environ.get("HF_HUB_CACHE")
        if hf_home:
            cache_path = Path(hf_home)
            if not cache_path.name.endswith("hub"):
                cache_path = cache_path / "hub"
            return cache_path
        return Path.home() / ".cache" / "huggingface" / "hub"

    def _get_download_bytes(self) -> int:
        """Scan cache directory for current blob/incomplete sizes for this model."""
        try:
            repo_folder = f"models--{self.model_name.replace('/', '--')}"
            model_dir = self._get_cache_dir() / repo_folder / "blobs"
            if not model_dir.exists():
                return 0
            total = 0
            for item in model_dir.iterdir():
                if item.is_file():
                    total += item.stat().st_size
            return total
        except Exception:
            return 0

    @staticmethod
    def _format_size(size_bytes: int) -> str:
        if size_bytes >= 1024 ** 3:
            return f"{size_bytes / (1024 ** 3):.2f} Go"
        if size_bytes >= 1024 ** 2:
            return f"{size_bytes / (1024 ** 2):.1f} Mo"
        if size_bytes >= 1024:
            return f"{size_bytes / 1024:.0f} Ko"
        return f"{size_bytes} o"

    @staticmethod
    def _format_elapsed(seconds: float) -> str:
        m, s = divmod(int(seconds), 60)
        return f"{m:02d}m{s:02d}s"

    def _run(self):
        idx = 0
        last_logged = 0.0
        initial_bytes = self._get_download_bytes()
        last_bytes = initial_bytes

        while not self._stop_event.is_set():
            now = time.time()
            elapsed = now - self._start_time
            current_bytes = self._get_download_bytes()
            downloaded = max(0, current_bytes - initial_bytes)

            speed_str = ""
            if elapsed > 1 and downloaded > 0:
                speed = downloaded / elapsed
                speed_str = f" ({self._format_size(int(speed))}/s)"

            frame = self.SPINNER_FRAMES[idx % len(self.SPINNER_FRAMES)]
            elapsed_str = self._format_elapsed(elapsed)
            downloaded_str = self._format_size(current_bytes)

            if self._is_tty:
                msg = f"\r  [{frame}] Téléchargement {self.model_name}... {downloaded_str}{speed_str} [{elapsed_str}]"
                sys.stdout.write(msg)
                sys.stdout.flush()
                self._stop_event.wait(0.15)
            else:
                # In Docker/non-TTY logs, log periodically (every 5s) or on meaningful byte changes
                if (now - last_logged >= 5.0) or (current_bytes - last_bytes >= 50 * 1024 * 1024):
                    print(
                        f"  [{frame}] Téléchargement {self.model_name} en cours : {downloaded_str}{speed_str} ({elapsed_str} écoulées)",
                        flush=True,
                    )
                    last_logged = now
                    last_bytes = current_bytes
                self._stop_event.wait(1.0)

            idx += 1

    def __enter__(self):
        self._start_time = time.time()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=1.0)
        elapsed = time.time() - (self._start_time or time.time())
        elapsed_str = self._format_elapsed(elapsed)
        if self._is_tty:
            sys.stdout.write("\r" + " " * 80 + "\r")
            sys.stdout.flush()
        if exc_type is None:
            print(f"  [✓] Modèle {self.model_name} prêt en {elapsed_str}.", flush=True)
        else:
            print(f"  [✗] Échec du téléchargement {self.model_name} après {elapsed_str}.", flush=True)


def load_cached_or_download(loader, model_name, **kwargs):
    try:
        return loader(model_name, local_files_only=True, **kwargs)
    except OSError:
        print(f"Cache incomplet ; téléchargement de {model_name}...", flush=True)
        with DownloadProgressSpinner(model_name):
            return loader(model_name, **kwargs)


def main():
    from sentence_transformers import SentenceTransformer, CrossEncoder
    from transformers import AutoTokenizer

    failures = 0
    try:
        print(f"Downloading embeddings and tokenizer: {EMBEDDING_MODEL}")
        model = load_cached_or_download(SentenceTransformer, EMBEDDING_MODEL, device="cpu")
        print(f"Embedding dimensions: {model.get_sentence_embedding_dimension()}")
        del model
        load_cached_or_download(AutoTokenizer.from_pretrained, EMBEDDING_MODEL)
    except Exception as exc:
        print(f"Embedding download failed: {exc}")
        failures += 1

    for model_name in dict.fromkeys([RERANKER_MODEL, CROSS_ENCODER_MODEL]):
        try:
            print(f"Downloading reranker: {model_name}")
            model = load_cached_or_download(CrossEncoder, model_name, max_length=512, device="cpu")
            del model
        except Exception as exc:
            print(f"Reranker download failed: {exc}")
            failures += 1

    try:
        print("Downloading and caching Docling models (layout & table structure)...", flush=True)
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.pipeline.standard_pdf_pipeline import StandardPdfPipeline

        opts = PdfPipelineOptions()
        opts.do_ocr = False
        opts.do_table_structure = True
        pipe = StandardPdfPipeline(pipeline_options=opts)
        del pipe
        print("  [✓] Docling models are cached and ready.", flush=True)
    except Exception as exc:
        print(f"Docling models preparation failed: {exc}", flush=True)
        failures += 1

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
