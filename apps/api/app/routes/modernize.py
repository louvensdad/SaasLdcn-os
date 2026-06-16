from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.engines.codebase_analysis_engine import analyze, build_inventory
from app.engines.modernization_engine import build_migration_plan, modernize_with_factory
from app.schemas.modernize import (
    IngestGitRequest,
    ModernizeGenerateRequest,
    ModernizeGenerateResponse,
    ModernizeResponse,
)
from app.services.codebase_ingest_service import (
    MAX_TOTAL_BYTES,
    CodebaseIngestError,
    IngestResult,
    codebase_ingest_service,
)
from app.services.project_writer import ProjectWriter, ProjectWriteError

router = APIRouter(tags=["modernize"])
service = codebase_ingest_service

# Remembers source/skipped per ingest so /generate can rebuild the inventory
# without re-uploading. Process-local, like the other in-memory job stores.
_INGESTS: dict[str, dict] = {}


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
def modernize_generate(payload: ModernizeGenerateRequest) -> ModernizeGenerateResponse:
    meta = _INGESTS.get(payload.ingest_id)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown ingest id.")

    try:
        inventory = build_inventory(payload.ingest_id, meta["source"], meta["skipped"], service)
    except CodebaseIngestError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    diagnosis = analyze(payload.ingest_id, inventory, service)
    plan = build_migration_plan(inventory, diagnosis)
    pipeline = modernize_with_factory(
        payload.ingest_id, inventory, diagnosis, plan, service, user_model_choice=payload.user_model_choice
    )
    degraded = any(run.response.served_by_fallback for run in pipeline.runs)

    response = ModernizeGenerateResponse(ok=pipeline.ok, errors=pipeline.errors, degraded=degraded)
    if payload.persist and pipeline.ok:
        files = [f for run in pipeline.runs for f in run.parsed.files]
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
    return response
