from dataclasses import dataclass, field
from app.account.domain.interfaces.account_repository import AccountRepository


@dataclass
class AccountListItem:
    account_id: str
    game_username: str
    game_server: str | None
    status: str  # online/offline (via instância associada)
    created_at: str


@dataclass
class ListAccountsOutput:
    accounts: list[AccountListItem] = field(default_factory=list)


class ListAccountsUseCase:
    def __init__(self, account_repository: AccountRepository):
        self._account_repository = account_repository

    async def execute(self, user_id: str) -> ListAccountsOutput:
        accounts = await self._account_repository.find_by_user_id(user_id)
        items = []
        for acc in accounts:
            # Buscar instância associada (simplificado; poderia ser eager load)
            instance = await self._account_repository.get_instance_for_account(acc.id)
            status = instance.status if instance else "unknown"
            items.append(
                AccountListItem(
                    account_id=str(acc.id),
                    game_username=acc.game_username,
                    game_server=acc.game_server,
                    status=status,
                    created_at=acc.created_at.isoformat() if acc.created_at else "",
                )
            )
        return ListAccountsOutput(accounts=items)