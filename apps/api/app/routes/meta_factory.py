from __future__ import annotations

import json
import re

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse

from app.core.deps import CurrentUser
from app.engines.factory_pipeline import iter_factory_pipeline, run_factory_pipeline
from app.engines.generation_validation_engine import generation_validation_engine
from app.engines.generated_project_quality_engine import GeneratedProjectQualityEngine
from app.engines.llm.base import LLMError
from app.services.user_key_session_service import user_key_session
from app.engines.orchestrator_engine import compile_mega_prompt, run_orchestrator
from app.schemas.api_collection import ApiCollectionResponse, GeneratedEndpointsResponse
from app.schemas.generated_export import GeneratedProjectExportRequest, GeneratedProjectExportResponse, GitProvider
from app.schemas.local_generation import (
    GeneratedFileContentResponse,
    GeneratedProjectFilesResponse,
    PreparedDownloadResponse,
)
from app.schemas.meta_factory import (
    AgentRunSummary,
    GenerateRequest,
    GenerateResponse,
    OrchestrateRequest,
    OrchestrateResponse,
)
from app.services.api_collection_service import api_collection_service
from app.services.generated_project_service import GeneratedProjectService
from app.services.git_provider_service import git_provider_service
from app.services.project_writer import DEFAULT_OUTPUT_ROOT, ProjectWriter, ProjectWriteError

router = APIRouter(tags=["meta-factory"])

_generated_project_service = GeneratedProjectService()
_quality_engine = GeneratedProjectQualityEngine()
_SAFE_PROJECT_ID = re.compile(r"^[A-Za-z0-9_.-]+$")


def _resolve_api_key(user: dict, *, use_user_key: bool, user_model_choice: str | None) -> str | None:
    """Resolve the caller's own LLM key when they opted in. Errors clearly if they
    asked to use their key but none is in the session (never silently uses the
    server key in that case)."""
    if not use_user_key:
        return None
    key = user_key_session.resolve_for_model_choice(user["user_id"], user_model_choice)
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No user API key in session for the selected provider. Add one in 'Use my own key' first.",
        )
    return key


def _meta_project(project_id: str) -> dict:
    """Resolve a generated meta-factory project to the dict shape that
    GeneratedProjectService expects. Stateless: the directory name IS the
    project_id, so no registry lookup is needed."""
    if not _SAFE_PROJECT_ID.match(project_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project id.")
    return {
        "project_id": project_id,
        "generated_project_path": str(DEFAULT_OUTPUT_ROOT / project_id),
    }


@router.post("/meta-factory/orchestrate", response_model=OrchestrateResponse)
def orchestrate(payload: OrchestrateRequest, user: CurrentUser) -> OrchestrateResponse:
    """Intent -> ProjectSpec (PASSO 2). May return open questions to refine."""
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice)
    try:
        result = run_orchestrator(
            payload.raw_intent,
            payload.prior_answers,
            api_key=api_key,
            user_model_choice=payload.user_model_choice,
        )
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return OrchestrateResponse(
        stage=result.stage,
        spec=result.spec,
        open_questions=result.open_questions,
        degraded=result.degraded,
    )


