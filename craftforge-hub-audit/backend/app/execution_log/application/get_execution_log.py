from dataclasses import dataclass
from app.execution_log.domain.interfaces.execution_log_repository import ExecutionLogRepository


@dataclass
class GetExecutionLogOutput:
    log_id: str
    macro_name: str
    instance_id: str
    status: str
    started_at: str
    finished_at: str | None
    result: dict


class GetExecutionLogUseCase:
    def __init__(self, execution_log_repository: ExecutionLogRepository):
        self._execution_log_repository = execution_log_repository

    async def execute(self, log_id: str, user_id: str) -> GetExecutionLogOutput:
        log = await self._execution_log_repository.find_by_id(log_id, user_id)
        if not log:
            raise ValueError("Log não encontrado")
        status = "success" if log.result.get("success") else "failed"
        return GetExecutionLogOutput(
            log_id=str(log.id),
            macro_name=log.macro_name,
            instance_id=str(log.instance_id),
            status=status,
            started_at=log.started_at.isoformat() if log.started_at else "",
            finished_at=log.finished_at.isoformat() if log.finished_at else None,
            result=log.result,
        )