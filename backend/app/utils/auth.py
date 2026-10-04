from passlib.context import CryptContext
from jose import jwt
from typing import Optional 
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import or_
import re
from app.db.models import User, Base
from app.config import (
    SECRET_KEY, 
    REFRESH_SECRET_KEY, 
    ALGORITHM, 
    ACCESS_TOKEN_EXPIRE_MINUTES, 
    REFRESH_TOKEN_EXPIRE_DAYS
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Use bcrypt_sha256 to avoid the 72-byte password limitation of raw bcrypt.
# bcrypt_sha256 pre-hashes passwords with SHA-256 before applying bcrypt,
# allowing arbitrary-length passwords while preserving bcrypt's strength.
pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return int(user_id)  # Convert user_id to int
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_current_admin(
    user_id: int = Depends(get_current_user),
):
    from app.db.database import get_db
    import os
    
    db_gen = get_db()
    db: Session = next(db_gen)
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        admin_email = os.getenv("ADMIN_EMAIL", "default@example.com").strip().lower()
        user_email = (user.email or "").strip().lower()
        is_admin = bool(user.is_admin or (user_email and user_email == admin_email))

        if not is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")

        if not user.is_admin and is_admin:
            user.is_admin = True
            db.commit()

        return user
    finally:
        db.close()




def authenticate_user(db: Session, username_or_email: str, password: str):
    user = db.query(User).filter(or_(User.user_name == username_or_email, User.email == username_or_email)).first()
    if not user:
        return {"bool": False, "msg": "Incorrect user info"}
    if not verify_password(password, user.hashed_password):
        return {"bool": False, "msg": "Incorrect password"}
    if not user.email_verified:
        return {"bool": False, "msg": "Email not verified"}
    return {"bool": True, "user": user}




def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta is not None:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt



def create_refresh_token(data: dict):
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    data.update({"exp": expire})
    encoded_jwt = jwt.encode(data, REFRESH_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt  



def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


   





