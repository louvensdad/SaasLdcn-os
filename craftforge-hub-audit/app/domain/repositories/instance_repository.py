from abc import ABC, abstractmethod
from uuid import UUID
from typing import Optional
from app.domain.entities.instance import Instance


class InstanceRepository(ABC):
    @abstractmethod
    async def create(self, instance: Instance) -> Instance:
        raise NotImplementedError

    @abstractmethod
    async def find_by_id(self, instance_id: UUID) -> Optional[Instance]:
        raise NotImplementedError

    @abstractmethod
    async def find_by_account_id(self, account_id: UUID) -> Optional[Instance]:
        raise NotImplementedError

    @abstractmethod
    async def find_active_by_user_id(self, user_id: UUID, skip: int = 0, limit: int = 100):
        raise NotImplementedError

    @abstractmethod
    async def update(self, instance: Instance) -> Instance:
        raise NotImplementedError

    @abstractmethod
    async def delete(self, instance_id: UUID) -> None:
        raise NotImplementedError

    @abstractmethod
    async def count_active_by_user_id(self, user_id: UUID) -> int:
        raise NotImplementedError