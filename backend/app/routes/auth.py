from fastapi import APIRouter, Depends, HTTPException, status, Body, Response, Request
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import timedelta
from jose import jwt

from app.db.database import get_db
from app.services.email_service import send_verification_email
from app.db.models import User
from app.utils.auth import (
    pwd_context,
    create_access_token,
    create_refresh_token,
    authenticate_user,
    get_current_user,
    SECRET_KEY,
    REFRESH_SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS
)
from app.middleware.error_handler import AuthenticationException, ValidationException, DatabaseException
from app.middleware.error_handler import get_request_id
from app.middleware.rate_limiter import limiter, RATE_LIMITS
from app.utils.logger import log_info, log_error, log_warning
from app.config import COOKIE_SAMESITE, COOKIE_SECURE, FRONTEND_URL
import time
import os



router = APIRouter()


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key="jwt",
        value=refresh_token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        expires=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/api/auth",
    )



@router.post("/register")
@limiter.limit(RATE_LIMITS["auth"])
async def register( 
    request: Request,
    first_name: str = Body(...),
    last_name: str = Body(...),
    email: str = Body(...),
    password: str = Body(...),
    db: Session = Depends(get_db) ):
    
    start_time = time.time()
    request_id = get_request_id(request)
    
    try:
        log_info(
            "User registration attempt",
            context="auth_register",
            request_id=request_id,
            email=email,
            first_name=first_name
        )

        username = f"{first_name}.{last_name[0]}"
        db_user = db.query(User).filter(User.email == email).first()

        if db_user:
            log_warning(
                "Registration failed - email already exists",
                context="auth_register",
                request_id=request_id,
                email=email
            )
            raise ValidationException("Email already registered", {"email": email})
            
        db_user = db.query(User).filter(User.user_name == username).first()
        if db_user:
            log_warning(
                "Registration failed - username already exists",
                context="auth_register",
                request_id=request_id,
                username=username
            )
            raise ValidationException("Username already registered", {"username": username})
        
        hashed_password = pwd_context.hash(password)
        verification_token = create_access_token(data={"user": username}, expires_delta=timedelta(minutes=5))
        new_user = User(
            first_name=first_name, 
            last_name=last_name, 
            user_name=username, 
            email=email, 
            hashed_password=hashed_password, 
            email_verification_token=verification_token
        )
        db.add(new_user)
        db.commit()  

        user_id = new_user.id
        db.commit()
        
        # Send verification email
        try:
            send_verification_email(new_user.email, new_user.email_verification_token)
            log_info(
                "Verification email sent",
                context="auth_register",
                request_id=request_id,
                user_id=user_id,
                email=email
            )
        except Exception as e:
            log_error(
                e,
                context="email_service",
                request_id=request_id,
                user_id=user_id,
                email=email
            )

        duration = time.time() - start_time
        log_info(
            "User registered successfully",
            context="auth_register",
            request_id=request_id,
            user_id=user_id,
            duration=duration
        )

        return JSONResponse(content={"message": "User registered successfully"})
        
    except (ValidationException, AuthenticationException, DatabaseException):
        raise
    except Exception as e:
        duration = time.time() - start_time
        log_error(
            e,
            context="auth_register",
            request_id=request_id,
            duration=duration
        )
        raise DatabaseException("Registration failed", {"duration": duration})





@router.get("/verify-email/{verification_token}")
async def verify_email(
    request: Request,
    verification_token: str, 
    db: Session = Depends(get_db)
):
    start_time = time.time()
    request_id = get_request_id(request)
    
    try:
        log_info(
            "Email verification attempt",
            context="auth_verify_email",
            request_id=request_id,
            token_length=len(verification_token)
        )
        
        user = db.query(User).filter(User.email_verification_token == verification_token).first()
        if not user:
            log_warning(
                "Email verification failed - invalid token",
                context="auth_verify_email",
                request_id=request_id
            )
            raise ValidationException("Invalid verification token", {"token_length": len(verification_token)})

        # Mark the user's email as verified
        user.email_verified = True
        db.commit()

        # Generate and store refresh token
        refresh_token = create_refresh_token({"user": user.user_name, "user_id": user.id})
        user.refresh_token = refresh_token
        db.commit()

        duration = time.time() - start_time
        log_info(
            "Email verified successfully",
            context="auth_verify_email",
            request_id=request_id,
            user_id=user.id,
            duration=duration
        )

        return RedirectResponse(url=f"{FRONTEND_URL}/user/login")
        
    except (ValidationException, AuthenticationException, DatabaseException):
        raise
    except Exception as e:
        duration = time.time() - start_time
        log_error(
            e,
            context="auth_verify_email",
            request_id=request_id,
            duration=duration
        )
        raise DatabaseException("Email verification failed", {"duration": duration})



