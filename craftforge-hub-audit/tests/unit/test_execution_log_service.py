import pytest
from unittest.mock import AsyncMock
from app.execution_log.application.log_service import ExecutionLogService
from app.execution_log.models import ExecutionLog
from datetime import datetime

@pytest.mark.asyncio
class TestExecutionLogService:
    async def test_list_logs_by_user(self):
        repo = AsyncMock()
        repo.find_by_user = AsyncMock(return_value=[
            ExecutionLog(id=1, macro_id=1, account_id=1, user_id=1, executed_at=datetime.utcnow(), result="{}", status="success")
        ])
        service = ExecutionLogService(repo)
        logs = await service.list_logs(user_id=1)
        assert len(logs) == 1
        assert logs[0].status == "success"

    async def test_get_log_detail(self):
        repo = AsyncMock()
        log = ExecutionLog(id=1, macro_id=1, account_id=1, user_id=1, executed_at=datetime.utcnow(), result='{"output":"done"}', status="success")
        repo.get = AsyncMock(return_value=log)
        service = ExecutionLogService(repo)
        result = await service.get_log(log_id=1)
        assert result.id == 1
        assert result.status == "success"