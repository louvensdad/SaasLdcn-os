from abc import ABC, abstractmethod
from uuid import UUID
from typing import Optional
from app.domain.entities.execution_log import ExecutionLog


class ExecutionLogRepository(ABC):
    @abstractmethod
    async def create(self, log: ExecutionLog) -> ExecutionLog:
        raise NotImplementedError

    @abstractmethod
    async def find_by_id(self, log_id: UUID) -> Optional[ExecutionLog]:
        raise NotImplementedError

    @abstractmethod
    async def find_by_user_id(self, user_id: UUID, skip: int = 0, limit: int = 100):
        raise NotImplementedError

    @abstractmethod
    async def find_by_macro_id(self, macro_id: UUID, skip: int = 0, limit: int = 100):
        raise NotImplementedError

    @abstractmethod
    async def update(self, log: ExecutionLog) -> ExecutionLog:
        raise NotImplementedError

    @abstractmethod
    async def delete(self, log_id: UUID) -> None:
        raise NotImplementedError