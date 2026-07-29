from __future__ import annotations

from fastapi import HTTPException, status

from app.core.config import get_settings
from app.engines.generation_job_engine import GenerationJobEngine, generation_job_engine as _default_generation_job_engine
from app.repositories.blueprint_approval_repository import BlueprintApprovalRepository, hash_blueprint
from app.routes.meta_factory_job_helpers import _audit, _generation_llm_context, _writable_workspace
from app.routes.project_rooms import service as project_room_service
from app.schemas.generation_job import CreateGenerationJobRequest
from app.services.plan_access_engine import PlanAccessDeniedError, PlanAccessEngine
from app.services.project_room_service import ENGINEERING_APPROVED_STATUSES


class GenerationJobCreationService:
    """Every gate a GenerationJob must clear before it starts, in one place.

    Extracted from the POST /meta-factory/jobs route body so a second, non-HTTP
    caller (MissionExecutionHandoffService, once a Mission's ProjectRoom clears
    Engineering Review + Stack Approval for real) reuses the exact same
    concurrency cap, plan-access check, gate re-verification, and job
    creation/start -- instead of importing a FastAPI route function directly or
    duplicating this logic."""

    def create(
        self, *, payload: CreateGenerationJobRequest, user: dict,
        source_mission_id: str | None = None, engine: GenerationJobEngine | None = None,
    ) -> dict:
        # `engine` defaults to the real singleton but is accepted as a parameter
        # so a caller resolving its OWN generation_job_engine reference at call
        # time (e.g. meta_factory.py's route, whose module attribute route-level
        # tests monkeypatch to a test-scoped engine) can pass it through instead
        # of this module's import binding it once at import time.
        generation_job_engine = engine or _default_generation_job_engine
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
        try:
            PlanAccessEngine().check_build_execute(user_id=user["user_id"], organization_id=workspace["organization_id"])
        except PlanAccessDeniedError as exc:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=exc.to_detail()) from exc
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
        engine_mode = "deterministic" if payload.mode == "deterministic" else "normal"
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
                mode=engine_mode,
                source_mission_id=source_mission_id,
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
            mode=engine_mode,
        )
        return job


generation_job_creation_service = GenerationJobCreationService()
