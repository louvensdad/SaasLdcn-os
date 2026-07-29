from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
import uuid
from app.core.config import settings
from app.user.domain.interfaces import TokenService
from app.user.infrastructure.repositories.user_repository import UserRepository

class JwtTokenService(TokenService):
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    async def create_access_token(self, user_id: int, role: str) -> str:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
        payload = {
            "sub": str(user_id),
            "role": role,
            "exp": expire,
            "type": "access",
        }
        return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)

    async def create_refresh_token(self, user_id: int) -> str:
        jti = str(uuid.uuid4())
        expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
        payload = {
            "sub": str(user_id),
            "jti": jti,
            "exp": expire,
            "type": "refresh",
        }
        token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
        # Persist refresh token
        from app.user.domain.models import RefreshToken
        refresh_token_obj = RefreshToken(
            jti=jti,
            user_id=user_id,
            token=token,
            expires_at=expire,
            revoked=False,
        )
        await self.user_repo.create_refresh_token(refresh_token_obj)
        return token

    async def verify_refresh_token(self, token: str) -> Optional[int]:
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
            if payload.get("type") != "refresh":
                return None
            jti = payload.get("jti")
            if not jti:
                return None
            stored_token = await self.user_repo.get_refresh_token_by_jti(jti)
            if not stored_token or stored_token.revoked:
                return None
            if datetime.now(timezone.utc) > stored_token.expires_at:
                return None
            return int(payload["sub"])
        except JWTError:
            return None

    async def revoke_refresh_token(self, jti: str) -> None:
        await self.user_repo.revoke_refresh_token(jti)