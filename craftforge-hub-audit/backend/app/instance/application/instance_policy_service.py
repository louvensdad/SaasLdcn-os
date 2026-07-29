from dataclasses import dataclass
from app.instance.domain.interfaces.instance_repository import InstanceRepository
from app.user.domain.interfaces.user_repository import UserRepository


class InstancePolicyService:
    """Serviço de políticas relacionadas a instâncias (limites por plano)."""

    PLAN_LIMITS = {
        "free": 1,
        "basic": 3,
        "pro": 10,
        "enterprise": 100,
    }

    def __init__(
        self,
        user_repository: UserRepository,
        instance_repository: InstanceRepository,
    ):
        self._user_repository = user_repository
        self._instance_repository = instance_repository

    async def check_instance_limit(self, user_id: str) -> None:
        user = await self._user_repository.find_by_id(user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        plan = user.plan
        limit = self.PLAN_LIMITS.get(plan, 1)
        active_count = await self._instance_repository.count_active_by_user_id(user_id)
        if active_count >= limit:
            raise ValueError(f"Limite de instâncias simultâneas atingido para o plano '{plan}' (máximo {limit})")