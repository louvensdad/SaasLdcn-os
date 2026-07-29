from abc import ABC, abstractmethod
from typing import List
from app.instance.schemas import InstanceResponse


class InstancePort(ABC):
    @abstractmethod
    async def list_instances(self, user_id: str) -> List[InstanceResponse]: ...

    @abstractmethod
    async def get_instance(self, instance_id: str, user_id: str) -> InstanceResponse: ...

    @abstractmethod
    async def start_instance(self, instance_id: str, user_id: str) -> InstanceResponse: ...

    @abstractmethod
    async def stop_instance(self, instance_id: str, user_id: str) -> InstanceResponse: ...

    @abstractmethod
    async def start_all_instances(self, user_id: str) -> List[InstanceResponse]: ...