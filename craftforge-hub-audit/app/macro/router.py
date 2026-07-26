from fastapi import APIRouter, Depends, status, Path
from typing import List
from app.macro.schemas import CreateMacroRequest, UpdateMacroRequest, MacroResponse, ExecutionLogResponse, NotFound, Forbidden, InternalServerError, RateLimit
from app.macro.application.macro_service import StubMacroService
from app.macro.application.port import MacroPort

router = APIRouter()

def get_macro_service() -> MacroPort:
    return StubMacroService()


@router.get(
    "",
    response_model=List[MacroResponse],
    responses={
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Listar macros do usuário"
)
async def list_macros(service: MacroPort = Depends(get_macro_service)):
    user_id = "stub-user-id"
    return await service.list_macros(user_id)


@router.get(
    "/{macro_id}",
    response_model=MacroResponse,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Obter detalhes de uma macro"
)
async def get_macro(macro_id: str = Path(...), service: MacroPort = Depends(get_macro_service)):
    user_id = "stub-user-id"
    return await service.get_macro(macro_id, user_id)


@router.post(
    "",
    response_model=MacroResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Criar nova macro"
)
async def create_macro(body: CreateMacroRequest, service: MacroPort = Depends(get_macro_service)):
    user_id = "stub-user-id"
    return await service.create_macro(body, user_id)


@router.put(
    "/{macro_id}",
    response_model=MacroResponse,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Atualizar macro"
)
async def update_macro(macro_id: str, body: UpdateMacroRequest, service: MacroPort = Depends(get_macro_service)):
    user_id = "stub-user-id"
    return await service.update_macro(macro_id, body, user_id)


@router.delete(
    "/{macro_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Remover macro"
)
async def delete_macro(macro_id: str, service: MacroPort = Depends(get_macro_service)):
    user_id = "stub-user-id"
    await service.delete_macro(macro_id, user_id)


@router.post(
    "/{macro_id}/associate",
    status_code=status.HTTP_200_OK,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Associar macro a instâncias"
)
async def associate_macro(macro_id: str, body: List[str], service: MacroPort = Depends(get_macro_service)):
    user_id = "stub-user-id"
    await service.associate_macro(macro_id, body, user_id)
    return {"detail": "associado com sucesso"}


@router.post(
    "/{macro_id}/execute",
    response_model=ExecutionLogResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Executar macro em instâncias associadas"
)
async def execute_macro(macro_id: str, body: List[str], service: MacroPort = Depends(get_macro_service)):
    user_id = "stub-user-id"
    execution_log_id = await service.execute_macro(macro_id, body, user_id)
    return ExecutionLogResponse(
        id=execution_log_id,
        macro_id=macro_id,
        instance_id="stub-instance-id",
        status="running",
        started_at=datetime.now(timezone.utc),
    )