from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.engines.engineering_lab_engine import engineering_lab_engine
from app.repositories.user_repository import AuditLogRepository
from app.schemas.engineering_lab import (
    EngineeringLabOverview,
    EngineeringLabTerminalRequest,
    EngineeringLabTerminalResponse,
)
from app.services.project_writer import ProjectWriter

router = APIRouter(tags=["engineering-lab"])


def _audit(user_id: str, event_code: str) -> None:
    """Best-effort audit of a real Laboratory execution so it becomes a genuine
    analytics data source (audit F2). Never blocks the action."""
    try:
        AuditLogRepository(get_settings().sqlite_path).record(user_id=user_id, event_code=event_code)
    except Exception:  # noqa: BLE001
        pass


def _assert_owns_project(project_id: str, user: dict) -> None:
    """Same ownership rule as meta_factory's _owned_meta_project: the Laboratory
    reads and executes commands against a generated project's own directory, so
    a caller who doesn't own it must get a 404, never a peek at another user's
    files or a shell in their project."""
    owner = ProjectWriter().read_owner(project_id)
    if owner is not None and owner != user["user_id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated project was not found.")


@router.get("/engineering-lab/projects/{project_id}/overview", response_model=EngineeringLabOverview)
def engineering_lab_overview(project_id: str, user: CurrentUser) -> EngineeringLabOverview:
    _assert_owns_project(project_id, user)
    return engineering_lab_engine.overview(project_id)


@router.post("/engineering-lab/projects/{project_id}/terminal", response_model=EngineeringLabTerminalResponse)
def engineering_lab_terminal(
    project_id: str, payload: EngineeringLabTerminalRequest, user: CurrentUser
) -> EngineeringLabTerminalResponse:
    _assert_owns_project(project_id, user)
    result = engineering_lab_engine.run_terminal(project_id, payload.command, payload.timeout_seconds)
    _audit(user["user_id"], "laboratory_terminal_run")
    return result
