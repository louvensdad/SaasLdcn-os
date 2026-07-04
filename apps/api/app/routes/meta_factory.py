from __future__ import annotations

import asyncio
import json
import logging
import queue
import re
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.engines.auto_repair_engine import auto_repair_engine
from app.engines.quality_gate_engine import quality_gate_engine
from app.repositories.user_repository import AuditLogRepository
from app.repositories.tenant_repository import TenantAccessError, TenantRepository, WORKSPACE_WRITE_ROLES
from app.repositories.blueprint_approval_repository import BlueprintApprovalRepository, hash_blueprint
from app.routes.project_rooms import service as project_room_service
from app.services.project_room_service import ENGINEERING_APPROVED_STATUSES
from app.schemas.auto_repair import ForceReleaseRequest, RepairResult, RevalidationResult
from app.schemas.quality_gate import QualityGateReport
from app.engines.completeness_review_engine import CompletenessReviewEngine
from app.engines.context_pack_builder import build_agent_context, summarize_contract
from app.engines.factory_pipeline import PIPELINE_ORDER, iter_factory_pipeline, iter_single_agent, run_factory_pipeline
from app.engines.generation_validation_engine import generation_validation_engine
from app.engines.generation_job_engine import generation_job_engine
from app.engines.ground_truth_engine import ground_truth_engine
from app.engines.generated_project_quality_engine import GeneratedProjectQualityEngine
from app.engines.verification_engine import iter_verification
from app.engines.llm.base import LLMError
from app.services.llm_settings_service import llm_provider_resolver
from app.engines.orchestrator_engine import compile_mega_prompt, run_orchestrator
from app.repositories.redaction import redact_value
from app.schemas.orchestrator import ProjectSpec
from app.schemas.api_collection import ApiCollectionResponse, GeneratedEndpointsResponse
from app.schemas.generated_export import GeneratedProjectExportRequest, GeneratedProjectExportResponse, GitProvider
from app.schemas.local_generation import (
    GeneratedFileContentResponse,
    GeneratedProjectFilesResponse,
    PreparedDownloadResponse,
)
from app.schemas.meta_factory import (
    AgentRunSummary,
    CompletenessReviewRequest,
    CompletenessReviewResponse,
    GenerateRequest,
    GenerateResponse,
    OrchestrateRequest,
    OrchestrateResponse,
    StageGenerateRequest,
    VerifyRequest,
)
from app.schemas.generation_job import (
    CreateGenerationJobRequest,
    GenerationJob,
    GenerationUsageSummary,
    RetryGenerationStageRequest,
)
from app.schemas.execution_terminal import TerminalExecuteRequest, TerminalHistoryResponse
from app.services.api_collection_service import api_collection_service
from app.services.execution_terminal_service import ALLOWED_COMMANDS_DISPLAY, execution_terminal_service
from app.services.generated_project_service import GeneratedProjectService
from app.services.git_provider_service import git_provider_service
from app.services.project_writer import DEFAULT_OUTPUT_ROOT, ProjectWriter, ProjectWriteError

router = APIRouter(tags=["meta-factory"])

logger = logging.getLogger("ldcn.api.meta_factory")

_generated_project_service = GeneratedProjectService()
_quality_engine = GeneratedProjectQualityEngine()
_SAFE_PROJECT_ID = re.compile(r"^[A-Za-z0-9_.-]+$")

# Client-facing message for any upstream LLM failure. The raw provider error
# (which can carry internal request context) is logged with a correlation id but
# never returned to the client (diagnosis M6).
_GENERIC_LLM_MESSAGE = "O provedor de IA estÃƒÂ¡ temporariamente indisponÃƒÂ­vel. Tente novamente em instantes."


def _llm_failure(exc: Exception) -> str:
    """Log the raw LLM error under a correlation id and return a safe, generic
    client message that references the id (for support correlation only)."""
    correlation_id = uuid4().hex
    logger.warning("LLM failure [%s]: %s", correlation_id, exc)
    return f"{_GENERIC_LLM_MESSAGE} (ref: {correlation_id})"


def _llm_http_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=_llm_failure(exc))

# The exact phrase a user must type to consciously release a project with unresolved
# problems. Locale-independent on purpose: it is an explicit, auditable acknowledgement.
CONSCIOUS_RELEASE_PHRASE = "LIBERAR COM RISCO"


def _audit(user_id: str, event_code: str) -> None:
    """Best-effort audit trail (never breaks the request if the log is unavailable)."""
    try:
        AuditLogRepository(get_settings().sqlite_path).record(user_id=user_id, event_code=event_code)
    except Exception:  # noqa: BLE001 Ã¢â‚¬â€ audit must never block the user action
        pass


def _resolve_api_key(user: dict, *, use_user_key: bool, user_model_choice: str | None) -> str | None:
    context = llm_provider_resolver.resolve(
        workspace_id=None,
        user_id=user["user_id"],
        requested_capability="meta_factory_agents",
        requested_model=user_model_choice,
    )
    if context.resolution.mode == "llm":
        return context.api_key
    if use_user_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{context.resolution.reason} API key não disponível.",
        )
    return None


