from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.core.security import TokenError, client_ip, decode_token, describe_device
from app.schemas.auth import (
    AccountDeletionResponse,
    ActivityExportResponse,
    AuthResponse,
    AvatarResponse,
    AvatarUpdateRequest,
    ConsentRequest,
    DataExportResponse,
    PasswordChangeRequest,
    RefreshRequest,
    SessionResponse,
    TwoFactorCodeRequest,
    TwoFactorEnrollResponse,
    UserLoginRequest,
    UserPublic,
    UserRegisterRequest,
    UserUpdateRequest,
)
from app.services.auth_service import AuthService, OAuthError, OAuthNotConfiguredError


router = APIRouter(prefix="/auth", tags=["auth"])
service = AuthService()

_OAUTH_STATE_COOKIE = "ldcn_oauth_state"


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


def _request_context(request: Request) -> tuple[str, str | None]:
    return client_ip(request, get_settings()), describe_device(request.headers.get("user-agent"))


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegisterRequest, request: Request, response: Response) -> AuthResponse:
    ip_address, device_label = _request_context(request)
    return _auth_response_with_cookie(
        service.register(payload, ip_address=ip_address, device_label=device_label), response
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLoginRequest, request: Request, response: Response) -> AuthResponse:
    ip_address, device_label = _request_context(request)
    return _auth_response_with_cookie(
        service.login(payload, ip_address=ip_address, device_label=device_label), response
    )


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
    ip_address, device_label = _request_context(request)
    return _auth_response_with_cookie(
        service.refresh(refresh_token, ip_address=ip_address, device_label=device_label), response
    )


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


def _oauth_callback_url(request: Request, provider: str) -> str:
    settings = get_settings()
    return f"{settings.api_public_base_url.rstrip('/')}{settings.api_prefix}/auth/oauth/{provider}/callback"


@router.get("/oauth/{provider}/start")
def oauth_start(provider: Literal["google", "github"], request: Request) -> RedirectResponse:
    settings = get_settings()
    frontend_url = settings.frontend_base_url.rstrip("/")
    redirect_uri = _oauth_callback_url(request, provider)
    try:
        authorize_url, state = service.oauth_authorize_url(provider, redirect_uri)
    except OAuthNotConfiguredError:
        return RedirectResponse(
            f"{frontend_url}/login?oauth=error&reason=not_configured",
            status_code=status.HTTP_302_FOUND,
        )

    response = RedirectResponse(authorize_url, status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        key=_OAUTH_STATE_COOKIE,
        value=state,
        max_age=600,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="lax",
        path=f"{settings.api_prefix}/auth/oauth",
    )
    return response


@router.get("/oauth/{provider}/callback")
def oauth_callback(
    provider: Literal["google", "github"],
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    settings = get_settings()
    frontend_url = settings.frontend_base_url.rstrip("/")
    cookie_state = request.cookies.get(_OAUTH_STATE_COOKIE)

    def _fail(reason: str) -> RedirectResponse:
        redirect = RedirectResponse(
            f"{frontend_url}/login?oauth=error&reason={reason}",
            status_code=status.HTTP_302_FOUND,
        )
        redirect.delete_cookie(_OAUTH_STATE_COOKIE, path=f"{settings.api_prefix}/auth/oauth")
        return redirect

    if error:
        return _fail("provider_denied")
    if not code or not state or not cookie_state or state != cookie_state:
        return _fail("invalid_state")

    ip_address, device_label = _request_context(request)
    try:
        payload, refresh_token = service.oauth_callback(
            provider,
            code=code,
            redirect_uri=_oauth_callback_url(request, provider),
            ip_address=ip_address,
            device_label=device_label,
        )
    except OAuthNotConfiguredError:
        return _fail("not_configured")
    except OAuthError:
        return _fail("exchange_failed")

    del payload  # the frontend re-fetches the session from the refresh cookie
    redirect = RedirectResponse(f"{frontend_url}/login?oauth=success", status_code=status.HTTP_302_FOUND)
    _set_refresh_cookie(redirect, refresh_token)
    redirect.delete_cookie(_OAUTH_STATE_COOKIE, path=f"{settings.api_prefix}/auth/oauth")
    return redirect


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


def _current_refresh_jti(request: Request) -> str | None:
    """Best-effort: identifies which session belongs to *this* browser, so the
    sessions list can flag it. A missing/invalid cookie just means nothing is
    flagged current -- never an error, since it's read-only context."""
    token = request.cookies.get(get_settings().refresh_cookie_name)
    if not token:
        return None
    try:
        return decode_token(token, expected_type="refresh")["jti"]
    except TokenError:
        return None


@router.get("/me/sessions", response_model=list[SessionResponse])
def list_my_sessions(request: Request, user: CurrentUser) -> list[SessionResponse]:
    return service.list_sessions(user, current_jti=_current_refresh_jti(request))


@router.delete("/me/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_my_session(session_id: str, user: CurrentUser) -> Response:
    service.revoke_session(user["user_id"], session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me/sessions", status_code=status.HTTP_204_NO_CONTENT)
def revoke_my_other_sessions(request: Request, user: CurrentUser) -> Response:
    service.revoke_other_sessions(user["user_id"], current_jti=_current_refresh_jti(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/2fa/enroll", response_model=TwoFactorEnrollResponse)
def enroll_2fa(user: CurrentUser) -> TwoFactorEnrollResponse:
    return service.enroll_2fa(user)


@router.post("/me/2fa/verify", response_model=UserPublic)
def verify_2fa(payload: TwoFactorCodeRequest, user: CurrentUser) -> UserPublic:
    return service.verify_2fa(user, payload.code)


@router.post("/me/2fa/disable", response_model=UserPublic)
def disable_2fa(payload: TwoFactorCodeRequest, user: CurrentUser) -> UserPublic:
    return service.disable_2fa(user, payload.code)


@router.post("/me/consent/revoke", response_model=UserPublic)
def revoke_my_consent(user: CurrentUser) -> UserPublic:
    return service.revoke_consent(user["user_id"])


@router.get("/me/activity-export", response_model=ActivityExportResponse)
def export_my_activity(user: CurrentUser) -> ActivityExportResponse:
    return service.export_activity(user)


@router.get("/me/avatar", response_model=AvatarResponse)
def get_my_avatar(user: CurrentUser) -> AvatarResponse:
    return AvatarResponse(avatar_url=service.get_avatar(user["user_id"]))


@router.put("/me/avatar", response_model=AvatarResponse)
def set_my_avatar(payload: AvatarUpdateRequest, user: CurrentUser) -> AvatarResponse:
    return AvatarResponse(avatar_url=service.set_avatar(user["user_id"], payload.avatar_url))


@router.post("/me/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all_devices(user: CurrentUser) -> Response:
    service.logout_everywhere(user["user_id"])
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@router.post("/me/deactivate", status_code=status.HTTP_200_OK)
def deactivate_my_account(user: CurrentUser) -> Response:
    result = service.deactivate_account(user["user_id"])
    response = JSONResponse(content=result, status_code=status.HTTP_200_OK)
    _clear_refresh_cookie(response)
    return response
