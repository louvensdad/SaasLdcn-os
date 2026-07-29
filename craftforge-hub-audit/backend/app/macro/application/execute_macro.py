from dataclasses import dataclass
from datetime import datetime, timezone
from app.macro.domain.interfaces.macro_repository import MacroRepository
from app.execution_log.domain.interfaces.execution_log_repository import ExecutionLogRepository
from app.execution_log.domain.models.execution_log import ExecutionLog


@dataclass
class ExecuteMacroInput:
    macro_id: str
    instance_ids: list[str]
    user_id: str


@dataclass
class ExecuteMacroOutput:
    log_ids: list[str]


class ExecuteMacroUseCase:
    def __init__(
        self,
        macro_repository: MacroRepository,
        execution_log_repository: ExecutionLogRepository,
    ):
        self._macro_repository = macro_repository
        self._execution_log_repository = execution_log_repository

    async def execute(self, input_dto: ExecuteMacroInput) -> ExecuteMacroOutput:
        macro = await self._macro_repository.find_by_id(input_dto.macro_id, input_dto.user_id)
        if not macro:
            raise ValueError("Macro não encontrada")

        log_ids = []
        for instance_id in input_dto.instance_ids:
            # Simular execução (no futuro, delegar ao agente via WebSocket)
            # Aqui registramos o log com timestamp e resultado
            log = ExecutionLog.create(
                macro_id=macro.id,
                instance_id=instance_id,
                started_at=datetime.now(timezone.utc),
                finished_at=datetime.now(timezone.utc),
                result={"success": True, "duration_seconds": 1.5},  # simulado
            )
            await self._execution_log_repository.save(log)
            log_ids.append(str(log.id))

        return ExecuteMacroOutput(log_ids=log_ids)