def _generation_llm_context(
    user: dict,
    *,
    workspace_id: str | None,
    user_model_choice: str | None,
    deterministic: bool = False,
):
    context = llm_provider_resolver.resolve(
        workspace_id=workspace_id,
        user_id=user["user_id"],
        requested_capability="meta_factory_pipeline",
        requested_model=user_model_choice,
        deterministic=deterministic,
    )
    if not deterministic and context.resolution.mode != "llm":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "LLM_PROVIDER_REQUIRED",
                "message": context.resolution.reason,
                "recommendedAction": "Configure um provider global ou inicie explicitamente em modo deterministico.",
            },
        )
    return context


def _writable_workspace(user: dict, requested_workspace_id: str | None) -> dict:
    repository = TenantRepository()
    if requested_workspace_id:
        try:
            return repository.require_workspace(
                requested_workspace_id,
                user["user_id"],
                WORKSPACE_WRITE_ROLES,
            )
        except TenantAccessError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found or insufficient permission.",
            ) from exc
    workspace = repository.personal_workspace(user["user_id"])
    return workspace or repository.ensure_personal_workspace(user["user_id"], user["full_name"])


@router.post("/meta-factory/jobs", response_model=GenerationJob, status_code=status.HTTP_202_ACCEPTED)
def create_generation_job(payload: CreateGenerationJobRequest, user: CurrentUser) -> GenerationJob:
    """Create the durable pipeline record before any provider request is made."""
    # Cap concurrent in-flight generations per user (audit MF3): each one holds
    # agent-pool workers for multi-minute LLM calls, so an unbounded user could
    # starve the shared pool for everyone. Recovery actions (retry/resume/continue)
    # re-run existing jobs and are intentionally not counted here.
    max_concurrent = get_settings().max_concurrent_generations_per_user
    active = generation_job_engine.count_active_for_user(user["user_id"])
    if active >= max_concurrent:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "TOO_MANY_CONCURRENT_GENERATIONS",
                "message": (
                    f"Você já tem {active} geração(ões) em andamento (limite: {max_concurrent}). "
                    "Aguarde uma concluir ou pause/cancele antes de iniciar outra."
                ),
                "activeCount": active,
                "limit": max_concurrent,
            },
        )
    workspace = _writable_workspace(user, payload.workspaceId)
    # projectId is the Project Room id for the primary chat -> Meta Factory journey
    # (the frontend enforces this gate client-side; this is the server-side backstop
    # for any caller that skips straight to job creation). Callers whose projectId
    # does not resolve to a room of theirs (ad-hoc/API usage) are not gated here.
    room = project_room_service.get_room(payload.projectId, user["user_id"])
    if room is not None and room["status"] not in ENGINEERING_APPROVED_STATUSES:
        _audit(user["user_id"], "generation_job_blocked_by_gate")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "BLUEPRINT_GATE_BLOCKED",
                "message": "Este projeto ainda nao teve o Engineering Review aprovado e nao pode iniciar a geracao.",
            },
        )
    if room is not None:
        # Stack Approval Gate (server-side backstop): generation can never start on
        # a stack the user did not explicitly approve. The approved selections —
        # not the model's internal choice — are enforced into the spec below.
        stack_approval = ((room.get("architecture_blueprint") or {}).get("stack_approval") or {})
        if stack_approval.get("status") != "APPROVED":
            _audit(user["user_id"], "generation_job_blocked_by_stack_gate")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "STACK_APPROVAL_REQUIRED",
                    "message": (
                        "A stack de desenvolvimento ainda nao foi aprovada pelo usuario. "
                        "Aprove (ou altere) a stack no Stack Approval Gate antes de gerar."
                    ),
                },
            )
        if stack_approval.get("selected_language"):
            payload.spec.suggested_stack.language = str(stack_approval["selected_language"])
        if stack_approval.get("selected_backend"):
            payload.spec.suggested_stack.framework = str(stack_approval["selected_backend"])
        payload.blueprint.setdefault("stack_approval", stack_approval)
    if room is not None:
        # The room's own approve()/acknowledge_preview() flow already requires and
        # records explicit human sign-off for a degraded (deterministic-preview)
        # blueprint before it can reach ENGINEERING_APPROVED (see
        # project_room_service.py). Mirror that into the structured, queryable
        # blueprint_approvals trail so it isn't only recoverable from history_json.
        blueprint = room.get("architecture_blueprint") or {}
        if blueprint.get("degraded") and blueprint.get("preview_acknowledged"):
            approvals = BlueprintApprovalRepository()
            blueprint_hash = hash_blueprint(blueprint)
            if not approvals.is_approved(payload.projectId, blueprint_hash):
                approvals.record(
                    project_id=payload.projectId,
                    blueprint_hash=blueprint_hash,
                    approved_by_user_id=user["user_id"],
                    reason="deterministic-preview blueprint consciously acknowledged before engineering approval",
                )
    context = _generation_llm_context(
        user,
        workspace_id=workspace["workspace_id"],
        user_model_choice=payload.user_model_choice,
        deterministic=payload.mode == "deterministic",
    )
    resolution = context.resolution
    try:
        job = generation_job_engine.create_job(
            owner_user_id=user["user_id"],
            project_id=payload.projectId,
            workspace_id=workspace["workspace_id"],
            project_name=payload.projectName,
            spec=payload.spec,
            blueprint=payload.blueprint,
            blueprint_version=payload.blueprintVersion,
            provider=resolution.provider,
            provider_label=resolution.providerLabel or "Nenhum",
            model=resolution.model or ("Motor deterministico" if payload.mode == "deterministic" else None),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    generation_job_engine.start(
        job["id"],
        user["user_id"],
        api_key=context.api_key,
        user_model_choice=resolution.model,
        mode="deterministic" if payload.mode == "deterministic" else "normal",
    )
    return GenerationJob.model_validate(job)


@router.get("/meta-factory/jobs/latest", response_model=GenerationJob | None)
def latest_generation_job(user: CurrentUser, projectId: str = Query(min_length=1)) -> GenerationJob | None:
    job = generation_job_engine.latest(projectId, user["user_id"])
    return GenerationJob.model_validate(job) if job else None


@router.get("/meta-factory/jobs/usage", response_model=GenerationUsageSummary)
def generation_usage(user: CurrentUser, period_days: int = Query(30, ge=1, le=365)) -> GenerationUsageSummary:
    """Measured token usage for the current user over the last `period_days` — real
    per-job totals aggregated by owner and model, for cost attribution / billing
    (audit B4/AI2). Declared before /jobs/{job_id} so 'usage' is not read as an id."""
    since = (datetime.now(UTC) - timedelta(days=period_days)).replace(microsecond=0).isoformat()
    summary = generation_job_engine.usage_summary(user["user_id"], since)
    return GenerationUsageSummary(period_days=period_days, since=since, **summary)


@router.get("/meta-factory/jobs/{job_id}", response_model=GenerationJob)
def get_generation_job(job_id: str, user: CurrentUser) -> GenerationJob:
    job = generation_job_engine.get(job_id, user["user_id"])
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GenerationJob nao encontrado.")
    return GenerationJob.model_validate(job)


@router.delete("/meta-factory/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_generation_job(job_id: str, user: CurrentUser) -> Response:
    result = generation_job_engine.delete(job_id, user["user_id"])
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GenerationJob nao encontrado.")
    if result is False:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O job ainda esta em execucao. Pause ou aguarde a conclusao antes de excluir.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/meta-factory/jobs/{job_id}/events")
def stream_generation_job(
    job_id: str,
    request: Request,
    user: CurrentUser,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
) -> StreamingResponse:
    if generation_job_engine.get(job_id, user["user_id"]) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GenerationJob nao encontrado.")

    async def events():
        last_revision = ""
        initial = generation_job_engine.get(job_id, user["user_id"])
        last_event_index = _event_start_index(
            (initial or {}).get("events", []),
            last_event_id,
        )
        terminal = {"READY", "FAILED", "PAUSED", "NEEDS_USER_ACTION", "STALLED"}
        for tick in range(2400):
            if await request.is_disconnected():
                return
            job = generation_job_engine.get(job_id, user["user_id"])
            if job is None:
                yield _sse({"type": "error", "detail": "GenerationJob nao encontrado."})
                return
            # Stream new fine-grained execution events for the live console first
            # (smooth append). On first tick this replays the persisted history.
            job_events = job.get("events", [])
            start = min(last_event_index, len(job_events))
            for event in job_events[start:]:
                yield _sse(
                    {"type": "execution_event", "event": _slim_event(event)},
                    event_id=str(event["id"]),
                )
            last_event_index = len(job_events)
            # The whole-job snapshot drives status/stage/progress/logs/artifacts only —
            # keyed on those fields (NOT updatedAt) so a streaming build doesn't refire
            # it on every stdout line. events are carried via the frames above.
            revision = (
                f'{job["status"]}:{job["currentStage"]}:{job["progress"]}:'
                f'{len(job["logs"])}:{len(job["artifacts"])}:{len(job["checkpoints"])}:'
                f'{1 if job.get("error") else 0}'
            )
            if revision != last_revision:
                yield _sse({"type": "generation_job", "job": {**job, "events": []}})
                last_revision = revision
            elif tick % 10 == 0:
                yield _sse({"type": "heartbeat", "jobId": job_id, "stage": job["currentStage"]})
            if job["status"] in terminal:
                return
            await asyncio.sleep(0.75)
        # Tick budget exhausted without a terminal status: NEVER end the stream
        # silently — tell the client explicitly so the UI can offer "Continuar
        # manualmente" instead of freezing on an implicit disconnect.
        yield _sse({
            "type": "stream_timeout",
            "jobId": job_id,
            "message": "Stream expirou sem estado terminal; atualize manualmente ou reconecte.",
        })

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/meta-factory/jobs/{job_id}/stages/{stage_name}/retry", response_model=GenerationJob, status_code=status.HTTP_202_ACCEPTED)
def retry_generation_stage(job_id: str, stage_name: str, payload: RetryGenerationStageRequest, user: CurrentUser) -> GenerationJob:
    job = generation_job_engine.get(job_id, user["user_id"])
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GenerationJob nao encontrado.")
    context = _generation_llm_context(
        user,
        workspace_id=job.get("workspaceId"),
        user_model_choice=payload.user_model_choice,
        deterministic=payload.mode == "deterministic",
    )
    try:
        updated = generation_job_engine.retry_stage(
            job_id,
            user["user_id"],
            stage_name,
            api_key=context.api_key,
            user_model_choice=context.resolution.model,
            mode=payload.mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return GenerationJob.model_validate(updated)


@router.post("/meta-factory/jobs/{job_id}/resume", response_model=GenerationJob, status_code=status.HTTP_202_ACCEPTED)
def resume_generation_job(job_id: str, user: CurrentUser) -> GenerationJob:
    job = generation_job_engine.get(job_id, user["user_id"])
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GenerationJob nao encontrado.")
    if job["status"] == "READY":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="O job ja esta concluido.")
    context = _generation_llm_context(
        user,
        workspace_id=job.get("workspaceId"),
        user_model_choice=job.get("model"),
    )
    updated = generation_job_engine.resume(
        job_id,
        user["user_id"],
        api_key=context.api_key,
        user_model_choice=context.resolution.model,
    )
    return GenerationJob.model_validate(updated)


@router.post("/meta-factory/jobs/{job_id}/continue", response_model=GenerationJob, status_code=status.HTTP_202_ACCEPTED)
def continue_with_warnings(job_id: str, user: CurrentUser) -> GenerationJob:
    """Accept the current stage's (non-fatal) warnings and advance to the next
    stage. Recovers a STALLED job or one held at NEEDS_USER_ACTION by classified
    warnings without discarding any artifact."""
    job = generation_job_engine.get(job_id, user["user_id"])
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GenerationJob nao encontrado.")
    if job["status"] == "READY":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="O job ja esta concluido.")
    context = _generation_llm_context(
        user,
        workspace_id=job.get("workspaceId"),
        user_model_choice=job.get("model"),
    )
    try:
        updated = generation_job_engine.continue_with_warnings(
            job_id,
            user["user_id"],
            api_key=context.api_key,
            user_model_choice=context.resolution.model,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return GenerationJob.model_validate(updated)


@router.post("/meta-factory/jobs/{job_id}/continue-after-build-skip", response_model=GenerationJob)
def continue_after_build_skip(job_id: str, user: CurrentUser) -> GenerationJob:
    try:
        job = generation_job_engine.acknowledge_build_skip(job_id, user["user_id"])
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GenerationJob nao encontrado.")
    return GenerationJob.model_validate(job)


@router.post("/meta-factory/jobs/{job_id}/pause", response_model=GenerationJob)
def pause_generation_job(job_id: str, user: CurrentUser) -> GenerationJob:
    job = generation_job_engine.pause(job_id, user["user_id"])
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GenerationJob nao encontrado.")
    return GenerationJob.model_validate(job)


@router.get("/meta-factory/jobs/{job_id}/artifacts/{artifact_id}/raw")
def read_generation_artifact(job_id: str, artifact_id: str, user: CurrentUser) -> FileResponse:
    job = generation_job_engine.get(job_id, user["user_id"])
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GenerationJob nao encontrado.")
    artifact = next((item for item in job["artifacts"] if item["id"] == artifact_id), None)
    if artifact is None or artifact["kind"] != "raw_response":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resposta bruta nao encontrada.")
    path = Path(artifact["path"]).resolve()
    job_root = (generation_job_engine.checkpoint_root / job_id).resolve()
    if job_root not in path.parents or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resposta bruta nao encontrada.")
    return FileResponse(path, media_type="text/plain", filename=Path(artifact["name"]).name)


@router.get("/meta-factory/jobs/{job_id}/diagnostic")
def download_generation_diagnostic(job_id: str, user: CurrentUser) -> JSONResponse:
    job = generation_job_engine.get(job_id, user["user_id"])
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GenerationJob nao encontrado.")
    return JSONResponse(
        content={
            "jobId": job["id"],
            "status": job["status"],
            "currentStage": job["currentStage"],
            "provider": job["provider"],
            "model": job["model"],
            "error": job["error"],
            "buildStatus": job.get("buildStatus"),
            "buildAttempts": job.get("buildAttempts", 0),
            "manualBuildRetryCount": job.get("manualBuildRetryCount", 0),
            "buildSkipAcknowledged": job.get("buildSkipAcknowledged", False),
            "manualBuildFixGuide": job.get("manualBuildFixGuide"),
            "checkpoints": job["checkpoints"],
            "logs": job["logs"],
            "buildArtifacts": [
                item for item in job["artifacts"]
                if item.get("stage", "").split(".")[0] == "build"
            ],
        },
        headers={"Content-Disposition": f'attachment; filename="{job_id}-diagnostic.json"'},
    )

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


def _owned_meta_project(project_id: str, user: dict) -> dict:
    """Resolve a generated project AND enforce ownership (diagnosis H3).

    A project records its owner when it is created through the API. If a different
    user requests it, we respond 404 (not 403) so we never confirm the existence of
    another user's project. Projects with no recorded owner (legacy / direct writes)
    are not id-restricted."""
    project = _meta_project(project_id)
    owner = ProjectWriter().read_owner(project_id)
    if owner is not None and owner != user["user_id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated project was not found.")
    return project


def _force_release_authorized_project(project_id: str, user: dict) -> dict:
    """Like _owned_meta_project, but also allows a workspace teammate with a
    write role (owner/admin/member, not viewer) to force-release a project they
    don't personally own, when the project has a recorded workspace_id (only
    the job-based generation pipeline records one today; projects with none
    fall back to owner-only, same as _owned_meta_project)."""
    project = _meta_project(project_id)
    writer = ProjectWriter()
    owner = writer.read_owner(project_id)
    if owner is None or owner == user["user_id"]:
        return project
    workspace_id = writer.read_workspace(project_id)
    if workspace_id:
        try:
            TenantRepository().require_workspace(workspace_id, user["user_id"], WORKSPACE_WRITE_ROLES)
            return project
        except TenantAccessError:
            pass
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated project was not found.")


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
            preferred_language=payload.preferred_language,
        )
    except LLMError as exc:
        raise _llm_http_error(exc) from exc
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
    mega = compile_mega_prompt(payload.spec, payload.blueprint)
    try:
        pipeline = run_factory_pipeline(
            mega,
            user_model_choice=payload.user_model_choice,
            api_key=api_key,
            delivery_type=payload.spec.delivery_type,
            language=payload.spec.suggested_stack.language,
            framework=payload.spec.suggested_stack.framework,
        )
    except LLMError as exc:
        raise _llm_http_error(exc) from exc

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
                owner=user["user_id"],
            )
        except ProjectWriteError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        response.project_id = write_result.project_id
        response.root_path = write_result.root_path
        response.file_count = write_result.file_count
        response.written = True
        response.validation_report = generation_validation_engine.validate(_meta_project(write_result.project_id))

    return response


