from dataclasses import dataclass
from app.instance.domain.interfaces.instance_repository import InstanceRepository
from app.instance.application.instance_policy_service import InstancePolicyService


@dataclass
class StartInstanceInput:
    instance_id: str
    user_id: str


@dataclass
class StartInstanceOutput:
    instance_id: str
    status: str


class StartInstanceUseCase:
    def __init__(
        self,
        instance_repository: InstanceRepository,
        policy_service: InstancePolicyService,
    ):
        self._instance_repository = instance_repository
        self._policy_service = policy_service

    async def execute(self, input_dto: StartInstanceInput) -> StartInstanceOutput:
        instance = await self._instance_repository.find_by_id(input_dto.instance_id, input_dto.user_id)
        if not instance:
            raise ValueError("Instância não encontrada")

        # Regra de negócio: não pode iniciar se já estiver online
        if instance.status == "online":
            raise ValueError("Instância já está online")

        # Verificar limite do plano
        await self._policy_service.check_instance_limit(input_dto.user_id)

        # Atualizar status
        instance.status = "online"
        await self._instance_repository.update(instance)

        return StartInstanceOutput(instance_id=str(instance.id), status=instance.status)