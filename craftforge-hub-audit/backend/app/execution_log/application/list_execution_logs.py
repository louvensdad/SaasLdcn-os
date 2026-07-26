from dataclasses import dataclass, field
from app.execution_log.domain.interfaces.execution_log_repository import ExecutionLogRepository


@dataclass
class ExecutionLogListItem:
    log_id: str
    macro_name: str
    instance_id: str
    status: str  # success, failed, running
    started_at: str
    finished_at: str | None


@dataclass
class ListExecutionLogsOutput:
    logs: list[ExecutionLogListItem] = field(default_factory=list)


class ListExecutionLogsUseCase:
    def __init__(self, execution_log_repository: ExecutionLogRepository):
        self._execution_log_repository = execution_log_repository

    async def execute(self, user_id: str) -> ListExecutionLogsOutput:
        logs = await self._execution_log_repository.find_by_user_id(user_id)
        items = [
            ExecutionLogListItem(
                log_id=str(log.id),
                macro_name=log.macro_name,  # Assumindo que o repositório faz join com macro
                instance_id=str(log.instance_id),
                status="success" if log.result.get("success") else "failed",
                started_at=log.started_at.isoformat() if log.started_at else "",
                finished_at=log.finished_at.isoformat() if log.finished_at else None,
            )
            for log in logs
        ]
        return ListExecutionLogsOutput(logs=items)