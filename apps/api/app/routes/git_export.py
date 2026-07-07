from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.engines.git_export_engine import GitExportEngine
from app.routes.projects import service as project_service
from app.schemas.git_export import GitExportJob, GitExportRequest, GitExportStatusResponse

# Per-user git export: requires authentication, uses the caller's own connection.
router = APIRouter(tags=["git-export"])
engine = GitExportEngine()


@router.post("/git/export/preview", response_model=GitExportJob)
def preview_git_export(payload: GitExportRequest, user: CurrentUser) -> GitExportJob:
    project = project_service.get_project(payload.project_id, user["user_id"])
    return GitExportJob.model_validate(engine.preview(user["user_id"], project, payload.model_dump()))


@router.post("/git/export/github", response_model=GitExportJob)
def export_to_github(payload: GitExportRequest, user: CurrentUser) -> GitExportJob:
    project = project_service.get_project(payload.project_id, user["user_id"])
    return GitExportJob.model_validate(engine.export(user["user_id"], project, payload.model_dump(), "github"))


@router.post("/git/export/gitlab", response_model=GitExportJob)
def export_to_gitlab(payload: GitExportRequest, user: CurrentUser) -> GitExportJob:
    project = project_service.get_project(payload.project_id, user["user_id"])
    return GitExportJob.model_validate(engine.export(user["user_id"], project, payload.model_dump(), "gitlab"))


@router.get("/git/export/status/{export_id}", response_model=GitExportStatusResponse)
def get_git_export_status(export_id: str, user: CurrentUser) -> GitExportStatusResponse:
    return GitExportStatusResponse.model_validate(engine.status(export_id, user["user_id"]))
