from abc import ABC, abstractmethod
from typing import List
from app.admin.schemas import UserAdminResponse


class AdminPort(ABC):
    @abstractmethod
    async def list_users(self) -> List[UserAdminResponse]: ...

    @abstractmethod
    async def get_user(self, user_id: str) -> UserAdminResponse: ...