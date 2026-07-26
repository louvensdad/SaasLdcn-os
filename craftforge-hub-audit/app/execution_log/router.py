from fastapi import APIRouter, Depends, Path, Query
from typing import List, Optional
from app.execution_log.schemas import ExecutionLogResponse, NotFound, InternalServerError, RateLimit
from app.execution_log.application.execution_log_service import StubExecutionLogService
from app.execution_log.application.port import ExecutionLogPort

router = APIRouter()

def get_log_service() -> ExecutionLogPort:
    return StubExecutionLogService()


@router.get(
    "",
    response_model=List[ExecutionLogResponse],
    responses={
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Listar logs de execução"
)
async def list_logs(
    macro_id: Optional[str] = Query(None),
    instance_id: Optional[str] = Query(None),
    service: ExecutionLogPort = Depends(get_log_service)
):
    user_id = "stub-user-id"
    return await service.list_logs(user_id, macro_id, instance_id)


@router.get(
    "/{log_id}",
    response_model=ExecutionLogResponse,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Obter detalhes de um log"
)
async def get_log(log_id: str = Path(...), service: ExecutionLogPort = Depends(get_log_service)):
    user_id = "stub-user-id"
    return await service.get_log(log_id, user_id)