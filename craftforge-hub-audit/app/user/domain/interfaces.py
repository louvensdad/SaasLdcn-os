from abc import ABC, abstractmethod
from typing import Optional
from app.user.domain.models import User, RefreshToken

class UserRepository(ABC):
    @abstractmethod
    async def get_by_id(self, user_id: int) -> Optional[User]:
        ...

    @abstractmethod
    async def get_by_email(self, email: str) -> Optional[User]:
        ...

    @abstractmethod
    async def get_by_username(self, username: str) -> Optional[User]:
        ...

    @abstractmethod
    async def create(self, user: User) -> User:
        ...

    @abstractmethod
    async def save(self, user: User) -> User:
        ...

class TokenService(ABC):
    @abstractmethod
    async def create_access_token(self, user_id: int, role: str) -> str:
        ...

    @abstractmethod
    async def create_refresh_token(self, user_id: int) -> str:
        ...

    @abstractmethod
    async def verify_refresh_token(self, token: str) -> Optional[int]:
        ...

    @abstractmethod
    async def revoke_refresh_token(self, jti: str) -> None:
        ...

class PasswordHasher(ABC):
    @abstractmethod
    def hash_password(self, password: str) -> str:
        ...

    @abstractmethod
    def verify_password(self, password: str, hashed: str) -> bool:
        ...