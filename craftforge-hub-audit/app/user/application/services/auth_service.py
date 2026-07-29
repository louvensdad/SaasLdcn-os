from app.user.domain.interfaces import UserRepository, TokenService, PasswordHasher
from app.user.domain.models import User, UserRole
from fastapi import HTTPException, status
from app.core.config import settings
import uuid
from datetime import datetime, timedelta, timezone

class AuthService:
    def __init__(self, user_repo: UserRepository, token_service: TokenService, password_hasher: PasswordHasher):
        self.user_repo = user_repo
        self.token_service = token_service
        self.password_hasher = password_hasher

    async def register(self, email: str, username: str, password: str) -> User:
        # Validate password strength
        if len(password) < 8:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Senha deve ter no mínimo 8 caracteres")
        if not any(c.isupper() for c in password):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Senha deve conter pelo menos uma letra maiúscula")
        if not any(c.islower() for c in password):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Senha deve conter pelo menos uma letra minúscula")
        if not any(c.isdigit() for c in password):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Senha deve conter pelo menos um número")

        # Check uniqueness
        existing = await self.user_repo.get_by_email(email)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email já cadastrado")
        existing = await self.user_repo.get_by_username(username)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nome de usuário já em uso")

        hashed = self.password_hasher.hash_password(password)
        new_user = User(
            email=email,
            username=username,
            hashed_password=hashed,
            role=UserRole.USER,
            plan="free",
            is_active=True,
        )
        created = await self.user_repo.create(new_user)
        return created

    async def login(self, email: str, password: str) -> dict:
        user = await self.user_repo.get_by_email(email)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")
        if not self.password_hasher.verify_password(password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Conta desativada")

        access_token = await self.token_service.create_access_token(user_id=user.id, role=user.role.value)
        refresh_token = await self.token_service.create_refresh_token(user_id=user.id)
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
        }

    async def refresh_access_token(self, refresh_token_str: str) -> dict:
        user_id = await self.token_service.verify_refresh_token(refresh_token_str)
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido ou expirado")
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")
        access_token = await self.token_service.create_access_token(user_id=user.id, role=user.role.value)
        return {
            "access_token": access_token,
            "token_type": "bearer",
        }

    async def get_current_user_info(self, user_id: int) -> User:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
        return user