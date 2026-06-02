from __future__ import annotations

from fastapi import APIRouter, Request, status

from app.schemas.secure_extensions import PlannedSecureExtensionResponse

router = APIRouter(tags=["git-export"])


def _planned_response() -> PlannedSecureExtensionResponse:
    return PlannedSecureExtensionResponse()


@router.post(
    "/git/export/github",
    response_model=PlannedSecureExtensionResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def export_to_github(request: Request) -> PlannedSecureExtensionResponse:
    del request
    return _planned_response()


@router.post(
    "/git/export/gitlab",
    response_model=PlannedSecureExtensionResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def export_to_gitlab(request: Request) -> PlannedSecureExtensionResponse:
    del request
    return _planned_response()


@router.get(
    "/git/export/status/{export_id}",
    response_model=PlannedSecureExtensionResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def get_git_export_status(export_id: str) -> PlannedSecureExtensionResponse:
    del export_id
    return _planned_response()
