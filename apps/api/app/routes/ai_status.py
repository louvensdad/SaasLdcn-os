from __future__ import annotations

from fastapi import APIRouter

from app.schemas.ai_status import AiStatusResponse
from app.services.ai_availability import ai_status

router = APIRouter(tags=["ai-status"])


@router.get("/ai-status", response_model=AiStatusResponse)
def get_ai_status() -> AiStatusResponse:
    """Whether the platform is running real AI (server provider configured) or the
    honest deterministic preview. Drives the global UI mode badge."""
    return AiStatusResponse.model_validate(ai_status())
