"""LLM Gateway Service.

Provides dynamic, runtime-configurable LLM resolution with support for:
- Local models via Ollama (http://host.docker.internal:11434/v1)
- Cloud models (OpenAI, Mistral, Groq, OpenRouter, Google Gemini, Custom OpenAI-compatible)
- Role-based routing (chat, rag, summary, query_expansion)
- Prioritized multi-provider fallback chains
- Secure API key encryption and masking
- Live connection testing with latency benchmarking
- Local Ollama model auto-discovery
"""
import base64
import hashlib
import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from cryptography.fernet import Fernet
from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import (
    SECRET_KEY,
    LLM_TEMPERATURE,
    llm as static_env_llm,
)
from app.db.database import get_db
from app.db.models import LLMProvider
from app.utils.llm import MistralLLM
from app.utils.logger import log_error, log_info, log_warning


# ---------------------------------------------------------------------------
# Key Encryption & Masking
# ---------------------------------------------------------------------------

def _get_fernet() -> Fernet:
    """Derive a 32-byte Fernet key from SECRET_KEY."""
    derived_key = base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest())
    return Fernet(derived_key)


def encrypt_api_key(raw_key: Optional[str]) -> Optional[str]:
    """Encrypt an API key string. Returns None if raw_key is empty."""
    if not raw_key or not raw_key.strip():
        return None
    key_str = raw_key.strip()
    if key_str.startswith("enc:"):
        return key_str
    try:
        cipher = _get_fernet()
        token = cipher.encrypt(key_str.encode("utf-8")).decode("utf-8")
        return f"enc:{token}"
    except Exception as e:
        log_error(e, context="llm_gateway_encrypt")
        return key_str


def decrypt_api_key(encrypted_key: Optional[str]) -> Optional[str]:
    """Decrypt an API key string. Handles both plaintext and enc: tokens."""
    if not encrypted_key or not encrypted_key.strip():
        return None
    key_str = encrypted_key.strip()
    if not key_str.startswith("enc:"):
        return key_str
    try:
        cipher = _get_fernet()
        token = key_str[4:]
        return cipher.decrypt(token.encode("utf-8")).decode("utf-8")
    except Exception as e:
        log_error(e, context="llm_gateway_decrypt")
        return None


def mask_api_key(api_key: Optional[str]) -> Optional[str]:
    """Return a masked representation of an API key for safe UI display."""
    if not api_key:
        return None
    decrypted = decrypt_api_key(api_key) or api_key
    if len(decrypted) <= 8:
        return "****"
    return f"{decrypted[:4]}...{decrypted[-4:]}"


# ---------------------------------------------------------------------------
# Gateway Cache & State
# ---------------------------------------------------------------------------

