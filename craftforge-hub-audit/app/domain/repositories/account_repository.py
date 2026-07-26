from abc import ABC, abstractmethod
from uuid import UUID
from typing import Optional
from app.domain.entities.account import Account


class AccountRepository(ABC):
    @abstractmethod
    async def create(self, account: Account) -> Account:
        raise NotImplementedError

    @abstractmethod
    async def find_by_id(self, account_id: UUID) -> Optional[Account]:
        raise NotImplementedError

    @abstractmethod
    async def find_by_user_id(self, user_id: UUID, skip: int = 0, limit: int = 100):
        raise NotImplementedError

    @abstractmethod
    async def update(self, account: Account) -> Account:
        raise NotImplementedError

    @abstractmethod
    async def delete(self, account_id: UUID) -> None:
        raise NotImplementedError