@router.post("/login")
@limiter.limit(RATE_LIMITS["auth"])
async def login(
    request: Request,
    username_or_email: str = Body(...), 
    password: str = Body(...), 
    db: Session = Depends(get_db)
):
    start_time = time.time()
    request_id = get_request_id(request)
    
    try:
        log_info(
            "User login attempt",
            context="auth_login",
            request_id=request_id,
            username_or_email=username_or_email
        )
        
        auth_result = authenticate_user(db, username_or_email, password)
        
        if not auth_result["bool"]:
            log_warning(
                "Login failed",
                context="auth_login",
                request_id=request_id,
                username_or_email=username_or_email,
                reason=auth_result["msg"]
            )
            raise AuthenticationException(auth_result["msg"], {"username_or_email": username_or_email})
        
        user = auth_result["user"]
        
        access_token = create_access_token(
            data={"user": user.user_name, "user_id": user.id}, 
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        refresh_token = create_refresh_token({"user": user.user_name, "user_id": user.id})
        user.refresh_token = refresh_token
        db.commit()
        admin_email = os.getenv("ADMIN_EMAIL", "default@example.com").strip().lower()
        user_email = (user.email or "").strip().lower()
        is_admin = bool(user.is_admin or (user_email and user_email == admin_email))
        if is_admin and not user.is_admin:
            user.is_admin = True
            db.commit()

        public_user_info = {
            'first_name': user.first_name, 
            'last_name': user.last_name,
            'email': user.email,
            'user_name': user.user_name,
            'is_admin': is_admin
        }
        
        content = {'user': public_user_info, "access_token": access_token, "token_type": "bearer"}
        response = JSONResponse(content=content)

        set_refresh_cookie(response, refresh_token)
        
        duration = time.time() - start_time
        log_info(
            "User logged in successfully",
            context="auth_login",
            request_id=request_id,
            user_id=user.id,
            duration=duration
        )
        
        return response
        
    except (ValidationException, AuthenticationException, DatabaseException):
        raise
    except Exception as e:
        duration = time.time() - start_time
        log_error(
            e,
            context="auth_login",
            request_id=request_id,
            duration=duration
        )
        raise DatabaseException("Login failed", {"duration": duration})



@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    refresh_token = request.cookies.get("jwt")
    if refresh_token:
        db.query(User).filter(User.refresh_token == refresh_token).update(
            {User.refresh_token: None},
            synchronize_session=False,
        )
        db.commit()
    response.delete_cookie("jwt", path="/api/auth", secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE)
    return {"message": "Logout successful"}


@router.get("/token_refresh")
@limiter.limit("10/minute")
def refresh_token(request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        current_refresh_token = request.cookies.get('jwt')
        if not current_refresh_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is missing")
        payload = jwt.decode(current_refresh_token, REFRESH_SECRET_KEY, algorithms=[ALGORITHM])

        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        db_user = db.query(User).filter(User.id == user_id).first()
        if not db_user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        if db_user.refresh_token != current_refresh_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked")

        access_token = create_access_token(data={"user": db_user.user_name , "user_id": db_user.id}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
        new_refresh_token = create_refresh_token({"user": db_user.user_name, "user_id": db_user.id})
        db_user.refresh_token = new_refresh_token
        db.commit()
        set_refresh_cookie(response, new_refresh_token)
        return {"access_token": access_token, "token_type": "bearer"}
    except jwt.JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    
    
@router.get("/protected")
def protected_route(token: str = Depends(oauth2_scheme)):
    try:
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
    except jwt.JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return {"message": "You are authorized!"}


@router.get("/me")
def get_current_user_profile(
    current_user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    admin_email = os.getenv("ADMIN_EMAIL", "default@example.com").strip().lower()
    user_email = (user.email or "").strip().lower()
    is_admin = bool(user.is_admin or (user_email and user_email == admin_email))
    if is_admin and not user.is_admin:
        user.is_admin = True
        db.commit()

    return {
        "user": {
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "user_name": user.user_name,
            "is_admin": is_admin
        }
    }
