from dataclasses import dataclass
from app.user.domain.interfaces.user_repository import UserRepository


@dataclass
class GetCurrentUserOutput:
    user_id: str
    email: str
    name: str
    role: str
    plan: str


class GetCurrentUserUseCase:
    def __init__(self, user_repository: UserRepository):
        self._user_repository = user_repository

    async def execute(self, user_id: str) -> GetCurrentUserOutput:
        user = await self._user_repository.find_by_id(user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        return GetCurrentUserOutput(
            user_id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            plan=user.plan,
        )