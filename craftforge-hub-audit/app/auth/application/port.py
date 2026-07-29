from abc import ABC, abstractmethod
from app.auth.schemas import RegisterRequest, LoginRequest, RefreshRequest, TokenResponse, UserResponse


class AuthPort(ABC):
    @abstractmethod
    async def register(self, request: RegisterRequest) -> UserResponse: ...

    @abstractmethod
    async def login(self, request: LoginRequest) -> TokenResponse: ...

    @abstractmethod
    async def refresh(self, request: RefreshRequest) -> TokenResponse: ...

    @abstractmethod
    async def me(self, user_id: str) -> UserResponse: ...