def _sse(event: dict, *, event_id: str | None = None) -> str:
    prefix = f"id: {event_id}\n" if event_id else ""
    return f"{prefix}data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _event_start_index(events: list[dict], last_event_id: str | None) -> int:
    """Resume after the last acknowledged persisted execution event.

    If the cursor has fallen outside the retained 2,000-event window, replay the
    retained window from its beginning; the frontend deduplicates by event id.
    """
    if not last_event_id:
        return 0
    return next(
        (index + 1 for index, event in enumerate(events) if event.get("id") == last_event_id),
        0,
    )


def _slim_event(event: dict) -> dict:
    """Cap the streamed stdout/stderr tails on an execution event so a single SSE
    frame never carries a huge payload (the per-command full tails stay bounded)."""
    cap = 4000
    slim = dict(event)
    for field in ("stdout", "stderr", "message"):
        value = slim.get(field)
        if isinstance(value, str) and len(value) > cap:
            slim[field] = value[-cap:]
    return slim


def _generated_file_paths(project_id: str) -> list[str]:
    listing = _generated_project_service.list_files(_meta_project(project_id))
    return [
        str(item["relative_path"])
        for item in listing.get("files", [])
        if item.get("relative_path") not in {".ldcn-generation.json", _STAGE_INPUTS_FILE}
    ]


