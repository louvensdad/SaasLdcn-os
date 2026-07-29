from fastapi import APIRouter, Depends, status
from app.auth.schemas import (
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    UserResponse,
    Forbidden,
    NotFound,
    Unauthorized,
    InternalServerError,
    RateLimit,
    ValidationError
)
from app.auth.application.auth_service import StubAuthService
from app.auth.application.port import AuthPort

router = APIRouter()

# Em produção, substituir por injeção real de dependência com container
def get_auth_service() -> AuthPort:
    return StubAuthService()


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ValidationError},
        409: {"model": Forbidden},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Registrar novo usuário"
)
async def register(body: RegisterRequest, service: AuthPort = Depends(get_auth_service)):
    return await service.register(body)


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={
        401: {"model": Unauthorized},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Autenticar usuário"
)
async def login(body: LoginRequest, service: AuthPort = Depends(get_auth_service)):
    return await service.login(body)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    responses={
        401: {"model": Unauthorized},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Renovar token de acesso"
)
async def refresh(body: RefreshRequest, service: AuthPort = Depends(get_auth_service)):
    return await service.refresh(body)


@router.get(
    "/me",
    response_model=UserResponse,
    responses={
        401: {"model": Unauthorized},
        429: {"model": RateLimit},
        500: {"model": InternalServerError}
    },
    summary="Obter usuário logado"
)
async def me(service: AuthPort = Depends(get_auth_service)):
    # Em produção, user obtido via dependência de autenticação
    user_id = "stub-user-id"
    return await service.me(user_id)