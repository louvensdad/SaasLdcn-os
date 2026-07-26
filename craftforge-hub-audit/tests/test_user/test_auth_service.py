import pytest
from app.user.application.services.auth_service import AuthService
from app.user.domain.models import User, UserRole
from app.user.infrastructure.repositories.user_repository import UserRepository
from app.user.infrastructure.security.password_hashing import BcryptPasswordHasher
from app.user.infrastructure.security.jwt import JwtTokenService
from fastapi import HTTPException

@pytest.mark.asyncio
async def test_register_success(auth_service: AuthService, user_repo: UserRepository):
    user = await auth_service.register("test@example.com", "testuser", "Str0ngP@ss")
    assert user.email == "test@example.com"
    assert user.username == "testuser"
    assert user.role == UserRole.USER
    assert user.plan == "free"
    assert user.is_active is True

@pytest.mark.asyncio
async def test_register_duplicate_email(auth_service: AuthService, user_repo: UserRepository):
    await auth_service.register("duplicate@example.com", "user1", "Str0ngP@ss")
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.register("duplicate@example.com", "user2", "Str0ngP@ss")
    assert exc_info.value.status_code == 409

@pytest.mark.asyncio
async def test_register_weak_password(auth_service: AuthService, user_repo: UserRepository):
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.register("weak@example.com", "weakuser", "short")
    assert exc_info.value.status_code == 422

@pytest.mark.asyncio
async def test_login_success(auth_service: AuthService, user_repo: UserRepository):
    await auth_service.register("login@example.com", "loginuser", "Str0ngP@ss")
    tokens = await auth_service.login("login@example.com", "Str0ngP@ss")
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["token_type"] == "bearer"

@pytest.mark.asyncio
async def test_login_invalid_credentials(auth_service: AuthService, user_repo: UserRepository):
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.login("nonexistent@example.com", "wrongpassword")
    assert exc_info.value.status_code == 401

@pytest.mark.asyncio
async def test_refresh_token(auth_service: AuthService, user_repo: UserRepository):
    await auth_service.register("refresh@example.com", "refreshuser", "Str0ngP@ss")
    tokens = await auth_service.login("refresh@example.com", "Str0ngP@ss")
    new_tokens = await auth_service.refresh_access_token(tokens["refresh_token"])
    assert "access_token" in new_tokens
    assert new_tokens["token_type"] == "bearer"

@pytest.mark.asyncio
async def test_refresh_token_invalid(auth_service: AuthService, user_repo: UserRepository):
    with pytest.raises(HTTPException) as exc_info:
        await auth_service.refresh_access_token("invalid_token")
    assert exc_info.value.status_code == 401