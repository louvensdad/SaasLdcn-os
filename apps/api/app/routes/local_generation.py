from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse

from app.core.deps import CurrentUser
from app.engines.local_generation_engine import LocalGenerationEngine
from app.routes.projects import service as project_service
from app.schemas.local_generation import (
    GeneratedFileContentResponse,
    GeneratedProjectFilesResponse,
    LocalGenerationRequest,
    LocalGenerationResult,
    PreparedDownloadResponse,
)
from app.services.generated_project_service import GeneratedProjectService

router = APIRouter(tags=["local-generation"])
engine = LocalGenerationEngine()
generated_project_service = GeneratedProjectService()


@router.post("/generation/local-run", response_model=LocalGenerationResult)
def run_local_generation(payload: LocalGenerationRequest, user: CurrentUser) -> LocalGenerationResult:
    project = project_service.get_project(payload.project_id, user["user_id"])
    if payload.locale_profile is not None:
        project = {**project, "locale_profile": payload.locale_profile.model_dump()}
    result = engine.run(project, payload.output_path)
    if result["status"] == "generated":
        project_service.update_project(
            payload.project_id,
            {
                "status": "generated",
                "readiness_status": "generated",
                "generated_project_path": result["output_path"],
            },
            user["user_id"],
        )
    return LocalGenerationResult.model_validate(result)


@router.get("/generation/{project_id}/files", response_model=GeneratedProjectFilesResponse)
def list_generated_files(project_id: str, user: CurrentUser) -> GeneratedProjectFilesResponse:
    project = project_service.get_project(project_id, user["user_id"])
    return GeneratedProjectFilesResponse.model_validate(generated_project_service.list_files(project))


@router.get("/generation/{project_id}/file-content", response_model=GeneratedFileContentResponse)
def get_generated_file_content(project_id: str, user: CurrentUser, path: str = Query(..., min_length=1)) -> GeneratedFileContentResponse:
    project = project_service.get_project(project_id, user["user_id"])
    return GeneratedFileContentResponse.model_validate(generated_project_service.read_file(project, path))


@router.post("/generation/{project_id}/prepare-download", response_model=PreparedDownloadResponse)
def prepare_generated_download(project_id: str, user: CurrentUser) -> PreparedDownloadResponse:
    project = project_service.get_project(project_id, user["user_id"])
    return PreparedDownloadResponse.model_validate(generated_project_service.prepare_download(project))


@router.get("/generation/{project_id}/download")
def download_generated_project(project_id: str, user: CurrentUser) -> FileResponse:
    project = project_service.get_project(project_id, user["user_id"])
    zip_path = generated_project_service.download_path(project)
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"{project_id}.zip",
    )
