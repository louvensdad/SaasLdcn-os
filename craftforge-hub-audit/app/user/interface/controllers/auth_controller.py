from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.rate_limit import rate_limiter
from app.user.domain.models import User
from app.user.application.services.auth_service import AuthService
from app.user.infrastructure.repositories.user_repository import UserRepository
from app.user.infrastructure.security.password_hashing import BcryptPasswordHasher
from app.user.infrastructure.security.jwt import JwtTokenService
from app.user.interface.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    user_repo = UserRepository(db)
    token_service = JwtTokenService(user_repo)
    password_hasher = BcryptPasswordHasher()
    return AuthService(user_repo, token_service, password_hasher)

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    auth_service: AuthService = Depends(get_auth_service),
    _=Depends(rate_limiter.check),
):
    user = await auth_service.register(body.email, body.username, body.password)
    return UserResponse(id=user.id, email=user.email, username=user.username, role=user.role, plan=user.plan, is_active=user.is_active, created_at=user.created_at)

@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    auth_service: AuthService = Depends(get_auth_service),
    _=Depends(rate_limiter.check),
):
    tokens = await auth_service.login(body.email, body.password)
    return TokenResponse(**tokens)

@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    auth_service: AuthService = Depends(get_auth_service),
    _=Depends(rate_limiter.check),
):
    tokens = await auth_service.refresh_access_token(body.refresh_token)
    return TokenResponse(**tokens)

@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse(id=current_user.id, email=current_user.email, username=current_user.username, role=current_user.role, plan=current_user.plan, is_active=current_user.is_active, created_at=current_user.created_at)