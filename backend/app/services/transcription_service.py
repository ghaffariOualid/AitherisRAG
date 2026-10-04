"""
Speech-to-Text Transcription Service.
Supports:
1. 100% Local transcription with `faster-whisper` (CTranslate2) - 100% Private, On-Premise, zero external cloud connection.
2. Cloud fallback with Groq (`whisper-large-v3-turbo`) or OpenAI (`whisper-1`).
"""
import io
import os
import time
from typing import Dict, Any, Optional

from app.utils.logger import log_info, log_error, log_warning


class TranscriptionService:
    def __init__(self):
        self._local_model = None
        self._local_model_name = os.getenv("WHISPER_LOCAL_MODEL", "base").strip()
        self._device = os.getenv("WHISPER_DEVICE", "cpu").lower().strip()
        self._compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8").lower().strip()

    def _find_cached_snapshot(self, model_name: str) -> Optional[str]:
        """Find local cached snapshot directory for faster-whisper model."""
        hf_home = os.getenv("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
        hub_dir = os.path.join(hf_home, "hub")
        repo_dir = os.path.join(hub_dir, f"models--Systran--faster-whisper-{model_name}")
        snapshots_dir = os.path.join(repo_dir, "snapshots")
        if os.path.exists(snapshots_dir):
            snaps = [d for d in os.listdir(snapshots_dir) if os.path.isdir(os.path.join(snapshots_dir, d))]
            if snaps:
                return os.path.join(snapshots_dir, snaps[0])
        return None

    def _get_local_model(self):
        """Loads and caches the local faster-whisper model."""
        if self._local_model is not None:
            return self._local_model

        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise ImportError(
                "Le paquet 'faster-whisper' n'est pas installé. "
                "Exécutez: pip install faster-whisper"
            )

        model_name = self._local_model_name
        cached_path = self._find_cached_snapshot(model_name)
        model_source = cached_path if cached_path else model_name

        log_info(
            f"Initialisation du modèle local faster-whisper '{model_name}' "
            f"(source: {model_source}, device: {self._device}, compute_type: {self._compute_type})",
            context="transcription"
        )
        start = time.time()
        self._local_model = WhisperModel(
            model_source,
            device=self._device,
            compute_type=self._compute_type,
            local_files_only=bool(cached_path)
        )
        load_duration = time.time() - start
        log_info(
            f"Modèle local faster-whisper '{model_name}' prêt en {load_duration:.2f}s",
            context="transcription"
        )
        return self._local_model

    def _transcribe_local(
        self,
        audio_bytes: bytes,
        language: Optional[str] = None
    ) -> Dict[str, Any]:
        """Transcribe audio using 100% local faster-whisper on CPU/GPU."""
        model = self._get_local_model()
        start_time = time.time()

        lang_code = None
        if language and language.lower() not in ["auto", "auto-detect", "none", ""]:
            lang_code = language.strip().lower()
            if len(lang_code) > 2:
                lang_mapping = {
                    "french": "fr", "français": "fr",
                    "english": "en", "anglais": "en",
                    "spanish": "es", "espagnol": "es",
                    "german": "de", "allemand": "de",
                    "arabic": "ar", "arabe": "ar",
                    "italian": "it", "italien": "it",
                }
                lang_code = lang_mapping.get(lang_code, lang_code[:2])

        # faster-whisper accepts an in-memory BytesIO stream directly
        audio_stream = io.BytesIO(audio_bytes)

        # Transcribe with beam_size and vad_filter for maximum efficiency and speed
        segments, info = model.transcribe(
            audio_stream,
            language=lang_code,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400)
        )

        texts = [segment.text.strip() for segment in segments]
        transcribed_text = " ".join([t for t in texts if t]).strip()
        duration = time.time() - start_time

        detected_lang = getattr(info, "language", lang_code or "auto")
        log_info(
            f"Transcription 100% locale terminée en {duration:.2f}s (langue: {detected_lang}): '{transcribed_text[:60]}...'",
            context="transcription"
        )

        return {
            "text": transcribed_text,
            "duration": round(duration, 3),
            "provider": "local (faster-whisper)",
            "model": self._local_model_name,
            "language": detected_lang,
            "is_local": True
        }

    def _transcribe_cloud(
        self,
        audio_bytes: bytes,
        filename: str = "audio.webm",
        language: Optional[str] = None
    ) -> Dict[str, Any]:
        """Transcribe audio via Groq or OpenAI Cloud API."""
        groq_key = os.getenv("GROQ_API_KEY", "").strip()
        openai_key = os.getenv("OPENAI_API_KEY", "").strip()
        from openai import OpenAI

        if groq_key:
            client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=groq_key, timeout=30.0)
            model = "whisper-large-v3-turbo"
            provider = "groq (cloud)"
        elif openai_key:
            client = OpenAI(api_key=openai_key, timeout=30.0)
            model = "whisper-1"
            provider = "openai (cloud)"
        else:
            raise ValueError("Aucune clé API Cloud disponible.")

        start_time = time.time()
        file_tuple = (filename, audio_bytes)
        params: Dict[str, Any] = {
            "file": file_tuple,
            "model": model,
            "response_format": "json",
        }
        if language and language.lower() not in ["auto", "auto-detect", "none", ""]:
            lang_code = language.strip().lower()
            if len(lang_code) > 2:
                lang_mapping = {
                    "french": "fr", "français": "fr",
                    "english": "en", "anglais": "en",
                    "spanish": "es", "espagnol": "es",
                    "german": "de", "allemand": "de",
                    "arabic": "ar", "arabe": "ar",
                    "italian": "it", "italien": "it",
                }
                lang_code = lang_mapping.get(lang_code, lang_code[:2])
            params["language"] = lang_code

        transcription = client.audio.transcriptions.create(**params)
        duration = time.time() - start_time
        text_result = getattr(transcription, "text", "") or ""
        return {
            "text": text_result.strip(),
            "duration": round(duration, 3),
            "provider": provider,
            "model": model,
            "is_local": False
        }

    def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.webm",
        language: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Transcribes the given audio bytes into text.
        Defaults to 100% local faster-whisper.
        """
        if not audio_bytes or len(audio_bytes) < 100:
            raise ValueError("Le fichier audio est vide ou trop court.")

        mode = os.getenv("WHISPER_MODE", "local").lower().strip()

        if mode in ["local", "offline"]:
            return self._transcribe_local(audio_bytes, language=language)
        elif mode == "auto":
            try:
                return self._transcribe_local(audio_bytes, language=language)
            except Exception as e:
                log_warning(f"Bascule vers le Cloud suite à une erreur locale: {e}", context="transcription")
                return self._transcribe_cloud(audio_bytes, filename=filename, language=language)
        else:
            return self._transcribe_cloud(audio_bytes, filename=filename, language=language)


transcription_service = TranscriptionService()
