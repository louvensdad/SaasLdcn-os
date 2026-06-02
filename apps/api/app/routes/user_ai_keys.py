from __future__ import annotations

from fastapi import APIRouter, Request, status

from app.schemas.secure_extensions import PlannedSecureExtensionResponse

router = APIRouter(tags=["user-ai-keys"])


def _planned_response() -> PlannedSecureExtensionResponse:
    return PlannedSecureExtensionResponse()


@router.get(
    "/user-ai-keys/status",
    response_model=PlannedSecureExtensionResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def get_user_ai_key_status() -> PlannedSecureExtensionResponse:
    return _planned_response()


@router.post(
    "/user-ai-keys/session",
    response_model=PlannedSecureExtensionResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def create_user_ai_key_session(request: Request) -> PlannedSecureExtensionResponse:
    del request
    return _planned_response()


@router.delete(
    "/user-ai-keys/session",
    response_model=PlannedSecureExtensionResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def delete_user_ai_key_session() -> PlannedSecureExtensionResponse:
    return _planned_response()
