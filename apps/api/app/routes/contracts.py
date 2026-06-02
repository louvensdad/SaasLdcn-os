from __future__ import annotations

from fastapi import APIRouter, Request, status

from app.schemas.secure_extensions import PlannedSecureExtensionResponse

router = APIRouter(tags=["contracts"])


def _planned_response() -> PlannedSecureExtensionResponse:
    return PlannedSecureExtensionResponse()


@router.post(
    "/contracts/upload-pdf",
    response_model=PlannedSecureExtensionResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def upload_pdf_contract(request: Request) -> PlannedSecureExtensionResponse:
    del request
    return _planned_response()


@router.post(
    "/contracts/analyze",
    response_model=PlannedSecureExtensionResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def analyze_pdf_contract(request: Request) -> PlannedSecureExtensionResponse:
    del request
    return _planned_response()


@router.get(
    "/contracts/{contract_id}/report",
    response_model=PlannedSecureExtensionResponse,
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def get_pdf_contract_report(contract_id: str) -> PlannedSecureExtensionResponse:
    del contract_id
    return _planned_response()
