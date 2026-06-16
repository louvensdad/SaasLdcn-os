from __future__ import annotations

import json
import re

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse, StreamingResponse

from app.engines.factory_pipeline import iter_factory_pipeline, run_factory_pipeline
from app.engines.llm.base import LLMError
from app.engines.orchestrator_engine import compile_mega_prompt, run_orchestrator
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
from app.services.generated_project_service import GeneratedProjectService
from app.services.project_writer import DEFAULT_OUTPUT_ROOT, ProjectWriter, ProjectWriteError

router = APIRouter(tags=["meta-factory"])

_generated_project_service = GeneratedProjectService()
_SAFE_PROJECT_ID = re.compile(r"^[A-Za-z0-9_.-]+$")


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
def orchestrate(payload: OrchestrateRequest) -> OrchestrateResponse:
    """Intent -> ProjectSpec (PASSO 2). May return open questions to refine."""
    try:
        result = run_orchestrator(payload.raw_intent, payload.prior_answers)
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
def generate(payload: GenerateRequest) -> GenerateResponse:
    """Compile the Mega-Prompt and run the API-First agent pipeline (PASSO 4),
    then optionally write the result to generated-projects (PASSO 5)."""
    mega = compile_mega_prompt(payload.spec)
    try:
        pipeline = run_factory_pipeline(mega, user_model_choice=payload.user_model_choice)
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
    response = GenerateResponse(ok=pipeline.ok, runs=runs, errors=pipeline.errors, degraded=degraded)

    if payload.persist and pipeline.ok:
        files = [f for run in pipeline.runs for f in run.parsed.files]
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

    return response


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/meta-factory/generate/stream")
def generate_stream(payload: GenerateRequest) -> StreamingResponse:
    """Stream the API-First pipeline as Server-Sent Events so the UI can render a
    real-time progress panel (directory tree, code, security/lint gate checks).

    Uses POST (not EventSource/GET) so the full ProjectSpec travels in the body;
    the frontend consumes the stream via fetch + ReadableStream. Events match
    iter_factory_pipeline, plus a terminal `written` (when persisted) and `done`.
    """
    mega = compile_mega_prompt(payload.spec)

    def event_source():
        result = None
        try:
            for event in iter_factory_pipeline(mega, user_model_choice=payload.user_model_choice):
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