def _read_contract_text(project_id: str) -> str:
    candidates = [
        path
        for path in _generated_file_paths(project_id)
        if path.lower() in {"openapi.yaml", "openapi.yml", "openapi.json"}
        or path.lower().endswith("/openapi.yaml")
        or path.lower().endswith("/openapi.yml")
        or path.lower().endswith("/openapi.json")
    ]
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Persisted contract openapi.* was not found for this project.",
        )
    data = _generated_project_service.read_file(_meta_project(project_id), candidates[0])
    content = data.get("content")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Persisted contract openapi.* is empty or cannot be previewed.",
        )
    return content


# The spec + blueprint are large for Enterprise projects. Re-sending them in the
# body of EVERY stage request is what pushes the request past a proxy's body limit
# (e.g. nginx `client_max_body_size`, the default 1 MB) → HTTP 413. So they are
# persisted ONCE with the generated project on the first stage and referenced by
# project_id afterwards; later stages send only a slim body.
_STAGE_INPUTS_FILE = ".ldcn-inputs.json"


def _persist_stage_inputs(root_path: str, spec: ProjectSpec, blueprint: object | None) -> None:
    """Best-effort: store the (redacted) spec + blueprint beside the project so
    subsequent stages don't need them re-sent in the request body."""
    try:
        payload = {
            "spec": redact_value(spec.model_dump(mode="json")),
            "blueprint": redact_value(blueprint) if blueprint else None,
        }
        Path(root_path, _STAGE_INPUTS_FILE).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:  # noqa: BLE001 — persistence is an optimization, never fatal
        pass