class LLMGateway:
    """Manages dynamic LLM instantiation with in-memory caching."""

    def __init__(self):
        self._cache: Dict[str, Any] = {}

    def invalidate_cache(self):
        """Clear cached LLM instances after configuration changes."""
        self._cache.clear()
        log_info("LLM Gateway cache cleared", context="llm_gateway")

    def _normalize_base_url(self, base_url: str, provider_type: str) -> str:
        """Ensure base_url has a correct scheme and /v1 suffix for OpenAI-compatible APIs."""
        url = (base_url or "").strip().rstrip("/")
        if not url:
            if provider_type == "ollama":
                return "http://host.docker.internal:11434/v1"
            elif provider_type == "mistral":
                return "https://api.mistral.ai/v1"
            elif provider_type == "openai":
                return "https://api.openai.com/v1"
            elif provider_type == "groq":
                return "https://api.groq.com/openai/v1"
            elif provider_type == "openrouter":
                return "https://openrouter.ai/api/v1"
            return "https://api.openai.com/v1"

        if not (url.startswith("http://") or url.startswith("https://")):
            url = f"https://{url}"

        # If Ollama root URL provided without /v1, append /v1
        if provider_type == "ollama" and not url.endswith("/v1"):
            url = f"{url}/v1"

        return url

    def fetch_ollama_models(self, base_url: str) -> List[Dict[str, Any]]:
        """Query Ollama API to discover currently installed models."""
        url = (base_url or "").strip().rstrip("/")
        if not url:
            url = "http://host.docker.internal:11434"
        if not (url.startswith("http://") or url.startswith("https://")):
            url = f"http://{url}"
        # Strip trailing /v1 for Ollama native endpoints
        root_url = re.sub(r"/v1/?$", "", url)

        try:
            resp = requests.get(f"{root_url}/api/tags", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                raw_models = data.get("models", [])
                models = []
                for m in raw_models:
                    name = m.get("name") or m.get("model", "")
                    size_bytes = m.get("size", 0)
                    size_gb = round(size_bytes / (1024 ** 3), 2) if size_bytes else None
                    details = m.get("details", {})
                    models.append({
                        "id": name,
                        "name": name,
                        "size_gb": size_gb,
                        "param_size": details.get("parameter_size"),
                        "quantization": details.get("quantization_level"),
                        "family": details.get("family"),
                    })
                return models
        except Exception as e:
            log_warning(f"Could not fetch Ollama /api/tags from {root_url}: {e}", context="llm_gateway")

        # Fallback to /v1/models (OpenAI-compatible)
        try:
            v1_url = f"{root_url}/v1/models"
            resp = requests.get(v1_url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                return [{"id": m.get("id", ""), "name": m.get("id", "")} for m in data.get("data", [])]
        except Exception as e:
            log_warning(f"Could not fetch Ollama /v1/models: {e}", context="llm_gateway")

        return []

    def test_connection(
        self,
        base_url: str,
        api_key: Optional[str],
        model_name: str,
        provider_type: str = "custom",
    ) -> Dict[str, Any]:
        """Test model connectivity and measure latency."""
        norm_url = self._normalize_base_url(base_url, provider_type)
        actual_key = decrypt_api_key(api_key) if (api_key and api_key.startswith("enc:")) else (api_key or "")

        # Ollama does not require an API key, but openai python client requires non-empty string
        effective_key = actual_key if actual_key else ("ollama" if provider_type == "ollama" else "dummy-key")

        start_time = time.time()
        try:
            client = OpenAI(base_url=norm_url, api_key=effective_key, timeout=20.0)
            completion = client.chat.completions.create(
                model=model_name,
                messages=[{"role": "user", "content": "Bonjour, réponds 'OK'."}],
                max_tokens=15,
                temperature=0.3,
            )
            latency_ms = round((time.time() - start_time) * 1000)
            reply = completion.choices[0].message.content.strip() if completion.choices else ""
            return {
                "success": True,
                "latency_ms": latency_ms,
                "model": model_name,
                "sample_reply": reply,
                "message": f"Connexion réussie ({latency_ms} ms)",
            }
        except Exception as e:
            latency_ms = round((time.time() - start_time) * 1000)
            err_msg = str(e)
            return {
                "success": False,
                "latency_ms": latency_ms,
                "model": model_name,
                "error": err_msg,
                "message": f"Échec de la connexion : {err_msg}",
            }

    def get_llm(self, role: str = "chat", db: Optional[Session] = None) -> Any:
        """Resolve the active LLM Runnable for the specified role.
        
        Roles:
        - "chat": General interactive chat
        - "rag": Retrieval-Augmented Generation answer synthesis
        - "summary": Document summarization and question extraction
        - "query_expansion": Query formulation and keyword expansion
        """
        # Return cached instance if available
        if role in self._cache:
            return self._cache[role]

        own_session = False
        if db is None:
            db_gen = get_db()
            db = next(db_gen)
            own_session = True

        try:
            # Query all active providers ordered by priority ascending
            active_providers = (
                db.query(LLMProvider)
                .filter(LLMProvider.is_active == True)
                .order_by(LLMProvider.priority.asc(), LLMProvider.id.asc())
                .all()
            )

            if not active_providers:
                # No providers in database: fallback to static env configuration
                return static_env_llm

            # Filter providers matching requested role or general providers
            role_matches = []
            other_active = []
            for p in active_providers:
                roles = p.assigned_roles or []
                if role in roles:
                    role_matches.append(p)
                else:
                    other_active.append(p)

            # Ordered chain: role-assigned providers first, then others as fallbacks
            ordered_providers = role_matches if role_matches else other_active

            if not ordered_providers:
                return static_env_llm

            # Build provider configs for MistralLLM
            provider_configs = []
            for p in ordered_providers:
                norm_url = self._normalize_base_url(p.base_url, p.provider_type)
                plain_key = decrypt_api_key(p.api_key) or ("ollama" if p.provider_type == "ollama" else "dummy-key")
                try:
                    client = OpenAI(base_url=norm_url, api_key=plain_key, timeout=60.0)
                    provider_configs.append({
                        "name": p.name,
                        "client": client,
                        "model": p.model_name,
                    })
                except Exception as client_err:
                    log_warning(f"Could not build client for {p.name}: {client_err}", context="llm_gateway")

            if not provider_configs:
                return static_env_llm

            primary = provider_configs[0]
            primary_model_temp = ordered_providers[0].temperature or LLM_TEMPERATURE

            llm_instance = MistralLLM(
                client=primary["client"],
                model=primary["model"],
                temperature=primary_model_temp,
                provider_name=primary["name"],
                fallback_providers=provider_configs[1:],
            )

            self._cache[role] = llm_instance
            return llm_instance

        except Exception as e:
            log_error(e, context="llm_gateway_get_llm")
            return static_env_llm
        finally:
            if own_session and db:
                db.close()


# Global Singleton Gateway
llm_gateway = LLMGateway()


# ---------------------------------------------------------------------------
# Dynamic LangChain Runnable Proxies
# ---------------------------------------------------------------------------

from langchain_core.runnables import Runnable

class DynamicLLMRunnable(Runnable):
    """LangChain Runnable proxy that resolves the active provider dynamically per call."""
    def __init__(self, default_role: str = "chat"):
        super().__init__()
        self.default_role = default_role

    def _resolve(self, config=None):
        role = self.default_role
        if config and isinstance(config, dict):
            role = config.get("role", self.default_role)
        instance = llm_gateway.get_llm(role=role)
        if instance is None:
            raise RuntimeError(f"No LLM provider available for role '{role}'")
        return instance

    def invoke(self, input, config=None):
        active = self._resolve(config)
        return active.invoke(input, config=config)

    def stream(self, input, config=None):
        active = self._resolve(config)
        if hasattr(active, "stream"):
            return active.stream(input, config=config)
        return iter([active.invoke(input, config=config)])

    async def ainvoke(self, input, config=None):
        active = self._resolve(config)
        if hasattr(active, "ainvoke"):
            return await active.ainvoke(input, config=config)
        import asyncio
        return await asyncio.to_thread(active.invoke, input, config=config)

    @property
    def client(self):
        active = self._resolve()
        return getattr(active, "client", None)

    @property
    def model(self):
        active = self._resolve()
        return getattr(active, "model", None)

    def is_available(self, role: Optional[str] = None) -> bool:
        target_role = role or self.default_role
        try:
            return llm_gateway.get_llm(role=target_role) is not None
        except Exception:
            return False

    def __bool__(self):
        return self.is_available()


chat_llm = DynamicLLMRunnable("chat")
rag_llm = DynamicLLMRunnable("rag")
summary_llm = DynamicLLMRunnable("summary")
query_expansion_llm = DynamicLLMRunnable("query_expansion")
