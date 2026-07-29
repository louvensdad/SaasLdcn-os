import pytest
from unittest.mock import AsyncMock, MagicMock
from app.account.application.create_account import CreateAccountUseCase, CreateAccountInput
from app.account.application.list_accounts import ListAccountsUseCase
from app.account.application.get_account import GetAccountUseCase
from app.account.application.update_account import UpdateAccountUseCase, UpdateAccountInput
from app.account.application.delete_account import DeleteAccountUseCase


@pytest.fixture
def account_repo():
    repo = MagicMock()
    repo.save = AsyncMock()
    repo.find_by_user_id = AsyncMock()
    repo.find_by_id = AsyncMock()
    repo.update = AsyncMock()
    repo.delete = AsyncMock()
    repo.get_instance_for_account = AsyncMock()
    return repo


@pytest.fixture
def instance_repo():
    repo = MagicMock()
    repo.save = AsyncMock()
    repo.find_by_account_id = AsyncMock()
    repo.delete = AsyncMock()
    return repo


class TestCreateAccount:
    async def test_create_account_success(self, account_repo, instance_repo):
        use_case = CreateAccountUseCase(account_repository=account_repo, instance_repository=instance_repo)
        input_dto = CreateAccountInput(
            user_id="user-123",
            game_username="gamer1",
            game_password="pass123",
        )
        output = await use_case.execute(input_dto)
        assert output.game_username == "gamer1"
        assert output.instance_id is not None
        assert account_repo.save.await_count == 1
        assert instance_repo.save.await_count == 1


class TestListAccounts:
    async def test_list_accounts(self, account_repo, instance_repo):
        # Preparar mocks
        acc_mock = MagicMock()
        acc_mock.id = "acc-1"
        acc_mock.game_username = "gamer1"
        acc_mock.game_server = None
        acc_mock.created_at = None
        account_repo.find_by_user_id.return_value = [acc_mock]
        inst_mock = MagicMock()
        inst_mock.status = "offline"
        account_repo.get_instance_for_account.return_value = inst_mock

        use_case = ListAccountsUseCase(account_repository=account_repo)
        output = await use_case.execute("user-123")
        assert len(output.accounts) == 1
        assert output.accounts[0].game_username == "gamer1"
        assert output.accounts[0].status == "offline"


class TestGetAccount:
    async def test_get_account_success(self, account_repo, instance_repo):
        acc_mock = MagicMock()
        acc_mock.id = "acc-1"
        acc_mock.user_id = "user-123"
        acc_mock.game_username = "gamer1"
        acc_mock.game_password = "pass123"
        acc_mock.game_server = None
        acc_mock.notes = None
        account_repo.find_by_id.return_value = acc_mock

        inst_mock = MagicMock()
        inst_mock.id = "inst-1"
        inst_mock.status = "online"
        instance_repo.find_by_account_id.return_value = inst_mock

        use_case = GetAccountUseCase(account_repository=account_repo, instance_repository=instance_repo)
        output = await use_case.execute("acc-1", "user-123")
        assert output.game_username == "gamer1"
        assert output.instance_status == "online"
        assert output.instance_id == "inst-1"


class TestUpdateAccount:
    async def test_update_account_success(self, account_repo, instance_repo):
        acc_mock = MagicMock()
        acc_mock.id = "acc-1"
        account_repo.find_by_id.return_value = acc_mock

        use_case = UpdateAccountUseCase(account_repository=account_repo)
        input_dto = UpdateAccountInput(
            account_id="acc-1",
            user_id="user-123",
            game_password="newpass",
        )
        output = await use_case.execute(input_dto)
        assert output.account_id == "acc-1"
        assert acc_mock.game_password == "newpass"
        account_repo.update.assert_awaited_once()


class TestDeleteAccount:
    async def test_delete_account_success(self, account_repo, instance_repo):
        acc_mock = MagicMock()
        acc_mock.id = "acc-1"
        account_repo.find_by_id.return_value = acc_mock

        inst_mock = MagicMock()
        inst_mock.id = "inst-1"
        instance_repo.find_by_account_id.return_value = inst_mock

        use_case = DeleteAccountUseCase(account_repository=account_repo, instance_repository=instance_repo)
        output = await use_case.execute("acc-1", "user-123")
        assert output.success is True
        instance_repo.delete.assert_awaited_once_with("inst-1")
        account_repo.delete.assert_awaited_once_with("acc-1")