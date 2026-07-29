from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.authorization import PermissionDeniedError, require_permission
from app.core.deps import CurrentUser
from app.engines.git_export_engine import GitExportEngine
from app.routes.projects import service as project_service
from app.schemas.git_export import GitExportJob, GitExportRequest, GitExportStatusResponse

# Per-user git export: requires authentication, uses the caller's own connection.
router = APIRouter(tags=["git-export"])
engine = GitExportEngine()


def _require_publish_permission(project: dict, user_id: str) -> None:
    """RBAC/ABAC (vault 57 - Especificações/Matriz de permissões por ação.md,
    "Publicar produção"): a project shared via a workspace was previously
    exportable by ANY member with read access (even Viewer) -- get_project()'s
    scope is owner-OR-any-workspace-member, with no role check on the export
    action itself. Real gap, not just a matrix exercise: this closes it. A
    project with no workspace_id (personal, no team) has no one else to
    restrict -- get_project() already scoped it to the owner, so there is
    nothing to gate."""
    workspace_id = project.get("workspace_id")
    if not workspace_id:
        return
    try:
        require_permission("publish_production", workspace_id, user_id, project_id=project.get("project_id"))
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post("/git/export/preview", response_model=GitExportJob)
def preview_git_export(payload: GitExportRequest, user: CurrentUser) -> GitExportJob:
    project = project_service.get_project(payload.project_id, user["user_id"])
    return GitExportJob.model_validate(engine.preview(user["user_id"], project, payload.model_dump()))


@router.post("/git/export/github", response_model=GitExportJob)
def export_to_github(payload: GitExportRequest, user: CurrentUser) -> GitExportJob:
    project = project_service.get_project(payload.project_id, user["user_id"])
    _require_publish_permission(project, user["user_id"])
    return GitExportJob.model_validate(engine.export(user["user_id"], project, payload.model_dump(), "github"))


@router.post("/git/export/gitlab", response_model=GitExportJob)
def export_to_gitlab(payload: GitExportRequest, user: CurrentUser) -> GitExportJob:
    project = project_service.get_project(payload.project_id, user["user_id"])
    _require_publish_permission(project, user["user_id"])
    return GitExportJob.model_validate(engine.export(user["user_id"], project, payload.model_dump(), "gitlab"))


@router.get("/git/export/status/{export_id}", response_model=GitExportStatusResponse)
def get_git_export_status(export_id: str, user: CurrentUser) -> GitExportStatusResponse:
    return GitExportStatusResponse.model_validate(engine.status(export_id, user["user_id"]))
