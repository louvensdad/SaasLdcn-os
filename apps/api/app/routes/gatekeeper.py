from __future__ import annotations

from fastapi import APIRouter

from app.engines.gatekeeper_engine import build_gatekeeper_report
from app.schemas.gatekeeper import GatekeeperPreviewRequest, GatekeeperReport


router = APIRouter(tags=["gatekeeper"])


@router.post("/gatekeeper/preview", response_model=GatekeeperReport)
def preview_gatekeeper(payload: GatekeeperPreviewRequest) -> GatekeeperReport:
    return GatekeeperReport.model_validate(
        build_gatekeeper_report(payload.blueprint.model_dump(), payload.prompt_master.model_dump())
    )