def _load_stage_inputs(project_id: str) -> tuple[ProjectSpec | None, object | None]:
    try:
        root = ProjectWriter()._project_root(project_id)  # noqa: SLF001
        data = json.loads(Path(root, _STAGE_INPUTS_FILE).read_text(encoding="utf-8"))
        spec_data = data.get("spec")
        spec = ProjectSpec.model_validate(spec_data) if spec_data else None
        return spec, data.get("blueprint")
    except Exception:  # noqa: BLE001
        return None, None


def _stage_context(payload: StageGenerateRequest) -> str:
    if payload.role != "contracts" and not payload.project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id is required after the contracts stage.",
        )

    # Prefer the persisted spec/blueprint (reference-by-project_id) so the client
    # can send a slim body on stages 2..N. Fall back to whatever the body carries.
    spec = payload.spec
    blueprint = payload.blueprint
    if payload.project_id:
        persisted_spec, persisted_blueprint = _load_stage_inputs(payload.project_id)
        if persisted_spec is not None:
            spec = persisted_spec
            blueprint = persisted_blueprint

    mega = compile_mega_prompt(spec, blueprint)
    contract_summary = ""
    if payload.role != "contracts" and payload.project_id:
        raw = _read_contract_text(payload.project_id)
        # Wrap so the summarizer extracts endpoints + schema names instead of
        # shipping the full OpenAPI body (the Backend-stage 413 root cause).
        contract_summary = summarize_contract(f'<<<FILE path="openapi.yaml">>>\n{raw}\n<<<END>>>')
    emitted: tuple[str, ...] = ()
    if payload.role in {"qa", "devops", "docs"} and payload.project_id:
        emitted = tuple(_generated_file_paths(payload.project_id))

    # Per-agent Context Pack within the role budget — never a giant single request.
    context, _diag = build_agent_context(
        payload.role, mega, contract_summary=contract_summary, emitted_files=emitted
    )
    # Ground Truth: the stage-stream path runs BEFORE any pipeline exists, so the
    # real state is "nothing built, no repo, no docker" — mandatory in the LLM
    # context so no agent invents git clone URLs or deploy claims.
    return context + "\n\n" + ground_truth_engine.prompt_block(ground_truth_engine.default_state())


