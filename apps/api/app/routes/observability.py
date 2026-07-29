from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.repositories.llm_decision_trace_repository import LlmDecisionTraceRepository
from app.repositories.project_room_repository import ProjectRoomRepository
from app.schemas.observability import LlmDecisionTrace
from app.services.project_writer import ProjectWriter

router = APIRouter(tags=["observability"])


def _owns_project(project_id: str, owner_user_id: str) -> bool:
    """A `project_id` on a decision trace may name either a generated project
    (ProjectWriter) or a pre-generation ProjectRoom -- callers record whichever
    they had in scope (see router.py's `project_id` kwarg). Checked against
    both rather than guessing which kind it is."""
    owner = ProjectWriter().read_owner(project_id)
    if owner is not None:
        return owner == owner_user_id
    return ProjectRoomRepository().get_for_owner(project_id, owner_user_id) is not None


@router.get("/observability/decisions", response_model=list[LlmDecisionTrace])
def list_decision_traces(project_id: str, user: CurrentUser) -> list[LlmDecisionTrace]:
    """AI decision-observability (vault 65): why a model/agent was chosen for
    a given project, most recent first. `project_id` is required -- there is
    no owner column on the trace itself, so an unscoped listing would have no
    honest way to restrict it to the caller's own data."""
    if not _owns_project(project_id, user["user_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project was not found.")
    rows = LlmDecisionTraceRepository().list_for_project(project_id)
    return [LlmDecisionTrace.model_validate(row) for row in rows]


@router.get("/observability/decisions/{trace_id}", response_model=LlmDecisionTrace)
def get_decision_trace(trace_id: str, user: CurrentUser) -> LlmDecisionTrace:
    row = LlmDecisionTraceRepository().get(trace_id)
    if row is None or not row.get("project_id") or not _owns_project(row["project_id"], user["user_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision trace was not found.")
    return LlmDecisionTrace.model_validate(row)
