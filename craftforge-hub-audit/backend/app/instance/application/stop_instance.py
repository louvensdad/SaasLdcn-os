from dataclasses import dataclass
from app.instance.domain.interfaces.instance_repository import InstanceRepository


@dataclass
class StopInstanceInput:
    instance_id: str
    user_id: str


@dataclass
class StopInstanceOutput:
    instance_id: str
    status: str


class StopInstanceUseCase:
    def __init__(self, instance_repository: InstanceRepository):
        self._instance_repository = instance_repository

    async def execute(self, input_dto: StopInstanceInput) -> StopInstanceOutput:
        instance = await self._instance_repository.find_by_id(input_dto.instance_id, input_dto.user_id)
        if not instance:
            raise ValueError("Instância não encontrada")
        if instance.status == "offline":
            raise ValueError("Instância já está offline")

        instance.status = "offline"
        await self._instance_repository.update(instance)

        return StopInstanceOutput(instance_id=str(instance.id), status=instance.status)