from dataclasses import dataclass, field
from app.instance.domain.interfaces.instance_repository import InstanceRepository


@dataclass
class InstanceListItem:
    instance_id: str
    account_id: str
    status: str
    fps: float
    ram: float


@dataclass
class ListInstancesOutput:
    instances: list[InstanceListItem] = field(default_factory=list)


class ListInstancesUseCase:
    def __init__(self, instance_repository: InstanceRepository):
        self._instance_repository = instance_repository

    async def execute(self, user_id: str) -> ListInstancesOutput:
        instances = await self._instance_repository.find_by_user_id(user_id)
        items = [
            InstanceListItem(
                instance_id=str(inst.id),
                account_id=str(inst.account_id),
                status=inst.status,
                fps=inst.fps,
                ram=inst.ram,
            )
            for inst in instances
        ]
        return ListInstancesOutput(instances=items)