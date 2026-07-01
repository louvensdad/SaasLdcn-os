from __future__ import annotations

import base64
import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import uuid4

import jwt
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from passlib.context import CryptContext

from app.core.config import get_settings

TokenType = Literal["access", "refresh"]

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt. Never store plaintext passwords."""
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Constant-time verification of a plaintext password against its bcrypt hash."""
    try:
        return _pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        return False


def _fernet_key() -> bytes:
    """Derive a 32-byte urlsafe-base64 Fernet key for encrypting secrets at rest.

    Key separation (diagnosis M3): when ``settings.token_encryption_key`` is set
    (LDCN_TOKEN_ENC_KEY), the Fernet key is derived from it via HKDF with a fixed
    context label — independent of the JWT signing secret, so the two can be
    rotated separately and a leak of one does not expose the other.

    Backward compatibility: when no dedicated key is configured, we fall back to the
    legacy derivation (SHA-256 of ``settings.secret_key``) so data encrypted before
    this change still decrypts. As with JWTs, data encrypted under an ephemeral
    (auto-generated) secret cannot be decrypted after a restart unless a stable key
    is configured.
    """
    settings = get_settings()
    dedicated = settings.token_encryption_key
    if dedicated:
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"ldcn-token-encryption-v1",
        )
        return base64.urlsafe_b64encode(hkdf.derive(dedicated.encode("utf-8")))
    digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_secret(value: str) -> str:
    """Encrypt a secret (e.g. a provider access token) for storage at rest."""
    return Fernet(_fernet_key()).encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    """Decrypt a secret previously produced by :func:`encrypt_secret`."""
    try:
        return Fernet(_fernet_key()).decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise TokenError("invalid_token", "Stored credential could not be decrypted.") from exc


class TokenError(Exception):
    """Raised when a JWT cannot be decoded, has expired, or has the wrong type."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _create_token(*, subject: str, role: str, token_type: TokenType, expires_delta: timedelta) -> tuple[str, str, datetime]:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + expires_delta
    jti = uuid4().hex
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": expires_at,
        "jti": jti,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


def create_access_token(user_id: str, role: str) -> tuple[str, datetime]:
    settings = get_settings()
    token, _jti, expires_at = _create_token(
        subject=user_id,
        role=role,
        token_type="access",
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return token, expires_at


def create_refresh_token(user_id: str, role: str) -> tuple[str, str, datetime]:
    settings = get_settings()
    token, jti, expires_at = _create_token(
        subject=user_id,
        role=role,
        token_type="refresh",
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
    )
    return token, jti, expires_at


def decode_token(token: str, *, expected_type: TokenType) -> dict[str, Any]:
    """Decode and validate a JWT. Only HS256 is accepted (algorithm is pinned, never
    read from the token itself), and the token "type" claim must match what the
    caller expects so access tokens cannot be replayed as refresh tokens or vice versa."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token_expired", "Token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("invalid_token", "Token is invalid.") from exc

    if payload.get("type") != expected_type:
        raise TokenError("invalid_token_type", f"Expected a '{expected_type}' token.")
    if not payload.get("sub") or not payload.get("jti"):
        raise TokenError("invalid_token", "Token is missing required claims.")
    return payload
