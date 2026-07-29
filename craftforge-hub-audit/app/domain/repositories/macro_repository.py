from abc import ABC, abstractmethod
from uuid import UUID
from typing import Optional
from app.domain.entities.macro import Macro


class MacroRepository(ABC):
    @abstractmethod
    async def create(self, macro: Macro) -> Macro:
        raise NotImplementedError

    @abstractmethod
    async def find_by_id(self, macro_id: UUID) -> Optional[Macro]:
        raise NotImplementedError

    @abstractmethod
    async def find_by_user_id(self, user_id: UUID, skip: int = 0, limit: int = 100):
        raise NotImplementedError

    @abstractmethod
    async def update(self, macro: Macro) -> Macro:
        raise NotImplementedError

    @abstractmethod
    async def delete(self, macro_id: UUID) -> None:
        raise NotImplementedError

    @abstractmethod
    async def associate_instance(self, macro_id: UUID, instance_id: UUID) -> None:
        raise NotImplementedError

    @abstractmethod
    async def find_associated_instances(self, macro_id: UUID):
        raise NotImplementedError