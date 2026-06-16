from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.schemas.auth import (
    AccountDeletionResponse,
    AuthResponse,
    ConsentRequest,
    DataExportResponse,
    PasswordChangeRequest,
    RefreshRequest,
    UserLoginRequest,
    UserPublic,
    UserRegisterRequest,
    UserUpdateRequest,
)
from app.services.auth_service import AuthService


router = APIRouter(prefix="/auth", tags=["auth"])
service = AuthService()


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="lax",
        path=f"{settings.api_prefix}/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=f"{settings.api_prefix}/auth",
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite="lax",
    )


def _auth_response_with_cookie(
    issued: tuple[AuthResponse, str],
    response: Response,
) -> AuthResponse:
    payload, refresh_token = issued
    _set_refresh_cookie(response, refresh_token)
    return payload


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegisterRequest, response: Response) -> AuthResponse:
    return _auth_response_with_cookie(service.register(payload), response)


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLoginRequest, response: Response) -> AuthResponse:
    return _auth_response_with_cookie(service.login(payload), response)


@router.post("/refresh", response_model=AuthResponse)
def refresh_tokens(
    request: Request,
    response: Response,
    payload: RefreshRequest | None = None,
) -> AuthResponse:
    settings = get_settings()
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if refresh_token is None and payload is not None:
        refresh_token = payload.refresh_token
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is required.",
        )
    return _auth_response_with_cookie(service.refresh(refresh_token), response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, user: CurrentUser, payload: RefreshRequest | None = None) -> Response:
    settings = get_settings()
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if refresh_token is None and payload is not None:
        refresh_token = payload.refresh_token
    service.logout(user["user_id"], refresh_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@router.get("/me", response_model=UserPublic)
def get_me(user: CurrentUser) -> UserPublic:
    return service.get_profile(user)


@router.patch("/me", response_model=UserPublic)
def update_me(payload: UserUpdateRequest, user: CurrentUser) -> UserPublic:
    return service.update_profile(user["user_id"], payload)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: PasswordChangeRequest, user: CurrentUser) -> Response:
    service.change_password(user["user_id"], payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/consent", response_model=UserPublic)
def record_consent(payload: ConsentRequest, user: CurrentUser) -> UserPublic:
    return service.record_consent(user["user_id"], payload)


@router.get("/me/export", response_model=DataExportResponse)
def export_my_data(user: CurrentUser) -> DataExportResponse:
    return DataExportResponse.model_validate(service.export_data(user))


@router.delete("/me", response_model=AccountDeletionResponse)
def delete_my_account(user: CurrentUser) -> AccountDeletionResponse:
    return AccountDeletionResponse.model_validate(service.delete_account(user["user_id"]))
