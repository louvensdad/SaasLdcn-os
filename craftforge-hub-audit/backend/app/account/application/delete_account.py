from dataclasses import dataclass
from app.account.domain.interfaces.account_repository import AccountRepository
from app.instance.domain.interfaces.instance_repository import InstanceRepository


@dataclass
class DeleteAccountOutput:
    success: bool


class DeleteAccountUseCase:
    def __init__(
        self,
        account_repository: AccountRepository,
        instance_repository: InstanceRepository,
    ):
        self._account_repository = account_repository
        self._instance_repository = instance_repository

    async def execute(self, account_id: str, user_id: str) -> DeleteAccountOutput:
        account = await self._account_repository.find_by_id(account_id, user_id)
        if not account:
            raise ValueError("Conta não encontrada")
        # Remover instância associada
        instance = await self._instance_repository.find_by_account_id(account.id)
        if instance:
            await self._instance_repository.delete(instance.id)
        await self._account_repository.delete(account.id)
        return DeleteAccountOutput(success=True)