from abc import ABC, abstractmethod
from typing import List
from app.execution_log.schemas import ExecutionLogResponse


class ExecutionLogPort(ABC):
    @abstractmethod
    async def list_logs(self, user_id: str, macro_id: str = None, instance_id: str = None) -> List[ExecutionLogResponse]: ...

    @abstractmethod
    async def get_log(self, log_id: str, user_id: str) -> ExecutionLogResponse: ...