from dataclasses import dataclass
from app.user.domain.interfaces.user_repository import UserRepository


@dataclass
class GetUserAdminOutput:
    user_id: str
    email: str
    name: str
    role: str
    plan: str
    created_at: str


class GetUserAdminUseCase:
    def __init__(self, user_repository: UserRepository):
        self._user_repository = user_repository

    async def execute(self, user_id: str) -> GetUserAdminOutput:
        user = await self._user_repository.find_by_id(user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        return GetUserAdminOutput(
            user_id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            plan=user.plan,
            created_at=user.created_at.isoformat() if user.created_at else "",
        )