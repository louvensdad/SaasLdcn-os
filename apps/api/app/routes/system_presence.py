from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from app.core.deps import CurrentUser
from app.core.config import get_settings
from app.engines.engineering_presence_engine import EngineeringPresenceEngine
from app.engines.engineering_presence_engine import engineering_presence_engine
from app.repositories.tenant_repository import TenantAccessError, TenantRepository
from app.schemas.system_presence import PresenceDecisionResponse, SystemPresence

router = APIRouter(tags=["system-presence"])


def _workspace(user: dict, requested: str | None) -> str:
    repository = TenantRepository()
    try:
        if requested: return repository.require_workspace(requested, user["user_id"])["workspace_id"]
        current = repository.personal_workspace(user["user_id"])
        if current is None: current = repository.ensure_personal_workspace(user["user_id"], user["full_name"])
        return current["workspace_id"]
    except TenantAccessError as exc:
        raise HTTPException(status_code=404, detail="Workspace not found or inaccessible.") from exc


@router.get("/system/presence", response_model=SystemPresence)
def get_system_presence(user: CurrentUser, workspace_id: str | None = Query(default=None)) -> SystemPresence:
    return SystemPresence.model_validate(EngineeringPresenceEngine(get_settings().sqlite_path).collect(user["user_id"], _workspace(user, workspace_id)))


@router.get("/system/presence/decisions", response_model=PresenceDecisionResponse)
def get_presence_decisions(user: CurrentUser, workspace_id: str | None = Query(default=None), project_id: str | None = Query(default=None), category: str | None = Query(default=None), severity: str | None = Query(default=None), limit: int = Query(default=25, ge=1, le=100), cursor: str | None = None) -> PresenceDecisionResponse:
    workspace = _workspace(user, workspace_id)
    return PresenceDecisionResponse.model_validate(EngineeringPresenceEngine(get_settings().sqlite_path).decisions(user["user_id"], workspace, project_id=project_id, category=category, severity=severity, limit=limit, cursor=cursor))