@router.post("/meta-factory/generate/stream")
def generate_stream(payload: GenerateRequest, user: CurrentUser) -> StreamingResponse:
    """Stream the API-First pipeline as Server-Sent Events so the UI can render a
    real-time progress panel (directory tree, code, security/lint gate checks).

    Uses POST (not EventSource/GET) so the full ProjectSpec travels in the body;
    the frontend consumes the stream via fetch + ReadableStream. Events match
    iter_factory_pipeline, plus a terminal `written` (when persisted) and `done`.
    """
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice)
    mega = compile_mega_prompt(payload.spec, payload.blueprint)

    def event_source():
        result = None
        try:
            for event in iter_factory_pipeline(
                mega,
                user_model_choice=payload.user_model_choice,
                api_key=api_key,
                delivery_type=payload.spec.delivery_type,
                language=payload.spec.suggested_stack.language,
                framework=payload.spec.suggested_stack.framework,
            ):
                if event.get("type") == "result":
                    result = event["result"]
                    continue
                yield _sse(event)
        except LLMError as exc:
            yield _sse({"type": "error", "detail": _llm_failure(exc)})
            return

        degraded = bool(result) and any(run.response.served_by_fallback for run in result.runs)
        if payload.persist and result and result.ok:
            files = [f for run in result.runs for f in run.parsed.files]
            try:
                write_result = ProjectWriter().write(
                    files,
                    project_name=payload.project_name,
                    metadata={"models": sorted({run.model for run in result.runs})},
                    owner=user["user_id"],
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


@router.post("/meta-factory/generate/stage/stream")
def generate_stage_stream(payload: StageGenerateRequest, user: CurrentUser) -> StreamingResponse:
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice)
    if payload.role not in PIPELINE_ORDER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pipeline role.")
    # Appending stages must target a project the caller owns (H3).
    if payload.project_id:
        _owned_meta_project(payload.project_id, user)
    context = _stage_context(payload)

    def event_source():
        parsed = None
        response = None
        project_id = payload.project_id
        stage_errors: list[str] = []
        try:
            for event in iter_single_agent(
                None,
                payload.role,
                context,
                user_model_choice=payload.user_model_choice,
                api_key=api_key,
                language=payload.spec.suggested_stack.language,
                framework=payload.spec.suggested_stack.framework,
            ):
                if event.get("type") == "result":
                    parsed = event["parsed"]
                    response = event["response"]
                    continue
                yield _sse(event)
        except LLMError as exc:
            stage_errors.append(_llm_failure(exc))

        if parsed is None:
            stage_errors.append("stage produced no result")
            parsed_errors: list[str] = []
            parsed_warnings: list[str] = []
            parsed_files = []
        else:
            parsed_errors = list(parsed.errors)
            parsed_warnings = list(parsed.warnings)
            parsed_files = list(parsed.files)

        stage_errors.extend(parsed_errors)
        model = response.model if response is not None else (payload.user_model_choice or "error")
        degraded = bool(response and response.served_by_fallback)

        if payload.persist and parsed_files:
            try:
                writer = ProjectWriter()
                metadata = {"models": [model]} if response is not None else None
                if project_id is None:
                    write_result = writer.write(
                        parsed_files,
                        project_name=payload.project_name,
                        metadata=metadata,
                        owner=user["user_id"],
                    )
                    # First stage: persist the spec/blueprint so the remaining
                    # stages can reference them by project_id with a slim body.
                    _persist_stage_inputs(write_result.root_path, payload.spec, payload.blueprint)
                else:
                    write_result = writer.append(
                        project_id, parsed_files, metadata=metadata, owner=user["user_id"]
                    )
                project_id = write_result.project_id
                yield _sse({
                    "type": "written",
                    "project_id": write_result.project_id,
                    "root_path": write_result.root_path,
                    "file_count": write_result.file_count,
                })
                if payload.role == "docs":
                    validation = generation_validation_engine.validate(_meta_project(write_result.project_id))
                    yield _sse({
                        "type": "validation_report",
                        "report": validation.model_dump(mode="json"),
                    })
            except ProjectWriteError as exc:
                stage_errors.append(str(exc))

        yield _sse({
            "type": "stage_done",
            "role": payload.role,
            "file_count": len(parsed_files),
            "errors": stage_errors,
            "warnings": parsed_warnings,
            "degraded": degraded,
            "model": model,
            "project_id": project_id,
        })

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/meta-factory/review", response_model=CompletenessReviewResponse)
def review_completeness(payload: CompletenessReviewRequest, user: CurrentUser) -> CompletenessReviewResponse:
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice)
    try:
        report = CompletenessReviewEngine().review(
            payload.spec,
            _meta_project(payload.project_id),
            user_model_choice=payload.user_model_choice,
            api_key=api_key,
        )
    except LLMError as exc:
        raise _llm_http_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return CompletenessReviewResponse.model_validate(report.model_dump(mode="json"))


