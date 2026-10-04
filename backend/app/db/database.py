from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool
from sqlalchemy import event
import os
from app.config import DATABASE_URL
from app.utils.logger import log_info, log_error
import time


engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,  
    max_overflow=30,  
    pool_pre_ping=True,  
    pool_recycle=3600,  
    echo=False,  # Set to True for SQL query logging
    connect_args={"connect_timeout": 10}  # Add timeout to prevent hanging
)

# Database connection monitoring
@event.listens_for(engine, "connect")
def receive_connect(dbapi_connection, connection_record):
    log_info("New database connection established", context="database")

@event.listens_for(engine, "checkout")
def receive_checkout(dbapi_connection, connection_record, connection_proxy):
    log_info("Database connection checked out", context="database")

@event.listens_for(engine, "checkin")
def receive_checkin(dbapi_connection, connection_record):
    log_info("Database connection checked in", context="database")


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Provide a database session. Schema changes are managed by Alembic."""
    db = SessionLocal()
    start_time = time.time()
    
    try:
        yield db
    except Exception as e:
        db.rollback()
        log_error(e, context="database_session")
        raise
    finally:
        duration = time.time() - start_time
        if duration > 1.0:  # Log slow database sessions
            log_info(f"Slow database session: {duration:.3f}s", context="database")
        db.close()

def get_db_stats():
    """Get database connection pool statistics"""
    pool = engine.pool
    return {
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalid": pool.invalid()
    }
