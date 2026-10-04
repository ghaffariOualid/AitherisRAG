"""Database-backed limits that apply consistently across every API worker."""
from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.utils.auth import get_current_user


def enforce_chat_quota(
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Chat quota enforcement has been disabled."""
    return

