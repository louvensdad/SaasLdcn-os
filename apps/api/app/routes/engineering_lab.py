from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.engines.engineering_lab_engine import engineering_lab_engine
from app.repositories.user_repository import AuditLogRepository
from app.schemas.engineering_lab import (
    EngineeringLabOverview,
    EngineeringLabTerminalRequest,
    EngineeringLabTerminalResponse,
)

router = APIRouter(tags=["engineering-lab"])


def _audit(user_id: str, event_code: str) -> None:
    """Best-effort audit of a real Laboratory execution so it becomes a genuine
    analytics data source (audit F2). Never blocks the action."""
    try:
        AuditLogRepository(get_settings().sqlite_path).record(user_id=user_id, event_code=event_code)
    except Exception:  # noqa: BLE001
        pass


@router.get("/engineering-lab/projects/{project_id}/overview", response_model=EngineeringLabOverview)
def engineering_lab_overview(project_id: str) -> EngineeringLabOverview:
    return engineering_lab_engine.overview(project_id)


@router.post("/engineering-lab/projects/{project_id}/terminal", response_model=EngineeringLabTerminalResponse)
def engineering_lab_terminal(
    project_id: str, payload: EngineeringLabTerminalRequest, user: CurrentUser
) -> EngineeringLabTerminalResponse:
    result = engineering_lab_engine.run_terminal(project_id, payload.command, payload.timeout_seconds)
    _audit(user["user_id"], "laboratory_terminal_run")
    return result