@router.post("/meta-factory/{project_id}/verify/stream")
def verify_meta_factory_project(project_id: str, payload: VerifyRequest, user: CurrentUser) -> StreamingResponse:
    """The build/auto-repair 'sala de teste': build the project for real, repair on
    failure, persist the verdict. Streams progress as SSE."""
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice)
    project = _owned_meta_project(project_id, user)

    def event_source():
        try:
            for event in iter_verification(
                project, payload.spec, user_model_choice=payload.user_model_choice, api_key=api_key
            ):
                yield _sse(event)
        except LLMError as exc:
            yield _sse({"type": "error", "detail": _llm_failure(exc)})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/meta-factory/{project_id}/terminal/execute")
def execute_terminal_command(project_id: str, payload: TerminalExecuteRequest, user: CurrentUser) -> StreamingResponse:
    """LDCN Execution Terminal: run ONE allowlisted command inside the generated
    project workspace, streaming sanitized output lines as SSE and persisting the
    durable record (audit trail). The human-intervention escape hatch for builds
    the bounded auto-repair could not fix."""
    project = _owned_meta_project(project_id, user)
    _audit(user["user_id"], "terminal_command_executed")

    frames: queue.Queue[tuple[str, Any]] = queue.Queue()

    def run() -> None:
        try:
            record = execution_terminal_service.execute(
                project, payload.command, cwd=payload.cwd,
                executed_by=user["user_id"],
                on_line=lambda stream, line: frames.put(("line", {"stream": stream, "line": line})),
            )
            frames.put(("done", record.model_dump(mode="json")))
        except Exception as exc:  # noqa: BLE001 — the stream must always terminate
            frames.put(("error", str(exc)))

    def event_source():
        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        while True:
            try:
                kind, value = frames.get(timeout=1.0)
            except queue.Empty:
                yield _sse({"type": "heartbeat"})
                continue
            if kind == "line":
                yield _sse({"type": "line", **value})
            elif kind == "done":
                yield _sse({"type": "done", "record": value})
                return
            else:
                yield _sse({"type": "error", "detail": str(value)})
                return

    return StreamingResponse(
        event_source(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/meta-factory/{project_id}/terminal/history", response_model=TerminalHistoryResponse)
def terminal_history(project_id: str, user: CurrentUser) -> TerminalHistoryResponse:
    """Persistent per-project command history + the allowlist shown in the UI."""
    _owned_meta_project(project_id, user)
    return TerminalHistoryResponse(
        project_id=project_id,
        records=execution_terminal_service.history(project_id),
        allowed_commands=ALLOWED_COMMANDS_DISPLAY,
    )


@router.post("/meta-factory/{project_id}/validate", response_model=QualityGateReport)
def validate_quality(project_id: str, user: CurrentUser, build: bool = Query(True)) -> QualityGateReport:
    """Run the Quality Gate. build=true also runs the real build (npm/pip/mvn)."""
    report = quality_gate_engine.evaluate(_owned_meta_project(project_id, user), run_build=build)
    _audit(user["user_id"], "quality_gate_run")
    if report.blocker_count > 0:
        _audit(user["user_id"], "quality_gate_failed")
    return report


@router.get("/meta-factory/{project_id}/quality-report", response_model=QualityGateReport)
def get_quality_report(project_id: str, user: CurrentUser) -> QualityGateReport:
    """Fast deterministic Quality Gate (no build) Ã¢â‚¬â€ for rendering the report card."""
    return quality_gate_engine.evaluate(_owned_meta_project(project_id, user), run_build=False)


@router.post("/meta-factory/{project_id}/repair", response_model=RepairResult)
def repair_project(project_id: str, user: CurrentUser) -> RepairResult:
    """Apply safe, deterministic auto-repairs (no LLM, no shell)."""
    project = _owned_meta_project(project_id, user)
    report = quality_gate_engine.evaluate(project, run_build=False)
    _audit(user["user_id"], "auto_repair_started")
    try:
        result = auto_repair_engine.repair(project, report)
    except Exception as exc:  # noqa: BLE001
        _audit(user["user_id"], "auto_repair_failed")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    for action in result.actions:
        if action.status == "applied":
            _audit(user["user_id"], "auto_repair_action_applied")
    _audit(user["user_id"], "auto_repair_completed" if result.failed_count == 0 else "auto_repair_failed")
    return result


@router.post("/meta-factory/{project_id}/revalidate", response_model=RevalidationResult)
def revalidate_project(project_id: str, user: CurrentUser, build: bool = Query(True)) -> RevalidationResult:
    """Re-run the Quality Gate after a repair and report what remains."""
    report = quality_gate_engine.evaluate(_owned_meta_project(project_id, user), run_build=build)
    _audit(user["user_id"], "revalidation_run")
    remaining = [issue.id for issue in report.issues if issue.severity == "BLOCKER"]
    return RevalidationResult(
        project_id=report.project_id,
        report=report,
        fixed_ids=[],
        remaining_ids=remaining,
        score_delta=0,
    )


@router.post("/meta-factory/{project_id}/force-release", response_model=QualityGateReport)
def force_release_project(
    project_id: str, payload: ForceReleaseRequest, user: CurrentUser
) -> QualityGateReport:
    """Conscious 'liberar mesmo assim': requires the exact confirmation phrase."""
    _force_release_authorized_project(project_id, user)
    _audit(user["user_id"], "force_release_requested")
    if payload.confirmation.strip() != CONSCIOUS_RELEASE_PHRASE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'ConfirmaÃƒÂ§ÃƒÂ£o invÃƒÂ¡lida. Digite exatamente: "{CONSCIOUS_RELEASE_PHRASE}".',
        )
    try:
        ProjectWriter().set_release_override(project_id, by_user=user["user_id"], reason="force release")
    except ProjectWriteError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _audit(user["user_id"], "force_release_confirmed")
    return quality_gate_engine.evaluate(_meta_project(project_id), run_build=False)


def _require_verified(project_id: str, *, force: bool, user_id: str | None = None) -> None:
    """Release gate: block download/export when the project has critical problems
    (Quality Gate BLOCKERS) or has not passed the build verification Ã¢â‚¬â€ unless the
    caller explicitly overrides ('mesmo assim') or a conscious force-release is on."""
    if force:
        return

    report = quality_gate_engine.evaluate(_meta_project(project_id), run_build=False)
    if report.release_override:
        return  # conscious 'liberar com risco' already confirmed and audited

    # A verified build ("sala de teste") is a sufficient, strong release signal.
    try:
        verdict = ProjectWriter().read_verification(project_id)
    except ProjectWriteError:
        verdict = {"verified": False}
    if verdict.get("verified"):
        return

    # Not verified: hard-block on critical Quality Gate problems. With no blockers the
    # gate has passed (passar 100% -> liberar), so delivery is allowed.
    if report.blocker_count > 0:
        if user_id:
            _audit(user_id, "git_export_blocked")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"ExportaÃƒÂ§ÃƒÂ£o bloqueada porque ainda existem {report.blocker_count} problema(s) "
                "crÃƒÂ­tico(s). Corrija automaticamente, rode a validaÃƒÂ§ÃƒÂ£o novamente ou veja os problemas."
            ),
        )


