import pytest
from unittest.mock import AsyncMock, MagicMock
from app.execution_log.application.list_execution_logs import ListExecutionLogsUseCase
from app.execution_log.application.get_execution_log import GetExecutionLogUseCase


@pytest.fixture
def execution_log_repo():
    repo = MagicMock()
    repo.find_by_user_id = AsyncMock()
    repo.find_by_id = AsyncMock()
    return repo


class TestListExecutionLogs:
    async def test_list_logs(self, execution_log_repo):
        log_mock = MagicMock()
        log_mock.id = "log-1"
        log_mock.macro_name = "Macro1"
        log_mock.instance_id = "inst-1"
        log_mock.result = {"success": True}
        log_mock.started_at = None
        log_mock.finished_at = None
        execution_log_repo.find_by_user_id.return_value = [log_mock]

        use_case = ListExecutionLogsUseCase(execution_log_repository=execution_log_repo)
        output = await use_case.execute("user-123")
        assert len(output.logs) == 1
        assert output.logs[0].macro_name == "Macro1"
        assert output.logs[0].status == "success"


class TestGetExecutionLog:
    async def test_get_log_success(self, execution_log_repo):
        log_mock = MagicMock()
        log_mock.id = "log-1"
        log_mock.macro_name = "Macro1"
        log_mock.instance_id = "inst-1"
        log_mock.result = {"success": False, "error": "timeout"}
        log_mock.started_at = None
        log_mock.finished_at = None
        execution_log_repo.find_by_id.return_value = log_mock

        use_case = GetExecutionLogUseCase(execution_log_repository=execution_log_repo)
        output = await use_case.execute("log-1", "user-123")
        assert output.status == "failed"
        assert output.result["error"] == "timeout"