import pytest
from unittest.mock import AsyncMock
from app.account.application.account_service import AccountService
from app.account.models import Account

@pytest.mark.asyncio
class TestAccountService:
    async def test_create_account(self):
        repo = AsyncMock()
        repo.create = AsyncMock(return_value=Account(id=1, user_id=1, name="Main", credentials="{}"))
        service = AccountService(repo)
        account = await service.create_account(user_id=1, name="Main", credentials="{}")
        assert account.name == "Main"
        repo.create.assert_called_once()

    async def test_list_accounts_by_user(self):
        repo = AsyncMock()
        repo.find_by_user = AsyncMock(return_value=[Account(id=1, user_id=1, name="A", credentials="{}")])
        service = AccountService(repo)
        accounts = await service.list_accounts(user_id=1)
        assert len(accounts) == 1
        assert accounts[0].name == "A"