@router.get("/meta-factory/{project_id}/files", response_model=GeneratedProjectFilesResponse)
def list_meta_factory_files(project_id: str, user: CurrentUser) -> GeneratedProjectFilesResponse:
    return GeneratedProjectFilesResponse.model_validate(
        _generated_project_service.list_files(_owned_meta_project(project_id, user))
    )


@router.get("/meta-factory/{project_id}/file-content", response_model=GeneratedFileContentResponse)
def get_meta_factory_file(
    project_id: str, user: CurrentUser, path: str = Query(..., min_length=1)
) -> GeneratedFileContentResponse:
    return GeneratedFileContentResponse.model_validate(
        _generated_project_service.read_file(_owned_meta_project(project_id, user), path)
    )


@router.post("/meta-factory/{project_id}/prepare-download", response_model=PreparedDownloadResponse)
def prepare_meta_factory_download(
    project_id: str, user: CurrentUser, force: bool = Query(False)
) -> PreparedDownloadResponse:
    project = _owned_meta_project(project_id, user)
    _require_verified(project_id, force=force, user_id=user["user_id"])
    return PreparedDownloadResponse.model_validate(
        _generated_project_service.prepare_download(project)
    )


@router.get("/meta-factory/{project_id}/download")
def download_meta_factory_project(project_id: str, user: CurrentUser) -> FileResponse:
    zip_path = _generated_project_service.download_path(_owned_meta_project(project_id, user))
    return FileResponse(zip_path, media_type="application/zip", filename=f"{project_id}.zip")


@router.post("/meta-factory/{project_id}/export/{provider}", response_model=GeneratedProjectExportResponse)
def export_meta_factory_project(
    project_id: str,
    provider: GitProvider,
    payload: GeneratedProjectExportRequest,
    user: CurrentUser,
) -> GeneratedProjectExportResponse:
    return _export_generated_project(user["user_id"], _owned_meta_project(project_id, user), provider, payload)


@router.get("/meta-factory/{project_id}/endpoints", response_model=GeneratedEndpointsResponse)
def list_meta_factory_endpoints(project_id: str, user: CurrentUser) -> GeneratedEndpointsResponse:
    return api_collection_service.list_endpoints(_owned_meta_project(project_id, user))


@router.get("/meta-factory/{project_id}/api-collection", response_model=ApiCollectionResponse)
def get_meta_factory_api_collection(
    project_id: str,
    user: CurrentUser,
    format: str = Query("postman", pattern="^(postman|insomnia)$"),
) -> ApiCollectionResponse:
    return api_collection_service.collection(_owned_meta_project(project_id, user), format)  # type: ignore[arg-type]


def _export_generated_project(
    user_id: str,
    project: dict,
    provider: GitProvider,
    payload: GeneratedProjectExportRequest,
) -> GeneratedProjectExportResponse:
    _require_verified(str(project["project_id"]), force=payload.force, user_id=user_id)
    status_info = git_provider_service.status(user_id, provider)
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
        user_id,
        provider,
        namespace=payload.namespace,
        repo_name=payload.repo_name,
        visibility=payload.visibility,
        branch=payload.branch,
    )
    repository = git_provider_service.push_initial_commit(
        user_id,
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
