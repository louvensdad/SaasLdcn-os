from fastapi import APIRouter, Depends, status, Path
from typing import List
from app.admin.schemas import UserAdminResponse, NotFound, Forbidden, InternalServerError, RateLimit
from app.admin.application.admin_service import StubAdminService
from app.admin.application.port import AdminPort

router = APIRouter()

def get_admin_service() -> AdminPort:
    return StubAdminService()


@router.get(
    "/users",
    response_model=List[UserAdminResponse],
    responses={
        403: {"model": Forbidden},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Listar todos os usuários (admin)"
)
async def list_users(service: AdminPort = Depends(get_admin_service)):
    return await service.list_users()


@router.get(
    "/users/{user_id}",
    response_model=UserAdminResponse,
    responses={
        404: {"model": NotFound},
        403: {"model": Forbidden},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Obter detalhes de um usuário (admin)"
)
async def get_user(user_id: str = Path(...), service: AdminPort = Depends(get_admin_service)):
    return await service.get_user(user_id)