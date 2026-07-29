import pytest
from unittest.mock import AsyncMock, MagicMock
from app.admin.application.list_users import ListUsersAdminUseCase
from app.admin.application.get_user import GetUserAdminUseCase
from app.admin.application.update_user import UpdateUserAdminUseCase, UpdateUserAdminInput
from app.admin.application.delete_user import DeleteUserAdminUseCase


@pytest.fixture
def user_repo():
    repo = MagicMock()
    repo.find_all = AsyncMock()
    repo.find_by_id = AsyncMock()
    repo.update = AsyncMock()
    repo.delete = AsyncMock()
    return repo


class TestListUsersAdmin:
    async def test_list_users(self, user_repo):
        user_mock = MagicMock()
        user_mock.id = "u-1"
        user_mock.email = "admin@example.com"
        user_mock.name = "Admin"
        user_mock.role = "admin"
        user_mock.plan = "enterprise"
        user_mock.created_at = None
        user_repo.find_all.return_value = [user_mock]

        use_case = ListUsersAdminUseCase(user_repository=user_repo)
        output = await use_case.execute()
        assert len(output.users) == 1
        assert output.users[0].role == "admin"


class TestGetUserAdmin:
    async def test_get_user(self, user_repo):
        user_mock = MagicMock()
        user_mock.id = "u-1"
        user_mock.email = "user@example.com"
        user_mock.name = "User"
        user_mock.role = "user"
        user_mock.plan = "free"
        user_mock.created_at = None
        user_repo.find_by_id.return_value = user_mock

        use_case = GetUserAdminUseCase(user_repository=user_repo)
        output = await use_case.execute("u-1")
        assert output.email == "user@example.com"


class TestUpdateUserAdmin:
    async def test_update_user(self, user_repo):
        user_mock = MagicMock()
        user_mock.id = "u-1"
        user_repo.find_by_id.return_value = user_mock

        use_case = UpdateUserAdminUseCase(user_repository=user_repo)
        input_dto = UpdateUserAdminInput(user_id="u-1", role="admin", plan="pro")
        output = await use_case.execute(input_dto)
        assert output.success is True
        assert user_mock.role == "admin"
        assert user_mock.plan == "pro"
        user_repo.update.assert_awaited_once()


class TestDeleteUserAdmin:
    async def test_delete_user(self, user_repo):
        user_mock = MagicMock()
        user_mock.id = "u-1"
        user_repo.find_by_id.return_value = user_mock

        use_case = DeleteUserAdminUseCase(user_repository=user_repo)
        output = await use_case.execute("u-1")
        assert output.success is True
        user_repo.delete.assert_awaited_once_with("u-1")