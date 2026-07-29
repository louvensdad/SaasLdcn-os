from fastapi import APIRouter, Depends, status, Path
from typing import List
from app.instance.schemas import InstanceResponse, NotFound, Forbidden, InternalServerError, RateLimit
from app.instance.application.instance_service import StubInstanceService
from app.instance.application.port import InstancePort

router = APIRouter()

def get_instance_service() -> InstancePort:
    return StubInstanceService()


@router.get(
    "",
    response_model=List[InstanceResponse],
    responses={
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Listar instâncias do usuário logado"
)
async def list_instances(service: InstancePort = Depends(get_instance_service)):
    user_id = "stub-user-id"
    return await service.list_instances(user_id)


@router.get(
    "/{instance_id}",
    response_model=InstanceResponse,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Obter detalhes de uma instância"
)
async def get_instance(instance_id: str = Path(...), service: InstancePort = Depends(get_instance_service)):
    user_id = "stub-user-id"
    return await service.get_instance(instance_id, user_id)


@router.post(
    "/start",
    response_model=List[InstanceResponse],
    status_code=status.HTTP_200_OK,
    responses={
        403: {"model": Forbidden},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Iniciar todas as instâncias do usuário"
)
async def start_all_instances(service: InstancePort = Depends(get_instance_service)):
    user_id = "stub-user-id"
    return await service.start_all_instances(user_id)


@router.post(
    "/{instance_id}/start",
    response_model=InstanceResponse,
    responses={
        404: {"model": NotFound},
        409: {"model": Forbidden},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Iniciar uma instância específica"
)
async def start_instance(instance_id: str = Path(...), service: InstancePort = Depends(get_instance_service)):
    user_id = "stub-user-id"
    return await service.start_instance(instance_id, user_id)


@router.post(
    "/{instance_id}/stop",
    response_model=InstanceResponse,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Parar uma instância específica"
)
async def stop_instance(instance_id: str = Path(...), service: InstancePort = Depends(get_instance_service)):
    user_id = "stub-user-id"
    return await service.stop_instance(instance_id, user_id)