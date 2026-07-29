from dataclasses import dataclass, field
from app.instance.domain.interfaces.instance_repository import InstanceRepository
from app.instance.application.instance_policy_service import InstancePolicyService


@dataclass
class StartAllInstancesOutput:
    started: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)


class StartAllInstancesUseCase:
    def __init__(
        self,
        instance_repository: InstanceRepository,
        policy_service: InstancePolicyService,
    ):
        self._instance_repository = instance_repository
        self._policy_service = policy_service

    async def execute(self, user_id: str) -> StartAllInstancesOutput:
        instances = await self._instance_repository.find_by_user_id(user_id)
        started = []
        failed = []
        for instance in instances:
            if instance.status == "online":
                continue
            try:
                await self._policy_service.check_instance_limit(user_id)
                instance.status = "online"
                await self._instance_repository.update(instance)
                started.append(str(instance.id))
            except ValueError as e:
                failed.append(str(instance.id))
        return StartAllInstancesOutput(started=started, failed=failed)