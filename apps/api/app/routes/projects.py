from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.core.deps import CurrentUser
from app.core.config import get_settings
from app.repositories.blueprint_approval_repository import BlueprintApprovalRepository, hash_blueprint
from app.repositories.tenant_repository import TenantAccessError, TenantRepository, WORKSPACE_WRITE_ROLES
from app.repositories.user_repository import AuditLogRepository
from app.schemas.project import (
    BlueprintApprovalRecord,
    BlueprintApprovalRequest,
    ProjectRecord,
    ProjectUpdateRequest,
    SaveProjectFromWizardRequest,
)
from app.services.project_service import ProjectService


router = APIRouter(tags=["projects"])
service = ProjectService()


def _audit(user_id: str, event_code: str) -> None:
    """Best-effort audit trail (never breaks the request if the log is unavailable)."""
    try:
        AuditLogRepository(get_settings().sqlite_path).record(user_id=user_id, event_code=event_code)
    except Exception:  # noqa: BLE001 -- audit must never block the user action
        pass


@router.get("/projects", response_model=list[ProjectRecord])
def list_projects(
    response: Response,
    user: CurrentUser,
    limit: int | None = Query(None, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[ProjectRecord]:
    # Opt-in pagination (audit B7/M3): no params → full list (unchanged); the total
    # is always exposed via X-Total-Count so a client can page without a second call.
    response.headers["X-Total-Count"] = str(service.count_projects(user["user_id"]))
    return [ProjectRecord.model_validate(item) for item in service.list_projects(user_id=user["user_id"], limit=limit, offset=offset)]


@router.post("/projects/save-from-wizard", response_model=ProjectRecord, status_code=status.HTTP_201_CREATED)
def save_project_from_wizard(payload: SaveProjectFromWizardRequest, user: CurrentUser) -> ProjectRecord:
    repository = TenantRepository()
    if payload.workspace_id:
        try:
            workspace = repository.require_workspace(payload.workspace_id, user["user_id"], WORKSPACE_WRITE_ROLES)
        except TenantAccessError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found or insufficient permission.") from exc
    else:
        workspace = repository.personal_workspace(user["user_id"]) or repository.ensure_personal_workspace(user["user_id"], user["full_name"])
    return ProjectRecord.model_validate(
        service.save_from_wizard(payload, owner_user_id=user["user_id"], workspace_id=workspace["workspace_id"])
    )


@router.get("/projects/{project_id}", response_model=ProjectRecord)
def get_project(project_id: str, user: CurrentUser) -> ProjectRecord:
    return ProjectRecord.model_validate(service.get_project(project_id, user["user_id"]))


@router.patch("/projects/{project_id}", response_model=ProjectRecord)
def patch_project(project_id: str, payload: ProjectUpdateRequest, user: CurrentUser) -> ProjectRecord:
    return ProjectRecord.model_validate(service.update_project(project_id, payload, user["user_id"]))


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, user: CurrentUser) -> Response:
    service.delete_project(project_id, user["user_id"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/projects/{project_id}/approve-blueprint", response_model=BlueprintApprovalRecord)
def approve_blueprint(project_id: str, payload: BlueprintApprovalRequest, user: CurrentUser) -> BlueprintApprovalRecord:
    """Record an explicit human approval of the project's current blueprint
    snapshot. Advisory audit trail: does not itself gate generation."""
    project = service.get_project(project_id, user["user_id"])
    blueprint_hash = hash_blueprint(project["blueprint_snapshot"])
    record = BlueprintApprovalRepository().record(
        project_id=project_id,
        blueprint_hash=blueprint_hash,
        approved_by_user_id=user["user_id"],
        reason=payload.reason,
    )
    _audit(user["user_id"], "blueprint_approved")
    return BlueprintApprovalRecord.model_validate(record)
