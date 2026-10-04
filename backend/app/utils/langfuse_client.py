"""
Langfuse Observability Client for AITHERIS RAG.
Provides distributed tracing for prompts, retrievals, guardrails, and LLM calls.
Fails gracefully and never blocks user requests if Langfuse is offline.
"""

import os
from typing import Optional, Dict, Any

LANGFUSE_ENABLED = os.getenv("LANGFUSE_ENABLED", "true").lower() == "true"
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "pk-lf-local-dev")
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "sk-lf-local-dev")
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "http://localhost:3002")

_client = None
_client_initialized = False


def get_langfuse_client():
    """Retrieve or initialize the singleton Langfuse client."""
    global _client, _client_initialized
    if _client_initialized:
        return _client

    if not LANGFUSE_ENABLED:
        _client = None
        _client_initialized = True
        return None

    try:
        from langfuse import Langfuse
        _client = Langfuse(
            public_key=LANGFUSE_PUBLIC_KEY,
            secret_key=LANGFUSE_SECRET_KEY,
            host=LANGFUSE_HOST,
        )
        _client_initialized = True
    except Exception:
        # Langfuse unavailable or package not installed - fail silently
        _client = None
        _client_initialized = True

    return _client


def configure_langfuse(public_key: str, secret_key: Optional[str] = None, host: Optional[str] = None, enabled: Optional[bool] = None) -> Dict[str, Any]:
    """Dynamically reconfigure Langfuse client with new API keys and host."""
    global _client, _client_initialized, LANGFUSE_ENABLED, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST
    if enabled is not None:
        LANGFUSE_ENABLED = enabled
        os.environ["LANGFUSE_ENABLED"] = "true" if enabled else "false"
    if public_key:
        LANGFUSE_PUBLIC_KEY = public_key.strip()
        os.environ["LANGFUSE_PUBLIC_KEY"] = LANGFUSE_PUBLIC_KEY
    if secret_key and secret_key.strip():
        LANGFUSE_SECRET_KEY = secret_key.strip()
        os.environ["LANGFUSE_SECRET_KEY"] = LANGFUSE_SECRET_KEY
    if host:
        LANGFUSE_HOST = host.strip()
        os.environ["LANGFUSE_HOST"] = LANGFUSE_HOST

    _client = None
    _client_initialized = False
    get_langfuse_client()
    return get_langfuse_status()


def get_langfuse_status() -> Dict[str, Any]:
    """Get current status of Langfuse configuration."""
    client = get_langfuse_client()
    has_keys = bool(LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY and not LANGFUSE_PUBLIC_KEY.endswith("-local-dev"))
    return {
        "enabled": LANGFUSE_ENABLED,
        "host": LANGFUSE_HOST,
        "browser_url": os.getenv("LANGFUSE_BROWSER_URL", "http://localhost:3002"),
        "public_key": LANGFUSE_PUBLIC_KEY,
        "has_secret_key": bool(LANGFUSE_SECRET_KEY),
        "secret_key_masked": f"{LANGFUSE_SECRET_KEY[:7]}...{LANGFUSE_SECRET_KEY[-4:]}" if len(LANGFUSE_SECRET_KEY) > 12 else ("***" if LANGFUSE_SECRET_KEY else ""),
        "connected": bool(client and has_keys),
    }


def test_langfuse_connection() -> Dict[str, Any]:
    """Send a lightweight test event to verify Langfuse connectivity and credentials."""
    client = get_langfuse_client()
    if not client:
        return {"success": False, "message": "Le client Langfuse n'est pas initialisé ou est désactivé."}
    try:
        if hasattr(client, "trace"):
            trace = client.trace(name="aitheris_healthcheck", metadata={"source": "admin_test"})
            if hasattr(trace, "event"):
                trace.event(name="ping", input="connection_test")
        elif hasattr(client, "create_event"):
            client.create_event(name="aitheris_healthcheck", input="connection_test")
        elif hasattr(client, "start_observation"):
            obs = client.start_observation(name="aitheris_healthcheck", as_type="span", input="connection_test")
            if hasattr(obs, "end"):
                obs.end()

        if hasattr(client, "flush"):
            client.flush()
        return {"success": True, "message": "Connexion à Langfuse réussie ! Événement de test envoyé."}
    except Exception as e:
        return {"success": False, "message": f"Erreur de communication avec Langfuse : {str(e)}"}


class RAGTrace:
    """Wrapper around a Langfuse trace to record RAG and Guardrail execution spans."""

    def __init__(self, trace_id: str, name: str, user_id: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None):
        self.trace_id = trace_id
        self.name = name
        self.user_id = str(user_id) if user_id else None
        self.metadata = metadata or {}
        self._trace = None

        client = get_langfuse_client()
        if client:
            try:
                if hasattr(client, "trace"):
                    self._trace = client.trace(
                        id=self.trace_id,
                        name=self.name,
                        user_id=self.user_id,
                        metadata=self.metadata,
                    )
                elif hasattr(client, "start_observation"):
                    self._trace = client.start_observation(
                        name=self.name,
                        as_type="chain",
                        metadata=self.metadata,
                    )
            except Exception:
                self._trace = None

    def span(self, name: str, input_data: Any = None, metadata: Optional[Dict[str, Any]] = None):
        """Start a sub-span within this trace."""
        if self._trace:
            try:
                return self._trace.span(name=name, input=input_data, metadata=metadata)
            except Exception:
                return None
        return None

    def generation(self, name: str, model: str, prompt: Any, output: Any = None, usage: Optional[Dict[str, int]] = None, metadata: Optional[Dict[str, Any]] = None):
        """Record an LLM generation call."""
        if self._trace:
            try:
                return self._trace.generation(
                    name=name,
                    model=model,
                    input=prompt,
                    output=output,
                    usage=usage,
                    metadata=metadata,
                )
            except Exception:
                return None
        return None

    def event(self, name: str, input_data: Any = None, output_data: Any = None, metadata: Optional[Dict[str, Any]] = None):
        """Record an instant event (such as a Guardrail check or violation)."""
        if self._trace:
            try:
                return self._trace.event(
                    name=name,
                    input=input_data,
                    output=output_data,
                    metadata=metadata,
                )
            except Exception:
                return None
        return None

    def update(self, output: Any = None, metadata: Optional[Dict[str, Any]] = None):
        """Finalize or update trace."""
        if self._trace:
            try:
                self._trace.update(output=output, metadata=metadata)
            except Exception:
                pass


def create_rag_trace(trace_id: str, name: str = "rag_chat", user_id: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None) -> RAGTrace:
    """Helper to create a safe RAGTrace."""
    return RAGTrace(trace_id=trace_id, name=name, user_id=user_id, metadata=metadata)
