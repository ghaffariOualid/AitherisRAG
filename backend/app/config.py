import os


os.environ['CUDA_VISIBLE_DEVICES'] = ''
os.environ['TORCH_USE_CUDA_DSA'] = '0'
# Disable CUDA completely
os.environ['TORCH_CUDA_ARCH_LIST'] = ''
# Force CPU device
os.environ['TORCH_DEVICE'] = 'cpu'

from dotenv import load_dotenv
from pathlib import Path

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False
    BaseSettings = None
    SettingsConfigDict = None

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")


try:
    from langchain_huggingface import HuggingFaceEmbeddings
    from transformers import AutoTokenizer
    from sentence_transformers import SentenceTransformer
    from app.utils.CustomEmbedding import CustomEmbedding
    from openai import OpenAI
    from langchain_core.runnables import Runnable
    from langchain_core.language_models import BaseChatModel
    from langchain_core.messages import AIMessage
    from app.utils.llm import MistralLLM
    from qdrant_client import QdrantClient
    ML_IMPORTS_AVAILABLE = True
except ImportError:
 
    ML_IMPORTS_AVAILABLE = False
    HuggingFaceEmbeddings = None
    AutoTokenizer = None
    SentenceTransformer = None
    CustomEmbedding = None
    OpenAI = None
    Runnable = None
    BaseChatModel = None
    AIMessage = None
    MistralLLM = None
    QdrantClient = None


# Database Configuration
DATABASE_URL = os.getenv("DATABASE_URL")
FRONTEND_HOST = os.getenv("FRONTEND_HOST")
HOST = os.getenv("HOST")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
# Qdrant Configuration
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
# Only initialize Qdrant client if ML imports are available
if ML_IMPORTS_AVAILABLE and QdrantClient is not None:
    qdrant_client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
else:
    qdrant_client = None

# MinIO Configuration
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_PUBLIC_ENDPOINT = os.getenv("MINIO_PUBLIC_ENDPOINT", "localhost:9000")  
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
MINIO_BUCKET_NAME = os.getenv("MINIO_BUCKET_NAME")

# Redis Configuration
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "1"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)
REDIS_URL = os.getenv("REDIS_URL", f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}")

# Metrics Configuration
OBSERVABILITY_ENABLED = os.getenv("OBSERVABILITY_ENABLED", "false").lower() == "true"
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://localhost:9091")

# Cache Configuration
CACHE_TTL_EMBEDDINGS = int(os.getenv("CACHE_TTL_EMBEDDINGS", "86400"))  # 24 hours
CACHE_TTL_RESPONSES = int(os.getenv("CACHE_TTL_RESPONSES", "3600"))     # 1 hour
CACHE_TTL_DOCUMENTS = int(os.getenv("CACHE_TTL_DOCUMENTS", "7200"))    # 2 hours
CACHE_TTL_CHAT_HISTORY = int(os.getenv("CACHE_TTL_CHAT_HISTORY", "1800"))  # 30 minutes

# AI Model Configuration
MODEL_NAME = os.getenv("MODEL_NAME", "BAAI/bge-m3")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")

RERANKER_MODEL = os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
CROSS_ENCODER_MODEL = os.getenv("CROSS_ENCODER_MODEL", "BAAI/bge-reranker-v2-m3")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.3"))

# Security Configuration
SECRET_KEY = os.getenv("SECRET_KEY")
REFRESH_SECRET_KEY = os.getenv("REFRESH_SECRET_KEY")

# Validate required secrets at startup
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required. Please set it in your .env file.")
if not REFRESH_SECRET_KEY:
    raise ValueError("REFRESH_SECRET_KEY environment variable is required. Please set it in your .env file.")
ALGORITHM = os.getenv("ALGORITHM", "HS256")



ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", str(ENVIRONMENT == "production")).lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "none" if COOKIE_SECURE else "lax").lower()
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    raise ValueError("COOKIE_SAMESITE must be one of: lax, strict, none")
if COOKIE_SAMESITE == "none" and not COOKIE_SECURE:
    raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true")

# Email Configuration
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

# File Upload Configuration
UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads/")
ALLOWED_EXTENSIONS = {
    "pdf", "txt", "csv", "md"
}
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "200"))
MAX_FILES_PER_USER = int(os.getenv("MAX_FILES_PER_USER", "20"))
MAX_CHATS_PER_HOUR = int(os.getenv("MAX_CHATS_PER_HOUR", "0"))

# Document Processing Configuration
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))
DOCLING_DO_OCR = os.getenv("DOCLING_DO_OCR", "false").lower() == "true"
DOCLING_TABLE_STRUCTURE = os.getenv("DOCLING_TABLE_STRUCTURE", "true").lower() == "true"

# Language Configuration
LANGUAGE_MAP = {
    "en": "English",
    "fr": "French",
    "ar": "Arabic",
    "es": "Spanish",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean"
}


# CORS Configuration
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://192.168.22.1:3000").split(",")
    if origin.strip()
]

ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,host.docker.internal").split(",")

# Frontend URL for redirects
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


model = None
encoder = None
tokenizer = None

