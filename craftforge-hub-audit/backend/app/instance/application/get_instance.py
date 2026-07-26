from dataclasses import dataclass
from app.instance.domain.interfaces.instance_repository import InstanceRepository


@dataclass
class GetInstanceOutput:
    instance_id: str
    account_id: str
    status: str
    fps: float
    ram: float


class GetInstanceUseCase:
    def __init__(self, instance_repository: InstanceRepository):
        self._instance_repository = instance_repository

    async def execute(self, instance_id: str, user_id: str) -> GetInstanceOutput:
        instance = await self._instance_repository.find_by_id(instance_id, user_id)
        if not instance:
            raise ValueError("Instância não encontrada")
        return GetInstanceOutput(
            instance_id=str(instance.id),
            account_id=str(instance.account_id),
            status=instance.status,
            fps=instance.fps,
            ram=instance.ram,
        )