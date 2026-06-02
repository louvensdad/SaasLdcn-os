from __future__ import annotations

from fastapi import APIRouter

from app.engines.system_status_engine import SystemStatusEngine
from app.schemas.system_status import SystemStatusResponse

router = APIRouter(tags=["system-status"])
engine = SystemStatusEngine()


@router.get("/system-status", response_model=SystemStatusResponse)
def get_system_status() -> SystemStatusResponse:
    return SystemStatusResponse.model_validate(engine.status())