if ML_IMPORTS_AVAILABLE:
    # Always try to use cached model path if available (works in both online and offline mode)
    hf_home = os.getenv("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
    
    # Normalize model name - ensure it has the full path
    embedding_model_name = EMBEDDING_MODEL
    if "/" not in embedding_model_name and not os.path.exists(embedding_model_name):
        embedding_model_name = f"sentence-transformers/{embedding_model_name}"
    
    # Look for cached model in hub directory
    cached_model_path = os.path.join(hf_home, "hub", f"models--{embedding_model_name.replace('/', '--')}")
    model_path = embedding_model_name
    if os.path.exists(cached_model_path):
        # Find the snapshot directory
        snapshots_dir = os.path.join(cached_model_path, "snapshots")
        if os.path.exists(snapshots_dir):
            snapshots = [d for d in os.listdir(snapshots_dir) if os.path.isdir(os.path.join(snapshots_dir, d))]
            if snapshots:
                model_path = os.path.join(snapshots_dir, snapshots[0])
                print(f"  Using cached model path: {model_path}")
    
    # One shared BGE-M3 instance: loading SentenceTransformer and then the
    # LangChain wrapper separately would duplicate several GB in every process.
    try:
        encoder = HuggingFaceEmbeddings(
            model_name=model_path,
            model_kwargs={"device": "cpu", "local_files_only": os.getenv("HF_HUB_OFFLINE", "0") == "1"}
        )
        model = encoder._client
        tokenizer = model.tokenizer
        print(f"BGE embeddings and tokenizer loaded: {EMBEDDING_MODEL}")
    except Exception as e:
        print(f"Could not load embeddings '{EMBEDDING_MODEL}': {e}")
        model = encoder = tokenizer = None

else:
    pass



# Settings class - only define if pydantic is available
if PYDANTIC_AVAILABLE and BaseSettings is not None:
    class Settings(BaseSettings):
        app_name: str = "RAG API"
        admin_email: str = os.getenv("ADMIN_EMAIL", "default@example.com")
        items_per_user: int = int(os.getenv("ITEMS_PER_USER", "50"))
        
        model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
        model_config.update({"extra": "ignore"})
    
    settings = Settings()
else:
    # In lightweight images, create a simple settings object
    class SimpleSettings:
        app_name: str = "RAG API"
        admin_email: str = os.getenv("ADMIN_EMAIL", "default@example.com")
        items_per_user: int = int(os.getenv("ITEMS_PER_USER", "50"))
    
    settings = SimpleSettings()

# Mistral Configuration
# The Mistral chat-completions endpoint is OpenAI-compatible, so the existing
# OpenAI SDK can be used without routing requests through another provider.
mistral_api_key = os.getenv("MISTRAL_API_KEY")
mistral_base_url = os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1")
mistral_model = os.getenv("MISTRAL_MODEL", "mistral-small-latest")
# Optional comma-separated Mistral model IDs to try if the primary fails.
mistral_fallback_models = [
    model.strip()
    for model in os.getenv("MISTRAL_FALLBACK_MODELS", "").split(",")
    if model.strip()
]

# Optional OpenAI-compatible providers used after Mistral fails.
groq_api_key = os.getenv("GROQ_API_KEY")
groq_base_url = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
gemini_api_key = os.getenv("GEMINI_API_KEY")
gemini_base_url = os.getenv(
    "GEMINI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai/"
)
gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")



llm = None

# Only initialize LLM providers if ML imports are available.
if ML_IMPORTS_AVAILABLE:
    provider_configs = []

    def add_provider(name, api_key, base_url, model):
        if not api_key:
            return
        try:
            provider_configs.append({
                "name": name,
                "client": OpenAI(base_url=base_url, api_key=api_key),
                "model": model,
            })
        except Exception as e:
            print(f"Warning: Could not initialize {name} client: {e}")

    add_provider("mistral", mistral_api_key, mistral_base_url, mistral_model)

    # Keep Mistral model fallbacks before switching providers.
    if provider_configs:
        mistral_client = provider_configs[0]["client"]
        for fallback_model in mistral_fallback_models:
            if fallback_model != mistral_model:
                provider_configs.append({
                    "name": "mistral",
                    "client": mistral_client,
                    "model": fallback_model,
                })

    add_provider("groq", groq_api_key, groq_base_url, groq_model)
    add_provider("gemini", gemini_api_key, gemini_base_url, gemini_model)

    if provider_configs:
        primary = provider_configs[0]
        llm = MistralLLM(
            client=primary["client"],
            model=primary["model"],
            temperature=LLM_TEMPERATURE,
            provider_name=primary["name"],
            fallback_providers=provider_configs[1:]
        )
        provider_info = ", ".join(
            f"{provider['name']}/{provider['model']}"
            for provider in provider_configs
        )
        print(f"✓ LLM providers initialized: {provider_info}")
elif not ML_IMPORTS_AVAILABLE:
    # In lightweight images, skip LLM initialization
    pass

# Final fallback message (only in backend-image)
if ML_IMPORTS_AVAILABLE and llm is None:
    print("Warning: No LLM provider configured")
    print("Set MISTRAL_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY to enable AI features")

