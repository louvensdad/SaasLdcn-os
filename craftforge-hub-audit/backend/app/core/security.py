from datetime import datetime, timedelta, timezone
from typing import Optional, Any
import jwt
from passlib.context import CryptContext  # using passlib with bcrypt <4.1 caution
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError  # alias for PyJWT errors

from app.core.config import settings

# Use bcrypt directly as recommended in constraints to avoid passlib issues
import bcrypt as _bcrypt

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt directly (avoiding passlib bcrypt<4.1 issue)."""
    salt = _bcrypt.gensalt()
    return _bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return _bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    **extra_claims: Any,
) -> str:
    """Create a JWT access token."""
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.jwt_access_token_expire_minutes)
    now = datetime.now(timezone.utc)
    to_encode = {
        "sub": subject,
        "exp": now + expires_delta,
        "iat": now,
        "type": "access",
        **extra_claims,
    }
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(
    subject: str,
    jti: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a JWT refresh token with a unique jti."""
    if expires_delta is None:
        expires_delta = timedelta(days=settings.jwt_refresh_token_expire_days)
    now = datetime.now(timezone.utc)
    to_encode = {
        "sub": subject,
        "jti": jti,
        "exp": now + expires_delta,
        "iat": now,
        "type": "refresh",
    }
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token. Raises HTTPException if invalid."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
) -> dict[str, Any]:
    """Dependency to get the current user from JWT token."""
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # In future, load user from DB here and return User model
    # For now, return payload (subject = user_id)
    return {"id": payload["sub"], "role": payload.get("role", "user")}