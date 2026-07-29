from datetime import datetime, timezone
from typing import List, Optional
from app.execution_log.application.port import ExecutionLogPort
from app.execution_log.schemas import ExecutionLogResponse


class StubExecutionLogService(ExecutionLogPort):
    async def list_logs(self, user_id: str, macro_id: str = None, instance_id: str = None) -> List[ExecutionLogResponse]:
        return [
            ExecutionLogResponse(
                id="stub-log-1",
                macro_id="stub-macro-1",
                instance_id="stub-instance-1",
                status="completed",
                started_at=datetime.now(timezone.utc),
                finished_at=datetime.now(timezone.utc),
                result={"summary": "success"}
            )
        ]

    async def get_log(self, log_id: str, user_id: str) -> ExecutionLogResponse:
        return ExecutionLogResponse(
            id=log_id,
            macro_id="stub-macro-1",
            instance_id="stub-instance-1",
            status="completed",
            started_at=datetime.now(timezone.utc),
            finished_at=datetime.now(timezone.utc),
            result={"summary": "success"}
        )