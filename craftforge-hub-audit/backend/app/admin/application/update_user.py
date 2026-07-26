from dataclasses import dataclass
from app.user.domain.interfaces.user_repository import UserRepository


@dataclass
class UpdateUserAdminInput:
    user_id: str
    role: str | None = None
    plan: str | None = None


@dataclass
class UpdateUserAdminOutput:
    success: bool


class UpdateUserAdminUseCase:
    def __init__(self, user_repository: UserRepository):
        self._user_repository = user_repository

    async def execute(self, input_dto: UpdateUserAdminInput) -> UpdateUserAdminOutput:
        user = await self._user_repository.find_by_id(input_dto.user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        if input_dto.role is not None:
            user.role = input_dto.role
        if input_dto.plan is not None:
            user.plan = input_dto.plan
        await self._user_repository.update(user)
        return UpdateUserAdminOutput(success=True)