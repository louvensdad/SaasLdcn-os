from __future__ import annotations

from fastapi import APIRouter

from app.engines.engineering_lab_engine import engineering_lab_engine
from app.schemas.engineering_lab import (
    EngineeringLabOverview,
    EngineeringLabTerminalRequest,
    EngineeringLabTerminalResponse,
)

router = APIRouter(tags=["engineering-lab"])


@router.get("/engineering-lab/projects/{project_id}/overview", response_model=EngineeringLabOverview)
def engineering_lab_overview(project_id: str) -> EngineeringLabOverview:
    return engineering_lab_engine.overview(project_id)


@router.post("/engineering-lab/projects/{project_id}/terminal", response_model=EngineeringLabTerminalResponse)
def engineering_lab_terminal(project_id: str, payload: EngineeringLabTerminalRequest) -> EngineeringLabTerminalResponse:
    return engineering_lab_engine.run_terminal(project_id, payload.command, payload.timeout_seconds)
