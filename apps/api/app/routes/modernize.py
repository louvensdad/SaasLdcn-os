from __future__ import annotations

import re

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

from app.core.deps import CurrentUser
from app.engines.codebase_analysis_engine import analyze, build_inventory
from app.engines.generation_validation_engine import generation_validation_engine
from app.engines.generated_project_quality_engine import GeneratedProjectQualityEngine
from app.engines.modernization_engine import build_migration_plan, modernize_with_factory
from app.schemas.api_collection import ApiCollectionResponse, GeneratedEndpointsResponse
from app.schemas.generated_export import GeneratedProjectExportRequest, GeneratedProjectExportResponse, GitProvider
from app.schemas.modernize import (
    IngestGitRequest,
    ModernizeGenerateRequest,
    ModernizeGenerateResponse,
    ModernizeResponse,
)
from app.services.api_collection_service import api_collection_service
from app.services.codebase_ingest_service import (
    MAX_TOTAL_BYTES,
    CodebaseIngestError,
    IngestResult,
    codebase_ingest_service,
)
from app.services.generated_project_service import GeneratedProjectService
from app.services.git_provider_service import git_provider_service
from app.services.project_writer import DEFAULT_OUTPUT_ROOT
from app.services.project_writer import ProjectWriter, ProjectWriteError
from app.services.user_key_session_service import user_key_session

router = APIRouter(tags=["modernize"])
service = codebase_ingest_service
_generated_project_service = GeneratedProjectService()
_quality_engine = GeneratedProjectQualityEngine()
_SAFE_PROJECT_ID = re.compile(r"^[A-Za-z0-9_.-]+$")

# Remembers source/skipped per ingest so /generate can rebuild the inventory
# without re-uploading. Process-local, like the other in-memory job stores.
_INGESTS: dict[str, dict] = {}


def _modernize_project(project_id: str) -> dict:
    if not _SAFE_PROJECT_ID.match(project_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project id.")
    return {
        "project_id": project_id,
        "generated_project_path": str(DEFAULT_OUTPUT_ROOT / project_id),
    }


def _diagnose(result: IngestResult) -> ModernizeResponse:
    _INGESTS[result.ingest_id] = {"source": result.source, "skipped": result.skipped}
    inventory = build_inventory(result.ingest_id, result.source, result.skipped, service)
    diagnosis = analyze(result.ingest_id, inventory, service)
    plan = build_migration_plan(inventory, diagnosis)
    return ModernizeResponse(inventory=inventory, diagnosis=diagnosis, plan=plan)


@router.post("/modernize/ingest/zip", response_model=ModernizeResponse)
async def ingest_zip(file: UploadFile = File(...)) -> ModernizeResponse:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty upload.")
    if len(data) > MAX_TOTAL_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Upload too large.")
    try:
        result = service.ingest_zip(data)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _diagnose(result)


@router.post("/modernize/ingest/git", response_model=ModernizeResponse)
def ingest_git(payload: IngestGitRequest) -> ModernizeResponse:
    try:
        result = service.ingest_git(payload.git_url)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _diagnose(result)


@router.post("/modernize/generate", response_model=ModernizeGenerateResponse)
def modernize_generate(payload: ModernizeGenerateRequest, user: CurrentUser) -> ModernizeGenerateResponse:
    meta = _INGESTS.get(payload.ingest_id)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown ingest id.")

    api_key = None
    if payload.use_user_key:
        api_key = user_key_session.resolve_for_model_choice(user["user_id"], payload.user_model_choice)
        if api_key is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No user API key in session for the selected provider. Add one in 'Use my own key' first.",
            )

    try:
        inventory = build_inventory(payload.ingest_id, meta["source"], meta["skipped"], service)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    diagnosis = analyze(payload.ingest_id, inventory, service)
    plan = build_migration_plan(inventory, diagnosis)
    pipeline = modernize_with_factory(
        payload.ingest_id, inventory, diagnosis, plan, service,
        user_model_choice=payload.user_model_choice, api_key=api_key,
    )
    degraded = any(run.response.served_by_fallback for run in pipeline.runs)

    response = ModernizeGenerateResponse(
        ok=pipeline.ok, errors=pipeline.errors, warnings=pipeline.warnings, degraded=degraded
    )
    # Persist whatever was produced even if an agent failed (don't discard work).
    files = [f for run in pipeline.runs for f in run.parsed.files]
    if payload.persist and files:
        try:
            write_result = ProjectWriter().write(
                files,
                project_name=payload.project_name,
                metadata={"source": "modernization", "ingest_id": payload.ingest_id},
            )
        except ProjectWriteError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        response.project_id = write_result.project_id
        response.file_count = write_result.file_count
        response.written = True
        response.validation_report = generation_validation_engine.validate(_modernize_project(write_result.project_id))
    return response


@router.post("/modernize/{project_id}/export/{provider}", response_model=GeneratedProjectExportResponse)
def export_modernized_project(
    project_id: str,
    provider: GitProvider,
    payload: GeneratedProjectExportRequest,
    user: CurrentUser,
) -> GeneratedProjectExportResponse:
    return _export_generated_project(_modernize_project(project_id), provider, payload)


@router.get("/modernize/{project_id}/endpoints", response_model=GeneratedEndpointsResponse)
def list_modernized_endpoints(project_id: str) -> GeneratedEndpointsResponse:
    return api_collection_service.list_endpoints(_modernize_project(project_id))


@router.get("/modernize/{project_id}/api-collection", response_model=ApiCollectionResponse)
def get_modernized_api_collection(
    project_id: str,
    format: str = Query("postman", pattern="^(postman|insomnia)$"),
) -> ApiCollectionResponse:
    return api_collection_service.collection(_modernize_project(project_id), format)  # type: ignore[arg-type]


def _export_generated_project(
    project: dict,
    provider: GitProvider,
    payload: GeneratedProjectExportRequest,
) -> GeneratedProjectExportResponse:
    status_info = git_provider_service.status(provider)
    if status_info.get("status") != "connected":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{provider} is not connected. Connect the provider in /settings#integrations before exporting.",
        )

    quality = _quality_engine.quality_check(project)
    blockers = [
        finding for finding in quality.get("security_findings", [])
        if finding.get("severity") in {"high", "critical"}
    ]
    if blockers:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Export blocked by high or critical generated-project security findings.",
        )

    files = _generated_project_service.export_files(project)
    repository = git_provider_service.create_repository(
        provider,
        namespace=payload.namespace,
        repo_name=payload.repo_name,
        visibility=payload.visibility,
        branch=payload.branch,
    )
    repository = git_provider_service.push_initial_commit(
        provider,
        namespace=payload.namespace,
        repo_name=payload.repo_name,
        branch=payload.branch,
        commit_message=payload.commit_message,
        files=files,
    )
    return GeneratedProjectExportResponse(
        provider=provider,
        namespace=payload.namespace,
        repo_name=payload.repo_name,
        branch=payload.branch,
        visibility=payload.visibility,
        status=repository.get("status", "ready"),
        repo_url=repository.get("repo_url"),
        file_count=len(files),
        message="Generated project exported successfully.",
    )