@router.post("/meta-factory/generate", response_model=GenerateResponse)
def generate(payload: GenerateRequest, user: CurrentUser) -> GenerateResponse:
    """Compile the Mega-Prompt and run the API-First agent pipeline (PASSO 4),
    then optionally write the result to generated-projects (PASSO 5)."""
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice)
    mega = compile_mega_prompt(payload.spec)
    try:
        pipeline = run_factory_pipeline(mega, user_model_choice=payload.user_model_choice, api_key=api_key)
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    runs = [
        AgentRunSummary(
            role=run.role,
            model=run.model,
            file_count=run.parsed.file_count if hasattr(run.parsed, "file_count") else len(run.parsed.files),
            stopped_by=run.response.stopped_by,
            errors=run.parsed.errors,
        )
        for run in pipeline.runs
    ]

    degraded = any(run.response.served_by_fallback for run in pipeline.runs)
    response = GenerateResponse(
        ok=pipeline.ok, runs=runs, errors=pipeline.errors, warnings=pipeline.warnings, degraded=degraded
    )

    # Persist whatever was produced: a single failing agent must not discard the
    # files the others generated correctly. ok still reflects per-agent failures.
    files = [f for run in pipeline.runs for f in run.parsed.files]
    if payload.persist and files:
        try:
            write_result = ProjectWriter().write(
                files,
                project_name=payload.project_name,
                metadata={"models": sorted({run.model for run in pipeline.runs})},
            )
        except ProjectWriteError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        response.project_id = write_result.project_id
        response.root_path = write_result.root_path
        response.file_count = write_result.file_count
        response.written = True
        response.validation_report = generation_validation_engine.validate(_meta_project(write_result.project_id))

    return response


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/meta-factory/generate/stream")
def generate_stream(payload: GenerateRequest, user: CurrentUser) -> StreamingResponse:
    """Stream the API-First pipeline as Server-Sent Events so the UI can render a
    real-time progress panel (directory tree, code, security/lint gate checks).

    Uses POST (not EventSource/GET) so the full ProjectSpec travels in the body;
    the frontend consumes the stream via fetch + ReadableStream. Events match
    iter_factory_pipeline, plus a terminal `written` (when persisted) and `done`.
    """
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice)
    mega = compile_mega_prompt(payload.spec)

    def event_source():
        result = None
        try:
            for event in iter_factory_pipeline(mega, user_model_choice=payload.user_model_choice, api_key=api_key):
                if event.get("type") == "result":
                    result = event["result"]
                    continue
                yield _sse(event)
        except LLMError as exc:
            yield _sse({"type": "error", "detail": str(exc)})
            return

        degraded = bool(result) and any(run.response.served_by_fallback for run in result.runs)
        if payload.persist and result and result.ok:
            files = [f for run in result.runs for f in run.parsed.files]
            try:
                write_result = ProjectWriter().write(
                    files,
                    project_name=payload.project_name,
                    metadata={"models": sorted({run.model for run in result.runs})},
                )
            except ProjectWriteError as exc:
                yield _sse({"type": "error", "detail": str(exc)})
                return
            yield _sse({
                "type": "written",
                "project_id": write_result.project_id,
                "root_path": write_result.root_path,
                "file_count": write_result.file_count,
            })
            validation = generation_validation_engine.validate(_meta_project(write_result.project_id))
            yield _sse({
                "type": "validation_report",
                "report": validation.model_dump(mode="json"),
            })

        yield _sse({
            "type": "done",
            "ok": bool(result and result.ok),
            "degraded": degraded,
            "errors": result.errors if result else ["pipeline produced no result"],
        })

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/meta-factory/{project_id}/files", response_model=GeneratedProjectFilesResponse)
def list_meta_factory_files(project_id: str) -> GeneratedProjectFilesResponse:
    return GeneratedProjectFilesResponse.model_validate(
        _generated_project_service.list_files(_meta_project(project_id))
    )


@router.get("/meta-factory/{project_id}/file-content", response_model=GeneratedFileContentResponse)
def get_meta_factory_file(project_id: str, path: str = Query(..., min_length=1)) -> GeneratedFileContentResponse:
    return GeneratedFileContentResponse.model_validate(
        _generated_project_service.read_file(_meta_project(project_id), path)
    )


@router.post("/meta-factory/{project_id}/prepare-download", response_model=PreparedDownloadResponse)
def prepare_meta_factory_download(project_id: str) -> PreparedDownloadResponse:
    return PreparedDownloadResponse.model_validate(
        _generated_project_service.prepare_download(_meta_project(project_id))
    )


@router.get("/meta-factory/{project_id}/download")
def download_meta_factory_project(project_id: str) -> FileResponse:
    zip_path = _generated_project_service.download_path(_meta_project(project_id))
    return FileResponse(zip_path, media_type="application/zip", filename=f"{project_id}.zip")


@router.post("/meta-factory/{project_id}/export/{provider}", response_model=GeneratedProjectExportResponse)
def export_meta_factory_project(
    project_id: str,
    provider: GitProvider,
    payload: GeneratedProjectExportRequest,
    user: CurrentUser,
) -> GeneratedProjectExportResponse:
    return _export_generated_project(_meta_project(project_id), provider, payload)


@router.get("/meta-factory/{project_id}/endpoints", response_model=GeneratedEndpointsResponse)
def list_meta_factory_endpoints(project_id: str) -> GeneratedEndpointsResponse:
    return api_collection_service.list_endpoints(_meta_project(project_id))


@router.get("/meta-factory/{project_id}/api-collection", response_model=ApiCollectionResponse)
def get_meta_factory_api_collection(
    project_id: str,
    format: str = Query("postman", pattern="^(postman|insomnia)$"),
) -> ApiCollectionResponse:
    return api_collection_service.collection(_meta_project(project_id), format)  # type: ignore[arg-type]


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
