import pytest
from unittest.mock import AsyncMock, MagicMock
from app.macro.application.create_macro import CreateMacroUseCase, CreateMacroInput
from app.macro.application.list_macros import ListMacrosUseCase
from app.macro.application.get_macro import GetMacroUseCase
from app.macro.application.update_macro import UpdateMacroUseCase, UpdateMacroInput
from app.macro.application.delete_macro import DeleteMacroUseCase
from app.macro.application.associate_macro import AssociateMacroUseCase, AssociateMacroInput
from app.macro.application.execute_macro import ExecuteMacroUseCase, ExecuteMacroInput


@pytest.fixture
def macro_repo():
    repo = MagicMock()
    repo.save = AsyncMock()
    repo.find_by_user_id = AsyncMock()
    repo.find_by_id = AsyncMock()
    repo.update = AsyncMock()
    repo.delete = AsyncMock()
    repo.associate_instances = AsyncMock()
    return repo


@pytest.fixture
def instance_repo():
    repo = MagicMock()
    repo.find_by_id = AsyncMock()
    return repo


@pytest.fixture
def execution_log_repo():
    repo = MagicMock()
    repo.save = AsyncMock()
    return repo


class TestCreateMacro:
    async def test_create_macro_success(self, macro_repo):
        use_case = CreateMacroUseCase(macro_repository=macro_repo)
        input_dto = CreateMacroInput(
            user_id="user-123",
            name="AutoFarm",
            script_content="print('hello')",
            description=None,
        )
        output = await use_case.execute(input_dto)
        assert output.macro_id is not None


class TestListMacros:
    async def test_list_macros(self, macro_repo):
        macro_mock = MagicMock()
        macro_mock.id = "mac-1"
        macro_mock.name = "AutoFarm"
        macro_mock.description = None
        macro_mock.created_at = None
        macro_repo.find_by_user_id.return_value = [macro_mock]

        use_case = ListMacrosUseCase(macro_repository=macro_repo)
        output = await use_case.execute("user-123")
        assert len(output.macros) == 1
        assert output.macros[0].name == "AutoFarm"


class TestGetMacro:
    async def test_get_macro_success(self, macro_repo):
        macro_mock = MagicMock()
        macro_mock.id = "mac-1"
        macro_mock.name = "AutoFarm"
        macro_mock.script_content = "print('hello')"
        macro_mock.description = None
        macro_mock.created_at = None
        macro_repo.find_by_id.return_value = macro_mock

        use_case = GetMacroUseCase(macro_repository=macro_repo)
        output = await use_case.execute("mac-1", "user-123")
        assert output.name == "AutoFarm"
        assert output.script_content == "print('hello')"


class TestUpdateMacro:
    async def test_update_macro_success(self, macro_repo):
        macro_mock = MagicMock()
        macro_mock.id = "mac-1"
        macro_mock.name = "OldName"
        macro_repo.find_by_id.return_value = macro_mock

        use_case = UpdateMacroUseCase(macro_repository=macro_repo)
        input_dto = UpdateMacroInput(
            macro_id="mac-1",
            user_id="user-123",
            name="NewName",
        )
        output = await use_case.execute(input_dto)
        assert output.macro_id == "mac-1"
        assert macro_mock.name == "NewName"


class TestDeleteMacro:
    async def test_delete_macro_success(self, macro_repo):
        macro_mock = MagicMock()
        macro_mock.id = "mac-1"
        macro_repo.find_by_id.return_value = macro_mock

        use_case = DeleteMacroUseCase(macro_repository=macro_repo)
        output = await use_case.execute("mac-1", "user-123")
        assert output.success is True
        macro_repo.delete.assert_awaited_once_with("mac-1")


class TestAssociateMacro:
    async def test_associate_success(self, macro_repo, instance_repo):
        macro_mock = MagicMock()
        macro_mock.id = "mac-1"
        macro_repo.find_by_id.return_value = macro_mock
        # Mock de instância válida
        inst_mock = MagicMock()
        instance_repo.find_by_id.return_value = inst_mock

        use_case = AssociateMacroUseCase(
            macro_repository=macro_repo,
            instance_repository=instance_repo,
        )
        input_dto = AssociateMacroInput(
            macro_id="mac-1",
            instance_ids=["inst-1", "inst-2"],
            user_id="user-123",
        )
        output = await use_case.execute(input_dto)
        assert output.success is True
        macro_repo.associate_instances.assert_awaited_once_with("mac-1", ["inst-1", "inst-2"])


class TestExecuteMacro:
    async def test_execute_macro_success(self, macro_repo, execution_log_repo):
        macro_mock = MagicMock()
        macro_mock.id = "mac-1"
        macro_repo.find_by_id.return_value = macro_mock

        use_case = ExecuteMacroUseCase(
            macro_repository=macro_repo,
            execution_log_repository=execution_log_repo,
        )
        input_dto = ExecuteMacroInput(
            macro_id="mac-1",
            instance_ids=["inst-1"],
            user_id="user-123",
        )
        output = await use_case.execute(input_dto)
        assert len(output.log_ids) == 1
        execution_log_repo.save.assert_awaited_once()