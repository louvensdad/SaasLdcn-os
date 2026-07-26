import pytest
from unittest.mock import AsyncMock, MagicMock
from app.auth.application.auth_service import AuthService
from app.user.models import User
from app.auth.schemas import RegisterRequest

@pytest.mark.asyncio
class TestAuthService:
    async def test_register_creates_user(self):
        repo = AsyncMock()
        repo.get_by_email = AsyncMock(return_value=None)
        repo.create = AsyncMock(return_value=User(id=1, email="test@test.com", username="test", hashed_password="hash"))
        auth_service = AuthService(repo, jwt_secret="secret")
        request = RegisterRequest(email="test@test.com", username="test", password="password")
        user = await auth_service.register(request)
        assert user.email == "test@test.com"
        repo.create.assert_called_once()

    async def test_register_duplicate_email_raises(self):
        repo = AsyncMock()
        repo.get_by_email = AsyncMock(return_value=User(id=1, email="dup@test.com", username="dup", hashed_password="hash"))
        auth_service = AuthService(repo, jwt_secret="secret")
        request = RegisterRequest(email="dup@test.com", username="new", password="password")
        with pytest.raises(ValueError, match="Email already registered"):
            await auth_service.register(request)

    async def test_login_valid_credentials(self):
        repo = AsyncMock()
        user = User(id=1, email="test@test.com", username="test", hashed_password="$2b$12$...")
        repo.get_by_email = AsyncMock(return_value=user)
        auth_service = AuthService(repo, jwt_secret="secret")
        # Mock password verification (assumes service uses bcrypt)
        with pytest.monkeypatch.context() as m:
            m.setattr("app.auth.application.auth_service.bcrypt.checkpw", lambda pw, hashed: True)
            token = await auth_service.login("test@test.com", "password")
        assert "access_token" in token
        assert token["token_type"] == "bearer"