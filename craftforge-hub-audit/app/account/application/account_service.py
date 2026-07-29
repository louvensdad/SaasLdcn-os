from datetime import datetime, timezone
from typing import List
from app.account.application.port import AccountPort
from app.account.schemas import CreateAccountRequest, UpdateAccountRequest, AccountResponse


class StubAccountService(AccountPort):
    async def list_accounts(self, user_id: str) -> List[AccountResponse]:
        return [
            AccountResponse(
                id="stub-account-1",
                user_id=user_id,
                username="char1",
                game_region="US",
                status="active",
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
        ]

    async def get_account(self, account_id: str, user_id: str) -> AccountResponse:
        return AccountResponse(
            id=account_id,
            user_id=user_id,
            username="stub_char",
            game_region="US",
            status="active",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

    async def create_account(self, request: CreateAccountRequest, user_id: str) -> AccountResponse:
        return AccountResponse(
            id="new-stub-account",
            user_id=user_id,
            username=request.username,
            game_region=request.game_region,
            status="active",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )

    async def update_account(self, account_id: str, request: UpdateAccountRequest, user_id: str) -> AccountResponse:
        return await self.get_account(account_id, user_id)

    async def delete_account(self, account_id: str, user_id: str) -> None:
        return None