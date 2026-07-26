from dataclasses import dataclass
from app.user.domain.interfaces.user_repository import UserRepository


@dataclass
class DeleteUserAdminOutput:
    success: bool


class DeleteUserAdminUseCase:
    def __init__(self, user_repository: UserRepository):
        self._user_repository = user_repository

    async def execute(self, user_id: str) -> DeleteUserAdminOutput:
        user = await self._user_repository.find_by_id(user_id)
        if not user:
            raise ValueError("Usuário não encontrado")
        await self._user_repository.delete(user.id)
        return DeleteUserAdminOutput(success=True)