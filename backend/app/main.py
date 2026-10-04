# New Dependency 
from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware


from app.routes.auth import router as auth_router
from app.routes.document import router as document_router
from app.routes.chat import router as chat_router
from app.routes.health import router as health_router
from app.routes.metrics import router as metrics_router
from app.routes.admin_llm import router as admin_llm_router
from app.routes.skills import router as skills_router
from app.routes.rag_workflows import router as rag_workflows_router
from app.routes.projects import router as projects_router
from app.routes.guardrails import router as guardrails_router
from app.routes.observability import router as observability_router

# Import middleware
from app.middleware.error_handler import error_handler_middleware
from app.middleware.performance import performance_middleware
from app.middleware.rate_limiter import limiter, rate_limit_exceeded_handler
from app.middleware.trace import TraceMiddleware
from slowapi.errors import RateLimitExceeded
from app.utils.logger import log_info, log_error
from app.config import ALLOWED_ORIGINS, ALLOWED_HOSTS

app = FastAPI(
    title="RAG API",
    description="Retrieval-Augmented Generation API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add rate limiter state
app.state.limiter = limiter
app.state.rag_graph_ready = False
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Security middleware
app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

# Trace middleware (must be early to generate trace_id)
app.add_middleware(TraceMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
)

# Middleware
app.middleware("http")(error_handler_middleware)
app.middleware("http")(performance_middleware)

# Include routers
app.include_router(auth_router, prefix="/api/auth")
app.include_router(document_router, prefix="/api/document")
app.include_router(chat_router, prefix="/api/chat")
app.include_router(skills_router, prefix="/api/skills", tags=["Skills"])
app.include_router(health_router, prefix="/api/health")
app.include_router(admin_llm_router, prefix="/api/admin/llm", tags=["Admin LLM Gateway"])
app.include_router(rag_workflows_router, prefix="/api/rag-workflows", tags=["RAG Workflows"])
app.include_router(projects_router, prefix="/api/projects", tags=["Projects"])
app.include_router(guardrails_router, prefix="/api/guardrails", tags=["Guardrails"])
app.include_router(observability_router, prefix="/api/admin/observability", tags=["Admin Observability"])
app.include_router(metrics_router)  

@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    log_info("Application starting up", context="startup")
    try:
        # Database connection check
        from app.db.database import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        log_info("Database connection established", context="startup")
        
        # Initialize RAG controlled graph checkpoints
        try:
            from app.services.rag_workflow_service import setup_checkpoints
            await setup_checkpoints()
            app.state.rag_graph_ready = True
            log_info("RAG graph checkpoints initialized and ready", context="startup")
        except Exception as graph_err:
            log_error(
                graph_err,
                context="startup",
                message="Failed to initialize RAG graph checkpoints"
            )
            app.state.rag_graph_ready = False
        
        # Preload ML models for faster first request
        log_info("Preloading ML models...", context="startup")
        try:
            from app.services.reranker import preload_model as preload_reranker
            from app.services.cross_encoder_verifier import preload_model as preload_cross_encoder
            
            # Preload models in background (non-blocking)
            import asyncio
            await asyncio.to_thread(preload_reranker)
            log_info("Reranker model preloaded", context="startup")
            
            await asyncio.to_thread(preload_cross_encoder)
            log_info("Cross-encoder verification model preloaded", context="startup")
            
        except Exception as model_error:
            log_error(
                model_error,
                context="startup",
                message="Failed to preload some models - they will load on first use"
            )
        
        log_info("Application startup completed", context="startup")

    except Exception as e:
        log_error(e, context="startup")

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event"""
    log_info("Application shutting down", context="shutdown")
    try:
        # Close database connections
        from app.db.database import engine
        engine.dispose()
        log_info("Database connections closed", context="shutdown")
    except Exception as e:
        log_error(e, context="shutdown")










    
    
    
    





    

