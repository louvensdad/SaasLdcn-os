from fastapi import APIRouter, Depends, status, Path
from typing import List
from app.account.schemas import CreateAccountRequest, UpdateAccountRequest, AccountResponse, NotFound, Forbidden, InternalServerError, RateLimit
from app.account.application.account_service import StubAccountService
from app.account.application.port import AccountPort

router = APIRouter()

def get_account_service() -> AccountPort:
    return StubAccountService()


@router.get(
    "",
    response_model=List[AccountResponse],
    responses={
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Listar contas do usuário logado"
)
async def list_accounts(service: AccountPort = Depends(get_account_service)):
    user_id = "stub-user-id"
    return await service.list_accounts(user_id)


@router.get(
    "/{account_id}",
    response_model=AccountResponse,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Obter detalhes de uma conta"
)
async def get_account(account_id: str = Path(...), service: AccountPort = Depends(get_account_service)):
    user_id = "stub-user-id"
    return await service.get_account(account_id, user_id)


@router.post(
    "",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": NotFound},  # validation error
        409: {"model": Forbidden},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Adicionar nova conta"
)
async def create_account(body: CreateAccountRequest, service: AccountPort = Depends(get_account_service)):
    user_id = "stub-user-id"
    return await service.create_account(body, user_id)


@router.put(
    "/{account_id}",
    response_model=AccountResponse,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Atualizar conta"
)
async def update_account(account_id: str, body: UpdateAccountRequest, service: AccountPort = Depends(get_account_service)):
    user_id = "stub-user-id"
    return await service.update_account(account_id, body, user_id)


@router.delete(
    "/{account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        404: {"model": NotFound},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Remover conta"
)
async def delete_account(account_id: str, service: AccountPort = Depends(get_account_service)):
    user_id = "stub-user-id"
    await service.delete_account(account_id, user_id)