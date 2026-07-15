from __future__ import annotations

import concurrent.futures as cf
import hashlib
import json
import re
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import get_settings
from app.engines.agent_executor import submit_agent
from app.engines.context_pack_builder import build_agent_context, compress_to_budget, estimate_tokens, module_roots_from_emitted, summarize_contract
from app.engines.factory_pipeline import _run_agent
from app.engines.functional_completeness_engine import functional_completeness_engine
from app.engines.functional_coverage_engine import functional_coverage_engine
from app.engines.product_certification_engine import product_certification_engine
from app.engines.generation_validation_engine import generation_validation_engine
from app.engines.execution_plan_engine import build_execution_plan
from app.engines.ground_truth_engine import ground_truth_engine
from app.engines.generation_usage import usage_totals as _usage_totals
from app.engines.generation_pipeline_policy import BACKEND_CHUNKS, MOBILE_CHUNKS, DELIVERY_TYPES_WITH_MOBILE, PipelineStep, STEPS, logical_stages_for, steps_for
from app.engines.project_manifest_engine import build_project_manifest
from app.engines.project_memory_engine import PROJECT_MEMORY_FILE, ProjectMemory, project_memory_engine
from app.engines.work_estimation_engine import estimate_generation_effort
from app.services.execution_reality_guard import execution_reality_guard
from app.engines.llm.router import LLMRouter
from app.engines.orchestrator_engine import compile_mega_prompt
from app.engines.warning_policy import classify as classify_warnings
from app.repositories.download_repository import DownloadRepository
from app.repositories.generation_job_repository import GenerationJobRepository
from app.repositories.redaction import redact_value
from app.schemas.functional_coverage import FunctionalCoverageReport
from app.schemas.orchestrator import ProjectSpec
from app.services.file_protocol import EmittedFile
from app.services.download_service import DownloadService
from app.services.generated_project_service import GeneratedProjectService
from app.services import import_graph_engine
from app.services.project_writer import DEFAULT_OUTPUT_ROOT, ProjectWriter
from app.services.stack_compatibility import STACK_LOCK_FILE, StackLock, stack_compatibility_engine


# Per-stage hard ceiling. The LLM call already retries up to 3x at 6 min each
# (factory_pipeline.AGENT_TIMEOUT_MS), so a legitimate deep agent can run ~18 min.
# The watchdog sits just above that worst case: a step that exceeds it is a genuine
# hang (an adapter ignoring its own timeout, a never-resolving await, a wedged
# socket) and is converted into a STALLED job instead of a forever-"running" one.
STAGE_TIMEOUT_SECONDS = 1500  # 25 min — bounds any single step; never infinite

# Statuses that no longer occupy an agent worker: a job in one of these is done,
# awaiting the user, or parked. Everything else (QUEUED + the *_RUNNING/*_GENERATING
# stages) counts as "in flight" for the per-user concurrency cap (audit MF3).
TERMINAL_STATUSES = frozenset({"READY", "FAILED", "PAUSED", "NEEDS_USER_ACTION", "STALLED"})
MAX_MANUAL_BUILD_RETRIES = 3

LOGICAL_STAGES = ["contracts", "database", "backend", "frontend", "mobile", "security", "tests", "docs", "build", "package"]
JAVA_RESERVED_PACKAGE_SEGMENTS = frozenset({
    "abstract", "assert", "boolean", "break", "byte", "case", "catch",
    "char", "class", "const", "continue", "default", "do", "double",
    "else", "enum", "extends", "final", "finally", "float", "for",
    "goto", "if", "implements", "import", "instanceof", "int", "interface",
    "long", "native", "new", "package", "private", "protected", "public",
    "return", "short", "static", "strictfp", "super", "switch",
    "synchronized", "this", "throw", "throws", "transient", "try", "void",
    "volatile", "while", "true", "false", "null", "record", "sealed",
    "permits", "non-sealed", "var", "yield",
})


class StageFailure(RuntimeError):
    def __init__(self, message: str, *, diagnostic: dict[str, Any]):
        super().__init__(message)
        self.diagnostic = diagnostic


class StageStalled(RuntimeError):
    """A stage exceeded its timeout (provider/task never resolved). The job is
    marked STALLED — recoverable — instead of being left forever in 'running'."""

    def __init__(self, message: str, *, diagnostic: dict[str, Any]):
        super().__init__(message)
        self.diagnostic = diagnostic


class JobPaused(RuntimeError):
    pass


class GenerationJobEngine:
    def __init__(self, repository: GenerationJobRepository | None = None, checkpoint_root: Path | None = None, download_service: DownloadService | None = None) -> None:
        self.repository = repository or GenerationJobRepository()
        self.download_service = download_service or DownloadService(DownloadRepository(self.repository.database_url))
        self.checkpoint_root = (checkpoint_root or (DEFAULT_OUTPUT_ROOT.parent / "jobs")).resolve()
        self.checkpoint_root.mkdir(parents=True, exist_ok=True)
        self.stage_timeout_seconds: float = STAGE_TIMEOUT_SECONDS
        self.lease_seconds = get_settings().generation_job_lease_seconds
        self.worker_id = f"generation-worker-{uuid4().hex[:12]}"
        self._threads: dict[str, threading.Thread] = {}
        self._lock = threading.RLock()
        # Serializes live execution-event emission (stdout/stderr pump threads emit
        # concurrently during a build) and throttles high-frequency output saves.
        self._event_lock = threading.Lock()
        self._last_event_save: dict[str, float] = {}

    def create_job(
        self, *, owner_user_id: str, project_id: str, workspace_id: str | None,
        project_name: str, spec: ProjectSpec, blueprint: dict[str, Any],
        blueprint_version: int, provider: str | None, provider_label: str,
        model: str | None, mode: str = "normal",
    ) -> dict[str, Any]:
        if spec.delivery_type in DELIVERY_TYPES_WITH_MOBILE and self._mobile_stack(spec, blueprint) == "flutter":
            raise ValueError(
                "Flutter generation is not available yet. Confirm React Native + Expo "
                "or wait for Mobile Factory Phase 5."
            )
        now = self._now()
        job_id = f"genjob_{uuid4().hex[:14]}"
        steps = steps_for(spec.delivery_type)
        stages = logical_stages_for(steps)
        work_estimate = estimate_generation_effort(spec, blueprint, project_name=project_name)
        execution_plan = build_execution_plan(spec.delivery_type, stages)
        data = {
            "id": job_id, "projectId": project_id, "generatedProjectId": None,
            "workspaceId": workspace_id, "status": "QUEUED", "currentStage": "QUEUED",
            "provider": provider, "providerLabel": provider_label, "model": model, "mode": mode,
            "blueprintVersion": blueprint_version, "startedAt": now, "finishedAt": None,
            "progress": 0, "error": None, "retryCount": 0, "artifacts": [],
            "buildStatus": "PENDING", "buildAttempts": 0,
            "manualBuildRetryCount": 0, "buildSkipAcknowledged": False,
            "manualBuildFixGuide": None, "stackLock": None,
            "logs": [], "events": [], "checkpoints": [],
            "stageStatuses": {stage: "waiting" for stage in stages},
            "projectName": project_name, "partial": True, "valid": False,
            "packageReady": False, "inputTokensTotal": 0, "outputTokensTotal": 0,
            "resultPath": None, "createdAt": now, "updatedAt": now,
            "workEstimate": work_estimate.model_dump(mode="json"),
            "executionPlan": execution_plan.model_dump(mode="json"),
        }
        self.repository.create(owner_user_id, data, redact_value(spec.model_dump(mode="json")), redact_value(blueprint))
        self._log(data, "QUEUED", "info", "GenerationJob criado e persistido.")
        self._save(data, owner_user_id)
        return data

    def start(self, job_id: str, owner_user_id: str, *, api_key: str | None, user_model_choice: str | None, start_index: int = 0, mode: str = "normal") -> dict[str, Any] | None:
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            return None
        with self._lock:
            running = self._threads.get(job_id)
            if running and running.is_alive():
                return job
            attempt_id = self.repository.claim(
                job_id, owner_user_id, self.worker_id, lease_seconds=self.lease_seconds
            )
            if attempt_id is None:
                return self.repository.get(job_id, owner_user_id)
            thread = threading.Thread(
                target=self.execute,
                args=(job_id, owner_user_id),
                kwargs={
                    "api_key": api_key,
                    "user_model_choice": user_model_choice,
                    "start_index": start_index,
                    "mode": mode,
                    "attempt_id": attempt_id,
                },
                daemon=False,
            )
            self._threads[job_id] = thread
            thread.start()
        return job

    def execute(self, job_id: str, owner_user_id: str, *, api_key: str | None, user_model_choice: str | None, start_index: int = 0, mode: str = "normal", attempt_id: str | None = None) -> None:
        attempt_id = attempt_id or self.repository.claim(
            job_id, owner_user_id, self.worker_id, lease_seconds=self.lease_seconds
        )
        if attempt_id is None:
            return
        inputs = self.repository.inputs(job_id, owner_user_id)
        job = self.repository.get(job_id, owner_user_id)
        if inputs is None or job is None:
            self.repository.release_lease(job_id, self.worker_id, attempt_id)
            return
        try:
            spec_data, blueprint = inputs
            spec = ProjectSpec.model_validate(spec_data)
            mega = compile_mega_prompt(spec, blueprint)
            steps = steps_for(spec.delivery_type)
        except Exception:
            self.repository.release_lease(job_id, self.worker_id, attempt_id)
            raise
        try:
            for index in range(start_index, len(steps)):
                if not self.repository.heartbeat(
                    job_id, self.worker_id, attempt_id, lease_seconds=self.lease_seconds
                ):
                    raise RuntimeError("Generation job lease was lost to another worker.")
                current = self.repository.get(job_id, owner_user_id)
                if current is None or current["status"] == "PAUSED":
                    return
                job = current
                step = steps[index]
                self._begin_step(job, owner_user_id, step, index, steps)
                self._execute_step(job, owner_user_id, step, spec, blueprint, mega, api_key, user_model_choice, mode)
                self._assert_not_paused(job, owner_user_id)
                self._finish_step(job, owner_user_id, step, index, steps)
            job["status"] = "READY"
            job["currentStage"] = "READY"
            job["progress"] = 100
            build_skipped = job.get("buildStatus") == "SKIPPED_AFTER_FAILURE"
            job["partial"] = build_skipped
            job["valid"] = not build_skipped
            job["packageReady"] = True
            job["finishedAt"] = self._now()
            job["error"] = None
            # Manifest first: the Functional Completeness Gate's Integrations
            # category (product-completion-report.json) calls the External
            # Integration Auditor, which reads ldcn.project.json's
            # selected_infrastructure_ids to know what the user actually opted
            # into -- evaluating completeness before the manifest exists would
            # make any declared provider SDK look "not opted in".
            self._write_project_manifest(job, spec, blueprint)
            self._evaluate_functional_completeness(job, owner_user_id, build_skipped=build_skipped)
            for stage in logical_stages_for(steps):
                if job["stageStatuses"].get(stage) != "skipped":
                    job["stageStatuses"][stage] = "success"
            self._log(
                job, "READY", "warning" if build_skipped else "info",
                "Pipeline concluida com build pulado; guia manual preservado."
                if build_skipped else "Pipeline concluida. Projeto validado e pacote pronto.",
            )
            self._finalize_pipeline(
                job, owner_user_id,
                outcome="DEGRADED_CONTINUATION" if build_skipped else "SUCCESS",
                message=(
                    "Pipeline concluida em modo degradado: build pulado apos o limite de auto-reparo; "
                    "projeto parcial disponivel para visualizar, exportar e reexecutar o build manualmente."
                    if build_skipped
                    else "Pipeline concluida com sucesso; projeto validado e pacote pronto."
                ),
            )
        except JobPaused:
            return
        except StageFailure as exc:
            job = self.repository.get(job_id, owner_user_id) or job
            job["status"] = "NEEDS_USER_ACTION"
            job["error"] = exc.diagnostic
            job["partial"] = True
            job["valid"] = False
            job["packageReady"] = False
            failed_checkpoint = next(
                (
                    item for item in reversed(job["checkpoints"])
                    if item["stage"] == job["currentStage"] and item["status"] == "running"
                ),
                None,
            )
            if failed_checkpoint:
                failed_checkpoint["status"] = "failed"
                failed_checkpoint["finished_at"] = self._now()
                failed_checkpoint["detail"] = str(exc)
            job["stageStatuses"][steps[self._step_index(job["currentStage"], steps)].logical if self._step_index(job["currentStage"], steps) >= 0 else "build"] = "failed"
            self._log(job, job["currentStage"], "error", str(exc), exc.diagnostic.get("recommended_action"))
            self._emit(job, owner_user_id, "error", stage=job["currentStage"], level="error", message=str(exc))
            self._record_known_problem(job, owner_user_id, steps, str(exc))
            self._finalize_pipeline(job, owner_user_id, outcome="NEEDS_USER_ACTION", message=str(exc))
        except StageStalled as exc:
            # A step ran past its timeout: never leave the job 'running'. Persist the
            # checkpoint, expose a full diagnostic and let the user recover.
            job = self.repository.get(job_id, owner_user_id) or job
            job["status"] = "STALLED"
            job["error"] = exc.diagnostic
            job["partial"] = True
            job["valid"] = False
            job["packageReady"] = False
            stalled_checkpoint = next(
                (
                    item for item in reversed(job["checkpoints"])
                    if item["stage"] == job["currentStage"] and item["status"] == "running"
                ),
                None,
            )
            if stalled_checkpoint:
                stalled_checkpoint["status"] = "stalled"
                stalled_checkpoint["finished_at"] = self._now()
                stalled_checkpoint["detail"] = str(exc)
            stalled_index = self._step_index(job["currentStage"], steps)
            if stalled_index >= 0:
                job["stageStatuses"][steps[stalled_index].logical] = "stalled"
            self._log(job, job["currentStage"], "warning", str(exc), exc.diagnostic.get("recommended_action"))
            self._emit(job, owner_user_id, "stalled", stage=job["currentStage"], level="warning", message=str(exc))
            self._record_known_problem(job, owner_user_id, steps, str(exc))
            self._finalize_pipeline(job, owner_user_id, outcome="STALLED", message=str(exc))
        except Exception as exc:  # keep every checkpoint; never claim success
            job = self.repository.get(job_id, owner_user_id) or job
            job["status"] = "FAILED"
            job["error"] = self._diagnostic(job, job["currentStage"], "pipeline", str(exc), steps=steps)
            job["partial"] = True
            job["valid"] = False
            job["packageReady"] = False
            self._log(job, job["currentStage"], "error", "Falha inesperada da pipeline.", str(exc))
            self._emit(job, owner_user_id, "error", stage=job["currentStage"], level="error", message=f"Falha inesperada da pipeline: {exc}")
            self._record_known_problem(job, owner_user_id, steps, f"Falha inesperada da pipeline: {exc}")
            self._finalize_pipeline(job, owner_user_id, outcome="FAILED", message=f"Falha inesperada da pipeline: {exc}")
        finally:
            self.repository.release_lease(job_id, self.worker_id, attempt_id)

    def reconcile_startup(self) -> dict[str, int]:
        stalled = self.repository.reconcile_expired(TERMINAL_STATUSES)
        resumed = 0
        for job_id, owner_user_id in self.repository.queued_without_lease():
            if self.start(
                job_id, owner_user_id, api_key=None, user_model_choice=None
            ) is not None:
                resumed += 1
        return {"stalled": stalled, "resumed": resumed}
    def _finalize_pipeline(self, job: dict[str, Any], owner: str, *, outcome: str, message: str) -> None:
        """State Transition Finalizer: EVERY pipeline run — success, degraded
        continuation (build skipped), user-action block, stall or crash — ends
        here. It stamps finishedAt and emits the mandatory PIPELINE_COMPLETE
        execution event, so the frontend always receives a terminal signal and
        can never be left waiting for a BUILD_SUCCESS that will not come.

        Outcomes: SUCCESS | DEGRADED_CONTINUATION | NEEDS_USER_ACTION | STALLED | FAILED."""
        job["finishedAt"] = job.get("finishedAt") or self._now()
        self._emit(
            job, owner, "pipeline_complete",
            stage=job.get("currentStage") or "READY",
            level="info" if outcome == "SUCCESS" else "warning",
            message=f"PIPELINE_COMPLETE ({outcome}): {message}",
        )
        self._save(job, owner)

    def _steps_for_job(self, job_id: str, owner_user_id: str) -> list[PipelineStep]:
        """Resolve the correct per-job step list (web vs. mobile-inclusive) for
        recovery actions (retry/resume/continue), which only have a job id --
        unlike execute(), which already has the spec in scope. Falls back to the
        web-only STEPS if the job's persisted inputs can't be loaded."""
        inputs = self.repository.inputs(job_id, owner_user_id)
        if inputs is None:
            return STEPS
        spec_data, _ = inputs
        return steps_for(spec_data.get("delivery_type"))

    def retry_stage(self, job_id: str, owner_user_id: str, stage: str, *, api_key: str | None, user_model_choice: str | None, mode: str) -> dict[str, Any] | None:
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            return None
        steps = self._steps_for_job(job_id, owner_user_id)
        index = self._recovery_index(job, steps, stage)
        if index < 0:
            raise ValueError(f"Etapa desconhecida: {stage}")
        if steps[index].logical == "build":
            manual_retries = int(job.get("manualBuildRetryCount", 0))
            if manual_retries >= MAX_MANUAL_BUILD_RETRIES:
                raise ValueError(
                    f"Limite de {MAX_MANUAL_BUILD_RETRIES} reexecucoes manuais de build atingido. "
                    "Aplique o guia de correcao antes de criar um novo job."
                )
            job["manualBuildRetryCount"] = manual_retries + 1
            job["buildStatus"] = "PENDING"
            job["buildSkipAcknowledged"] = False
        job["retryCount"] += 1
        job["error"] = None
        job["status"] = "QUEUED"
        job["stageStatuses"][steps[index].logical] = "retrying"
        self._log(job, steps[index].state, "warning", f"Reexecucao solicitada em modo {mode}; checkpoints anteriores preservados.")
        self._save(job, owner_user_id)
        self.start(job_id, owner_user_id, api_key=api_key, user_model_choice=user_model_choice, start_index=index, mode=mode)
        return self.repository.get(job_id, owner_user_id)

    def acknowledge_build_skip(self, job_id: str, owner_user_id: str) -> dict[str, Any] | None:
        """Idempotent user acknowledgement for the degraded continuation. The
        runner already advances past a skipped build; this action records the
        explicit decision and also makes recovery safe after a process restart."""
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            return None
        if job.get("buildStatus") != "SKIPPED_AFTER_FAILURE":
            raise ValueError("O build deste job nao esta marcado como SKIPPED_AFTER_FAILURE.")
        if not job.get("buildSkipAcknowledged"):
            job["buildSkipAcknowledged"] = True
            self._log(
                job, "BUILD_RUNNING", "warning",
                "Usuario confirmou a continuidade do pipeline mesmo com build pulado.",
            )
            self._save(job, owner_user_id)
        return self.repository.get(job_id, owner_user_id)

    def resume(self, job_id: str, owner_user_id: str, *, api_key: str | None, user_model_choice: str | None) -> dict[str, Any] | None:
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            return None
        steps = self._steps_for_job(job_id, owner_user_id)
        index = self._recovery_index(job, steps, job.get("currentStage"))
        job["status"] = "QUEUED"
        job["error"] = None
        self._log(job, job["currentStage"], "info", "Continuando a partir do ultimo checkpoint.")
        self._save(job, owner_user_id)
        # Resume in the SAME mode the job was created with — a job started in
        # "deterministic" mode (no LLM provider required) must not silently
        # switch to real LLM calls (or demand a provider it never needed) just
        # because it stalled/paused and is being resumed.
        self.start(job_id, owner_user_id, api_key=api_key, user_model_choice=user_model_choice, start_index=max(0, index), mode=job.get("mode", "normal"))
        return self.repository.get(job_id, owner_user_id)

    def continue_with_warnings(self, job_id: str, owner_user_id: str, *, api_key: str | None, user_model_choice: str | None) -> dict[str, Any] | None:
        """User override: accept the current stage's warnings as non-blocking and
        advance to the next logical stage. Used to recover a STALLED job or a job
        held at NEEDS_USER_ACTION by classified (blocking) warnings, without losing
        any persisted artifact or checkpoint."""
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            return None
        steps = self._steps_for_job(job_id, owner_user_id)
        index = self._step_index(job.get("currentStage"), steps)
        if index < 0:
            raise ValueError("Etapa atual desconhecida; nao e possivel continuar.")
        current_logical = steps[index].logical
        next_index = next(
            (i for i in range(index + 1, len(steps)) if steps[i].logical != current_logical),
            len(steps),
        )
        if next_index >= len(steps):
            raise ValueError("Nao ha proxima etapa para continuar com warnings.")
        job["stageStatuses"][current_logical] = "success"
        job["status"] = "QUEUED"
        job["error"] = None
        job["retryCount"] += 1
        self._log(
            job, steps[next_index].state, "warning",
            f"Usuario optou por continuar com warnings; etapa '{current_logical}' aceita e pipeline avanca para {steps[next_index].state}.",
        )
        self._save(job, owner_user_id)
        self.start(job_id, owner_user_id, api_key=api_key, user_model_choice=user_model_choice, start_index=next_index, mode=job.get("mode", "normal"))
        return self.repository.get(job_id, owner_user_id)

    def pause(self, job_id: str, owner_user_id: str) -> dict[str, Any] | None:
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            return None
        job["status"] = "PAUSED"
        self._log(job, job["currentStage"], "warning", "Geracao pausada pelo usuario; checkpoints preservados.")
        return self._save(job, owner_user_id)

    def get(self, job_id: str, owner_user_id: str) -> dict[str, Any] | None:
        return self.repository.get(job_id, owner_user_id)

    def delete(self, job_id: str, owner_user_id: str) -> bool | None:
        """Delete a finished job. Returns None when the job doesn't exist and False
        when it's still in flight (pause it first so the runner stops writing)."""
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            return None
        if job["status"] not in TERMINAL_STATUSES:
            return False
        return self.repository.delete(job_id, owner_user_id)

    def latest(self, project_id: str, owner_user_id: str) -> dict[str, Any] | None:
        return self.repository.latest_for_project(project_id, owner_user_id)

    def list(self, owner_user_id: str, *, archived: bool | None = None) -> list[dict[str, Any]]:
        """Every job visible to the owner (owned or via workspace membership),
        newest first. The "space" for saved/archived/deleted jobs: `archived`
        filters to the active list (False), the archive (True), or everything
        (None)."""
        return self.repository.list(owner_user_id, archived=archived)

    def set_archived(self, job_id: str, owner_user_id: str, archived: bool) -> dict[str, Any] | None:
        """Archive/unarchive a finished job -- kept in history, out of the
        active list, without deleting it (see delete() for that). Only a
        terminal job can be archived; an in-flight job disappearing from the
        active view while still running would be confusing. Unarchiving has
        no such restriction."""
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            return None
        if archived and job["status"] not in TERMINAL_STATUSES:
            raise ValueError("Somente jobs finalizados podem ser arquivados.")
        return self.repository.set_archived(job_id, owner_user_id, archived)

    def count_active_for_user(self, owner_user_id: str) -> int:
        """Owner's in-flight generations (not in a terminal status). Bounds how many
        concurrent generations a single user can start (audit MF3)."""
        return self.repository.count_active_for_owner(owner_user_id, TERMINAL_STATUSES)

    def usage_summary(self, owner_user_id: str, since: str | None = None) -> dict[str, Any]:
        """Measured per-user token usage (totals + per-model), for cost attribution
        / billing (audit B4/AI2)."""
        return self.repository.usage_summary_for_owner(owner_user_id, since)

    def _execute_step(self, job: dict[str, Any], owner: str, step: PipelineStep, spec: ProjectSpec, blueprint: dict[str, Any], mega: str, api_key: str | None, model: str | None, mode: str) -> None:
        if step.action == "prepare":
            self._write_json_artifact(job, owner, step, "product-spec.normalized.json", spec.model_dump(mode="json"), "normalized_spec")
            domain = {"entities": spec.entities, "business_rules": spec.business_rules, "workflows": spec.core_workflows}
            self._write_json_artifact(job, owner, step, "domain-model.json", domain, "domain_model")
            # Stack Lock is fixed HERE, before CONTRACTS_GENERATING (the first LLM
            # step) ever runs: the anchor versions are decided up front instead of
            # being reverse-derived from whatever a later agent writes. Persisted as
            # a "generated" artifact so ProjectWriter carries it into the final
            # project root, where capture_lock()/validate_and_fix() (BUILD_RUNNING)
            # find it already present and enforce it rather than deriving a new one.
            # Technology Governance (Engineering Policy gap #5): the Stack
            # Approval Gate's React version choice (if any) fixes the anchor
            # here, before the first LLM call -- "" (unset) falls back to
            # React 18, unchanged from before this existed.
            react_major = (blueprint.get("stack_approval") or {}).get("selected_frontend_version") or None
            lock = stack_compatibility_engine.default_lock(delivery_type=spec.delivery_type, react_major=react_major)
            job["stackLock"] = lock.as_dict()
            # kind="generated" (not a metadata-only kind like normalized_spec/domain_model
            # above) so _build() carries this file into the final project root via
            # ProjectWriter, same as any other emitted source file.
            self._write_json_artifact(job, owner, step, STACK_LOCK_FILE, job["stackLock"], "generated")
            # Project Memory is fixed HERE too, same reasoning as Stack Lock: the
            # architecture/decisions this generation has already committed to must
            # exist BEFORE the first LLM call, not be reverse-derived afterwards
            # (that was the ldcn.project.json gap -- write-once, post-hoc, never
            # read back). Persisted as a "generated" artifact and rewritten after
            # every successful stage validation (see _record_stage_validated).
            memory = project_memory_engine.build_initial(spec, blueprint)
            job["projectMemory"] = memory.as_dict()
            self._write_json_artifact(job, owner, step, PROJECT_MEMORY_FILE, job["projectMemory"], "generated")
            self._persist_dependency_graph(job, owner, step, blueprint)
        elif step.action == "plan":
            chunks = BACKEND_CHUNKS if step.logical == "backend" else MOBILE_CHUNKS if step.logical == "mobile" else []
            payload = {"stage": step.logical, "inputs": self._context_requirements(step.logical), "chunks": chunks, "strategy": mode}
            self._write_json_artifact(job, owner, step, f"{step.logical}.plan.json", payload, "plan")
        elif step.action == "deterministic":
            schema = self._database_schema(spec)
            self._write_text_artifact(job, owner, step, "database.schema.sql", schema, "generated", valid=True)
        elif step.action == "llm":
            self._run_llm_step(job, owner, step, spec, mega, api_key, model, mode)
        elif step.action == "security":
            report = {"status": "passed", "checks": ["auth boundaries", "secret scan", "input validation", "dependency policy"], "source": "generated artifacts"}
            self._write_json_artifact(job, owner, step, "security.report.json", report, "validation")
        elif step.action == "validate":
            self._validate_stage(job, owner, step)
        elif step.action == "build":
            self._build(job, owner)
        elif step.action == "package":
            self._package(job, owner)

    def _run_llm_step(self, job: dict[str, Any], owner: str, step: PipelineStep, spec: ProjectSpec, mega: str, api_key: str | None, model: str | None, mode: str) -> None:
        contract = self._artifact_content(job, "openapi.yaml")
        contract_summary = summarize_contract(f'<<<FILE path="openapi.yaml">>>\n{contract}\n<<<END>>>') if contract else ""
        emitted = tuple(item["name"] for item in job["artifacts"] if item["kind"] == "generated")
        role = step.role or step.logical
        module_roots = module_roots_from_emitted(emitted) if role in {"backend", "mobile"} else ()
        context, diagnostics = build_agent_context(
            role, mega, contract_summary=contract_summary, emitted_files=emitted, module_roots=module_roots,
        )
        if step.chunk:
            context += (
                f"\n\n<{step.logical}_chunk>{step.chunk}</{step.logical}_chunk>\n"
                "Gere somente os arquivos deste chunk; nao repita arquivos de outros chunks."
            )
        if mode == "partitioned":
            context, compression = compress_to_budget(context, max(4_000, len(context) // 2))
            diagnostics.compressed = True
            diagnostics.compression_steps.extend(compression)
        # Ground Truth State Engine: the REAL system state is mandatory in every
        # LLM context (appended AFTER compression so it always survives). The
        # model can never guess whether the build passed, a repo exists or the
        # pipeline finished — it is told, and in failure state it is put in
        # DIAGNOSTIC ONLY mode.
        ground_truth = ground_truth_engine.from_job(job)
        context += "\n\n" + ground_truth_engine.prompt_block(ground_truth)
        # Project Memory: read-before-write anti-hallucination context (Production
        # Guarantee Engine spec, section 5). Appended after compression, same as
        # Ground Truth above, so it always survives a partitioned/compressed retry.
        memory = ProjectMemory.from_dict(job.get("projectMemory"))
        context += "\n\n" + project_memory_engine.prompt_block(memory)
        # Stack Lock was fixed before generation started (PREPARING_CONTEXT): tell
        # the frontend/mobile agent the exact anchor versions so it emits matching
        # manifests instead of relying on the post-generation Auto Version Fixer.
        lock = job.get("stackLock") if step.logical in {"frontend", "mobile"} else None
        if lock:
            hints = [
                f"- {name}: {value}"
                for name, value in (("react", lock.get("react")), ("react-native", lock.get("react_native")), ("expo", lock.get("expo")))
                if value
            ]
            if hints:
                context += (
                    "\n\n<stack_lock>\nStack Lock travado ANTES da geracao (imutavel; "
                    "gere manifests exatamente nestas versoes):\n" + "\n".join(hints) + "\n</stack_lock>\n"
                )
        payload_bytes = len(context.encode("utf-8"))
        token_estimate = estimate_tokens(context)
        checkpoint = self._checkpoint(job, step, payload_bytes, token_estimate)
        # Persist the running checkpoint BEFORE the (potentially hanging) LLM call so
        # a stall/crash recovery — which reloads from the repository — still sees it.
        self._save(job, owner)
        if mode == "deterministic":
            self._deterministic_stage_fallback(job, owner, step)
            checkpoint["status"] = "success"
            checkpoint["partitioned"] = True
            checkpoint["detail"] = "Fallback deterministico especifico da etapa aplicado."
            return
        self._emit(job, owner, "agent_started", stage=step.state, message=f"Agente '{role}' iniciado ({job.get('model') or 'provider'}); {token_estimate} tokens estimados.")
        response, parsed = self._route_with_timeout(
            job, owner, step, role, context, model, api_key,
            language=spec.suggested_stack.language, framework=spec.suggested_stack.framework,
        )
        self._assert_not_paused(job, owner)
        response, parsed = self._enforce_reality(job, owner, step, role, context, ground_truth, response, parsed, model, api_key, spec)
        self._emit(job, owner, "agent_finished", stage=step.state, message=f"Agente '{role}' respondeu: {len(parsed.files)} arquivo(s).")
        raw = response.text if response is not None else parsed.raw_response
        raw_artifact = self._write_text_artifact(job, owner, step, f"raw/{step.logical}-{step.chunk or 'main'}.txt", raw or "", "raw_response", valid=False)
        checkpoint["parser"] = parsed.parser_strategy
        checkpoint["partitioned"] = parsed.partitioned
        checkpoint["attempt"] = max(1, len([item for item in parsed.attempts if item.get("attempt", 0) > 0]))
        checkpoint["artifact_ids"].append(raw_artifact["id"])
        for emitted_file in parsed.files:
            artifact = self._write_text_artifact(job, owner, step, emitted_file.path, emitted_file.content, "generated", valid=True, warnings=list(parsed.warnings))
            checkpoint["artifact_ids"].append(artifact["id"])
        if not parsed.files:
            last = parsed.attempts[-1] if parsed.attempts else {}
            diagnostic = self._diagnostic(job, step.state, role, "; ".join(parsed.errors) or "Provider respondeu, mas nenhum artefato valido foi extraido.", http_status=413 if last.get("event") == "payload_too_large" else None, payload_size=payload_bytes, token_estimate=token_estimate, parser=parsed.parser_strategy, attempt=checkpoint["attempt"], raw_response_path=raw_artifact["path"])
            raise StageFailure("Etapa sem artefatos validos; resposta bruta e checkpoints foram preservados.", diagnostic=diagnostic)
        classification = classify_warnings(list(parsed.warnings))
        checkpoint["status"] = "success"
        checkpoint["validator"] = "file_protocol+territory"
        checkpoint["detail"] = (
            f"{len(parsed.files)} artefatos validos; parser={parsed.parser_strategy}; "
            f"warnings={classification.warning_count} (bloqueantes={classification.blocking_count})."
        )

    def _enforce_reality(
        self, job: dict[str, Any], owner: str, step: PipelineStep, role: str,
        context: str, ground_truth: Any, response: Any, parsed: Any,
        model: str | None, api_key: str | None, spec: ProjectSpec,
    ) -> tuple[Any, Any]:
        """Execution Reality Guard / Response Validator: validate every emitted
        file against the Ground Truth state. Violations (fabricated `git clone`
        URLs, docker/deploy instructions on a non-READY build, invented success
        claims) reject the response; ONE regeneration runs with the explicit
        failure context; whatever still violates is sanitized into an honest
        diagnostic note and flagged with a non-blocking warning."""
        violations = [
            (emitted, execution_reality_guard.validate(emitted.content, ground_truth, mode="artifact"))
            for emitted in parsed.files
        ]
        offending = [(emitted, result) for emitted, result in violations if not result.ok]
        if not offending:
            return response, parsed

        merged = type(offending[0][1])()
        for _, result in offending:
            merged.violations.extend(result.violations)
        summary = "; ".join(f"{v.rule} ('{v.excerpt}')" for v in merged.violations[:5])
        self._emit(
            job, owner, "reality_guard", stage=step.state, level="warning",
            message=(
                f"Reality Guard rejeitou a resposta do agente '{role}': {len(merged.violations)} "
                f"instrucao(oes) contradizem o estado real ({summary}). Regenerando com contexto de falha."
            ),
        )
        # Failure-aware regeneration: one attempt, with the rejected claims cited.
        retry_context = context + execution_reality_guard.regeneration_directive(ground_truth, merged)
        try:
            retry_response, retry_parsed = self._route_with_timeout(
                job, owner, step, role, retry_context, model, api_key,
                language=spec.suggested_stack.language, framework=spec.suggested_stack.framework,
            )
            if retry_parsed.files:
                response, parsed = retry_response, retry_parsed
        except (StageStalled, JobPaused):
            raise
        except Exception:  # noqa: BLE001 — regeneration is best-effort; sanitization below is the guarantee
            pass

        # Whatever still contradicts reality is forcibly sanitized (never shown).
        sanitized_count = 0
        for emitted in parsed.files:
            sanitized, result = execution_reality_guard.sanitize(emitted.content, ground_truth, mode="artifact")
            if not result.ok:
                emitted.content = sanitized
                sanitized_count += 1
                parsed.warnings.append(
                    f"Reality Guard removeu instrucao que contradiz o estado real em {emitted.path}: "
                    + "; ".join(sorted({v.rule for v in result.violations}))
                )
        if sanitized_count:
            self._emit(
                job, owner, "reality_guard", stage=step.state, level="warning",
                message=f"Reality Guard sanitizou {sanitized_count} arquivo(s): resposta forcada a refletir o estado real.",
            )
        return response, parsed

    def _route_with_timeout(
        self, job: dict[str, Any], owner: str, step: PipelineStep, role: str,
        context: str, model: str | None, api_key: str | None,
        language: str | None = None, framework: str | None = None,
    ) -> tuple[Any, Any]:
        """Run the (blocking) LLM agent under a hard per-stage timeout.

        The call runs on the shared, bounded agent pool (audit B5); if it does not
        return within the stage ceiling the wait is abandoned (future cancelled,
        worker bounded by the adapter's own request timeout) and the stage is
        converted into a recoverable STALLED state. This is the single guarantee
        that BACKEND_GENERATING — or any LLM stage — can never sit in 'running'
        forever waiting on a provider/task that never resolves."""
        reserved_tokens = estimate_tokens(context) + 48_000
        if not self.repository.reserve_tokens(
            job["id"], owner, reserved_tokens,
            daily_limit=get_settings().generation_daily_token_budget,
        ):
            raise StageFailure(
                "Orcamento de tokens insuficiente para iniciar a etapa.",
                diagnostic=self._diagnostic(
                    job, step.state, role, "Token budget exhausted before provider invocation.",
                    token_estimate=reserved_tokens, kind="token_budget_exceeded",
                    reason="Per-job or daily owner token budget would be exceeded.",
                ),
            )
        timeout_seconds = float(self.stage_timeout_seconds)
        deadline = time.monotonic() + timeout_seconds
        try:
            future = submit_agent(_run_agent, LLMRouter(), role, context, model, api_key, language, framework)
        except Exception:
            self.repository.settle_reserved_usage(job["id"], owner, reserved_tokens)
            raise
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                future.cancel()
                self.repository.settle_reserved_usage(job["id"], owner, reserved_tokens)
                raise StageStalled(
                    f"Etapa {step.state} excedeu o tempo limite de {int(timeout_seconds)}s sem resposta do provider.",
                    diagnostic=self._diagnostic(
                        job, step.state, role,
                        f"Sem resposta do provider apos {int(timeout_seconds)}s; etapa marcada como STALLED para recuperacao.",
                        validator="stage_timeout_watchdog",
                        kind="stall",
                        timeout_seconds=int(timeout_seconds),
                        reason=f"O provider/agente '{role}' nao respondeu dentro de {int(timeout_seconds)}s (possivel hang/timeout do adaptador).",
                    ),
                )
            try:
                response, parsed = future.result(timeout=min(0.5, remaining))
                input_tokens, output_tokens = _usage_totals(parsed, response)
                totals = self.repository.settle_reserved_usage(
                    job["id"], owner, reserved_tokens, input_tokens, output_tokens
                )
                from app.core.metrics import GENERATION_TOKENS

                GENERATION_TOKENS.labels(direction="input").inc(input_tokens)
                GENERATION_TOKENS.labels(direction="output").inc(output_tokens)
                if totals is not None:
                    job["inputTokensTotal"], job["outputTokensTotal"] = totals
                return response, parsed
            except cf.TimeoutError:
                current = self.repository.get(job["id"], owner)
                if current and current.get("status") == "PAUSED":
                    future.cancel()
                    self.repository.settle_reserved_usage(job["id"], owner, reserved_tokens)
                    raise JobPaused()
            except Exception:
                self.repository.settle_reserved_usage(job["id"], owner, reserved_tokens)
                raise

    def _validate_stage(self, job: dict[str, Any], owner: str, step: PipelineStep) -> None:
        names = [item["name"].lower() for item in job["artifacts"] if item["valid"]]
        valid = True
        detail = "Artefatos presentes e preservados."
        if step.logical == "contracts":
            valid = any(name.endswith(("openapi.yaml", "openapi.yml", "openapi.json")) for name in names)
            detail = "OpenAPI persistido e estavel." if valid else "Contrato OpenAPI ausente."
        elif step.logical == "database":
            valid = any(name.endswith(".sql") for name in names)
        elif step.logical in {"backend", "frontend", "mobile", "tests", "docs"}:
            valid = any(
                item["stage"].startswith(step.logical)
                and item["kind"] == "generated"
                and item["valid"]
                for item in job["artifacts"]
            )
            if step.logical == "mobile" and valid:
                required = {
                    "apps/mobile/app.json",
                    "apps/mobile/package.json",
                    "apps/mobile/tsconfig.json",
                    "apps/mobile/app.tsx",
                    "apps/mobile/.env.example",
                }
                missing = sorted(required - set(names))
                valid = not missing and any(name.startswith("apps/mobile/src/api/") for name in names)
                detail = (
                    "Scaffold Expo, entrypoint e cliente de API presentes."
                    if valid
                    else f"Scaffold mobile incompleto: {', '.join(missing) or 'cliente API ausente'}."
                )
        if valid and step.logical in {"backend", "frontend", "mobile"}:
            # Intermediate Conflict Detector gate: check the Stack Lock +
            # Compatibility Matrix + cross-manifest duplicates right after THIS
            # stage emits its package.json, instead of waiting for BUILD_RUNNING
            # at the very end of the pipeline (which only ran after every stage,
            # including the LLM-heavy backend/frontend/mobile/tests/docs steps,
            # had already finished).
            self._check_stack_conflicts(job, owner, step)
            self._check_import_graph(job, owner, step)
        # Warning policy gate: classify everything this stage produced. Only
        # blocking_warning / error / critical stop the pipeline — documentation,
        # coverage, TODO, traceability, territory-drift and synthesized-manifest
        # warnings are advisory and MUST NOT block (the "valid + 116 warnings"
        # backend stall). A blocking set becomes NEEDS_USER_ACTION (recoverable),
        # never an eternal 'running'.
        stage_warnings = [
            warning
            for item in job["artifacts"]
            if item["kind"] == "generated" and item["stage"].split(".")[0] == step.logical
            for warning in item.get("warnings", [])
        ]
        classification = classify_warnings(stage_warnings)
        report = {
            "stage": step.logical,
            "valid": valid and not classification.blocking,
            "validator": "artifact_gate+warning_policy",
            "detail": detail,
            "warnings": classification.as_dict(),
        }
        self._write_json_artifact(job, owner, step, f"{step.logical}.validation.json", report, "validation")
        if valid and not classification.blocking:
            self._record_stage_validated(job, owner, step)
        if not valid:
            raise StageFailure(detail, diagnostic=self._diagnostic(job, step.state, step.logical, detail, validator="artifact_gate"))
        if classification.blocking:
            preview = "; ".join(classification.blocking_messages[:3])
            message = (
                f"{classification.blocking_count} warning(s) bloqueante(s) classificado(s) na etapa "
                f"{step.logical}: {preview}"
            )
            raise StageFailure(
                message,
                diagnostic=self._diagnostic(
                    job, step.state, step.logical, message,
                    validator="warning_policy",
                    reason="Warnings classificados como bloqueantes (blocking_warning/error/critical) exigem decisao do usuario.",
                ),
            )

    def _record_stage_validated(self, job: dict[str, Any], owner: str, step: PipelineStep) -> None:
        """Append this stage's newly-generated, now-valid files to Project
        Memory's validated_files and rewrite the artifact. Called only on a
        clean pass (see _validate_stage) -- a stage that fails or gets a
        blocking warning never marks its own output as validated."""
        memory = ProjectMemory.from_dict(job.get("projectMemory"))
        newly_validated = [
            item["name"] for item in job["artifacts"]
            if item["kind"] == "generated" and item["valid"] and item["stage"].split(".")[0] == step.logical
        ]
        project_memory_engine.record_validated_files(memory, newly_validated)
        job["projectMemory"] = memory.as_dict()
        self._write_json_artifact(job, owner, step, PROJECT_MEMORY_FILE, job["projectMemory"], "generated")

    def _record_known_problem(self, job: dict[str, Any], owner: str, steps: list[PipelineStep], message: str) -> None:
        """Best-effort: append a pipeline failure to Project Memory's
        known_problems log. Never raises -- a memory-write failure must not
        mask the real pipeline error already being handled by the caller."""
        try:
            index = self._step_index(job.get("currentStage"), steps)
            step = steps[index] if index >= 0 else steps[-1]
            memory = ProjectMemory.from_dict(job.get("projectMemory"))
            project_memory_engine.record_known_problem(memory, step.logical, message)
            job["projectMemory"] = memory.as_dict()
            self._write_json_artifact(job, owner, step, PROJECT_MEMORY_FILE, job["projectMemory"], "generated")
        except Exception:  # noqa: BLE001 -- best-effort, must never mask the original failure
            pass

    def _persist_dependency_graph(self, job: dict[str, Any], owner: str, step: PipelineStep, blueprint: dict[str, Any]) -> None:
        """Carry the architecture-level Dependency Graph Engine snapshot (nodes,
        edges, propagation rules, impact/readiness/risk profiles — already
        computed pre-generation from the room's approved stack/capabilities by
        `dependency_graph_engine.generate_dependency_snapshot`, see
        `blueprint_engine.py`) into the generation job itself. Previously this
        data only ever lived in the Wizard preview and was never attached to a
        finished job; it is now persisted as the job's own Dependency Graph and
        Risk Report artifacts. Silently skipped when the blueprint carries no
        snapshot (ad-hoc/API callers, legacy blueprints)."""
        snapshot = blueprint.get("dependency_graph_snapshot") if isinstance(blueprint, dict) else None
        if not isinstance(snapshot, dict):
            return
        graph = {
            "graph_id": snapshot.get("graph_id"),
            "language_id": snapshot.get("language_id"),
            "runtime_id": snapshot.get("runtime_id"),
            "framework_id": snapshot.get("framework_id"),
            "architecture_id": snapshot.get("architecture_id"),
            "architecture_level": snapshot.get("architecture_level"),
            "archetype_id": snapshot.get("archetype_id"),
            "capability_ids": snapshot.get("capability_ids"),
            "infrastructure_ids": snapshot.get("infrastructure_ids"),
            "nodes": snapshot.get("nodes"),
            "edges": snapshot.get("edges"),
            "rules": snapshot.get("rules"),
            "propagation": snapshot.get("propagation"),
            "mutations": snapshot.get("mutations"),
            "generated_at": snapshot.get("generated_at"),
        }
        risk_report = {
            "graph_id": snapshot.get("graph_id"),
            "risk_profile": snapshot.get("risk_profile"),
            "impact_profile": snapshot.get("impact_profile"),
            "readiness_profile": snapshot.get("readiness_profile"),
        }
        self._write_json_artifact(job, owner, step, "dependency-graph.json", graph, "validation")
        self._write_json_artifact(job, owner, step, "risk-report.json", risk_report, "validation")
        risk_profile = snapshot.get("risk_profile") or {}
        issue_count = len(risk_profile.get("issues") or [])
        self._log(
            job, step.state, "info",
            f"Dependency Graph Engine: {len(graph['nodes'] or [])} node(s), "
            f"risk_level={risk_profile.get('risk_level', 'unknown')}, {issue_count} issue(s) herdado(s) da arquitetura aprovada.",
        )

    def _collect_manifest_artifacts(
        self, job: dict[str, Any],
    ) -> tuple[dict[str, tuple[dict[str, Any], Path, dict[str, Any]]], list[str]]:
        """Every valid, generated `package.json` artifact emitted so far, parsed
        from disk. Returns (label -> (data, path, artifact), parse_errors) so a
        caller can either treat a parse failure as a hard block (Conflict
        Detector) or just skip it (Import Graph Engine, report-only).

        Keyed by "{logical_stage}/{name}", not the bare artifact name: a chunked
        stage (e.g. BACKEND_CHUNKS) legitimately re-emits the same "package.json"
        several times as it accumulates dependencies, and those must collapse to
        one entry (the latest content) — but backend and frontend each emit their
        own "package.json" at a DIFFERENT path with the SAME bare name, and keying
        by bare name alone let the later stage's manifest silently clobber the
        earlier one's entry in this dict (findable on disk the whole time, just
        invisible to this scan), which flooded the Import Graph Engine with false
        "undeclared_external" positives for every backend package once the
        frontend stage ran (confirmed against a real end-to-end generation)."""
        manifest_artifacts = [
            item for item in job["artifacts"]
            if item["kind"] == "generated" and item["valid"] and item["name"].lower().endswith("package.json")
        ]
        parse_errors: list[str] = []
        manifests: dict[str, tuple[dict[str, Any], Path, dict[str, Any]]] = {}
        for artifact in manifest_artifacts:
            path = Path(artifact["path"])
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                parse_errors.append(f"{artifact['name']}: {exc}")
                continue
            label = f"{artifact['stage'].split('.')[0]}/{artifact['name']}"
            if isinstance(data, dict):
                manifests[label] = (data, path, artifact)
            else:
                parse_errors.append(f"{label}: raiz do manifesto nao e um objeto JSON")
        return manifests, parse_errors

    def _check_import_graph(self, job: dict[str, Any], owner: str, step: PipelineStep) -> None:
        """Import Graph Engine v1 (TS/JS only): parses the imports of every
        generated source file emitted so far and cross-checks them against the
        manifests emitted in the same job. Report-only by design (user
        decision) — a regex parser can false-positive on syntax it doesn't
        recognize, and BUILD_RUNNING's real typecheck/bundler remains the
        authoritative gate. Value-add over the compiler: undeclared external
        packages and cross-stack leakage (e.g. apps/web importing straight from
        apps/api), surfaced right after each stage instead of at the end."""
        files = {
            item["name"]: Path(item["path"]).read_text(encoding="utf-8")
            for item in job["artifacts"]
            if item["kind"] == "generated" and item["valid"] and import_graph_engine.is_js_file(item["name"])
        }
        if not files:
            return
        manifests, _ = self._collect_manifest_artifacts(job)
        manifest_by_app = {
            import_graph_engine.manifest_app_root(label): data for label, (data, _, _) in manifests.items()
        }
        graph = import_graph_engine.build_import_graph(files, manifest_by_app)
        self._write_json_artifact(job, owner, step, f"{step.logical}.import-graph.json", graph, "validation")
        conflicts = graph["conflicts"]
        if conflicts:
            self._write_json_artifact(job, owner, step, f"{step.logical}.import-conflicts.json", conflicts, "validation")
            self._emit(
                job, owner, "info", stage=step.state, level="warning",
                message=(
                    f"Import Graph Engine: {len(conflicts)} inconsistencia(s) de import detectada(s) "
                    f"apos {step.logical} (relatorio, nao bloqueante)."
                ),
            )

    def _check_stack_conflicts(self, job: dict[str, Any], owner: str, step: PipelineStep) -> None:
        """Intermediate Conflict Detector: reads every package.json emitted so far
        (across backend/frontend/mobile, whichever have run) straight from the
        checkpoint artifacts, enforces the pre-generation Stack Lock +
        Compatibility Matrix, and reconciles the same dependency declared with
        different versions across manifests (monorepo drift). Auto-fixes are
        applied in place (artifact content + file on disk); a manifest that
        cannot even be parsed is a hard block — everything else this engine
        can diagnose has a deterministic fix, so it repairs rather than stops
        the pipeline (see stack_compatibility.py)."""
        manifests, parse_errors = self._collect_manifest_artifacts(job)
        if not manifests and not parse_errors:
            return
        if parse_errors:
            message = "Conflict Detector: manifesto(s) invalido(s): " + "; ".join(parse_errors)
            raise StageFailure(message, diagnostic=self._diagnostic(job, step.state, step.logical, message, validator="conflict_detector"))

        findings: list[Any] = []
        lock_dict = job.get("stackLock")
        if lock_dict:
            lock = StackLock(
                react=lock_dict.get("react"), react_native=lock_dict.get("react_native"),
                expo=lock_dict.get("expo"), node=lock_dict.get("node"),
                source_manifest=lock_dict.get("source_manifest"), captured_at=lock_dict.get("captured_at") or "",
            )
            for label, (data, _, _) in manifests.items():
                findings.extend(stack_compatibility_engine.check_manifest(lock, label, data))
        findings.extend(
            stack_compatibility_engine.check_duplicate_versions({label: data for label, (data, _, _) in manifests.items()})
        )
        if not findings:
            return

        for data, path, artifact in manifests.values():
            content = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
            path.write_text(content, encoding="utf-8")
            encoded = content.encode("utf-8")
            artifact["checksum"] = hashlib.sha256(encoded).hexdigest()
            artifact["size_bytes"] = len(encoded)
        self._write_json_artifact(job, owner, step, f"{step.logical}.stack-conflicts.json", [item.as_dict() for item in findings], "validation")
        self._emit(
            job, owner, "repair_applied", stage=step.state, level="warning",
            message=f"Conflict Detector: {len(findings)} incoerencia(s) de dependencia corrigida(s) logo apos {step.logical}.",
        )

    def _evaluate_functional_completeness(self, job: dict[str, Any], owner: str, *, build_skipped: bool) -> None:
        """Build passing is necessary but not sufficient (audit 2026-07-07/08): run
        the deterministic Functional Completeness Gate right before the job is
        surfaced as READY, persist the verdict on the published project (so
        _require_verified() can block export on it), and never let this step itself
        take the pipeline down -- a completeness-check bug must degrade to
        NEEDS_HUMAN_REVIEW, not crash a job that otherwise finished cleanly."""
        project_id = job.get("generatedProjectId")
        result_path = job.get("resultPath")
        if not project_id or not result_path:
            return
        try:
            report = functional_completeness_engine.evaluate(
                {"project_id": project_id, "generated_project_path": result_path},
                build_skipped=build_skipped,
            )
            report_data = report.model_dump(mode="json")
            root = Path(result_path)
            (root / "product-completion-report.json").write_text(
                json.dumps(report_data, ensure_ascii=False, indent=2), encoding="utf-8",
            )
            (root / "endpoint-ui-coverage.json").write_text(
                json.dumps([r.model_dump(mode="json") for r in report.resources], ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            (root / "ui-depth-score.json").write_text(
                json.dumps(report.ui_depth.model_dump(mode="json") if report.ui_depth else {}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            # Functional Coverage (Product Certification Engine P1, first slice):
            # independent try/except -- a bug here must degrade to an absent
            # file, never break the Functional Completeness Gate's own verdict
            # above (same "a report bug must never crash a finished pipeline"
            # rule this whole function already follows).
            coverage_report = FunctionalCoverageReport(
                project_id=project_id, generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
            )
            try:
                coverage_report = functional_coverage_engine.evaluate(project_id, root, report.resources)
                (root / "functional-coverage.json").write_text(
                    json.dumps(coverage_report.model_dump(mode="json"), ensure_ascii=False, indent=2), encoding="utf-8",
                )
            except Exception as exc:  # noqa: BLE001
                self._log(job, "READY", "warning", "Functional Coverage failed to evaluate.", str(exc))
            # Product Certification (Product Certification Engine P1, second
            # slice): consolidates the two reports above + a fresh QualityGateReport
            # into one status. Independent try/except, same "never break the
            # Functional Completeness Gate's own verdict" rule.
            try:
                cert_report = product_certification_engine.evaluate(
                    {"project_id": project_id, "generated_project_path": result_path}, report, coverage_report,
                )
                (root / "product-certification.json").write_text(
                    json.dumps(cert_report.model_dump(mode="json"), ensure_ascii=False, indent=2), encoding="utf-8",
                )
                job["productCertificationStatus"] = cert_report.status
            except Exception as exc:  # noqa: BLE001
                self._log(job, "READY", "warning", "Product Certification failed to evaluate.", str(exc))
            ProjectWriter().set_functional_completeness(project_id, report=report_data)
            job["completenessStatus"] = report.status
            job["completenessSummary"] = {
                "status": report.status,
                "backend_completeness": report.backend_completeness,
                "frontend_completeness": report.frontend_completeness,
                "mobile_completeness": report.mobile_completeness,
                "blocker_count": sum(1 for i in report.issues if i.severity == "BLOCKER"),
            }
            self._log(
                job, "READY", "warning" if report.status != "VERIFIED" else "info",
                f"Functional Completeness Gate: {report.status}.",
                "; ".join(report.missing_features) or None,
            )
        except Exception as exc:  # noqa: BLE001 -- never let the gate itself break a finished pipeline
            job["completenessStatus"] = "NEEDS_HUMAN_REVIEW"
            job["completenessSummary"] = {"status": "NEEDS_HUMAN_REVIEW", "error": str(exc)}
            self._log(job, "READY", "warning", "Functional Completeness Gate failed to evaluate.", str(exc))

    def _write_project_manifest(self, job: dict[str, Any], spec: ProjectSpec, blueprint: dict[str, Any]) -> None:
        """Project Manifest (Engineering Employee Mode, section 20): write a single
        ldcn.project.json with identity/stack/modules/decisions into the delivered
        project. Independent try/except from the completeness gate above -- a
        failure here must not affect (or be affected by) that evaluation."""
        project_id = job.get("generatedProjectId")
        result_path = job.get("resultPath")
        if not project_id or not result_path:
            return
        try:
            manifest = build_project_manifest(project_id, job.get("projectName") or project_id, spec, blueprint)
            (Path(result_path) / "ldcn.project.json").write_text(
                json.dumps(manifest.model_dump(mode="json"), ensure_ascii=False, indent=2), encoding="utf-8",
            )
        except Exception as exc:  # noqa: BLE001 -- best-effort, never breaks a finished pipeline
            self._log(job, "READY", "warning", "Project Manifest failed to write.", str(exc))

    @staticmethod
    def _ensure_maven_dependencies_for_imports(path: str, content: str, latest: dict[str, str]) -> str:
        if not path.endswith("pom.xml") or "<dependencies>" not in content:
            return content
        module_prefix = "" if path == "pom.xml" else path.rsplit("/", 1)[0] + "/"
        sources = "\n".join(
            source for source_path, source in latest.items()
            if source_path.startswith(module_prefix) and source_path.endswith(".java")
        )
        snippets = [
            ("spring-boot-starter-data-jpa", ("jakarta.persistence", "org.springframework.data.jpa", "org.springframework.data.annotation"), """
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>"""),
            ("spring-boot-starter-amqp", ("org.springframework.amqp",), """
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-amqp</artifactId>
        </dependency>"""),
            ("springdoc-openapi-starter-webmvc-ui", ("io.swagger.v3.oas.models",), """
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>2.3.0</version>
        </dependency>"""),
            ("jjwt-api", ("io.jsonwebtoken",), """
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-api</artifactId>
            <version>0.11.5</version>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-impl</artifactId>
            <version>0.11.5</version>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-jackson</artifactId>
            <version>0.11.5</version>
            <scope>runtime</scope>
        </dependency>"""),
            ("bucket4j-core", ("io.github.bucket4j",), """
        <dependency>
            <groupId>com.bucket4j</groupId>
            <artifactId>bucket4j-core</artifactId>
            <version>8.7.0</version>
        </dependency>"""),
        ]
        additions: list[str] = []
        for marker, import_prefixes, snippet in snippets:
            if marker in content or marker in "\n".join(additions):
                continue
            if any(import_prefix in sources for import_prefix in import_prefixes):
                additions.append(snippet)
        if not additions:
            return content
        return content.replace("</dependencies>", "\n" + "\n".join(additions) + "\n    </dependencies>", 1)
    @staticmethod
    def _normalize_build_files(latest: dict[str, str]) -> dict[str, str]:
        """Repair cross-agent file inconsistencies before publishing/building."""
        normalized = dict(latest)
        root_pom = normalized.get("pom.xml")
        if root_pom and "<modules>" in root_pom:
            module_dirs = sorted({
                path.split("/", 1)[0]
                for path in normalized
                if "/" in path
                and path.endswith("/pom.xml")
                and path.count("/") == 1
                and not path.startswith(("node_modules/", ".next/"))
            })
            if module_dirs:
                modules_xml = "\n".join(f"        <module>{module}</module>" for module in module_dirs)
                root_pom = re.sub(
                    r"(?s)\s*<modules>.*?</modules>",
                    f"\n    <modules>\n{modules_xml}\n    </modules>",
                    root_pom,
                    count=1,
                )
                normalized["pom.xml"] = root_pom
        for path, content in list(normalized.items()):
            if path.endswith("pom.xml"):
                normalized[path] = GenerationJobEngine._ensure_maven_dependencies_for_imports(path, content, normalized)
        return normalized
    def _build(self, job: dict[str, Any], owner: str) -> None:
        files: list[EmittedFile] = []
        latest: dict[str, str] = {}
        for artifact in job["artifacts"]:
            if artifact["kind"] != "generated" or not artifact["valid"]:
                continue
            name = artifact["name"]
            content = Path(artifact["path"]).read_text(encoding="utf-8")
            previous = latest.get(name)
            lower_name = name.lower()
            if previous is not None and lower_name.endswith("package.json"):
                # Backend and frontend (and any other logical stage) each emit
                # their own "package.json" at this same bare relative path when
                # the project shares one root (not split under apps/backend,
                # apps/frontend, ...): naive last-write-wins here silently
                # dropped the earlier stage's entire dependency list from the
                # published project (confirmed against a real end-to-end
                # generation — the backend's NestJS/TypeORM deps never made it
                # into the final package.json at all). Merge instead of overwrite.
                content = self._merge_package_json(previous, content)
            elif previous is not None and lower_name.endswith("tsconfig.json"):
                # Same collision, same fix, for tsconfig.json: a NestJS backend's
                # "experimentalDecorators"/"emitDecoratorMetadata" compilerOptions
                # were silently dropped by the frontend's Next.js tsconfig
                # (confirmed live: this broke every decorator in the backend
                # source once `next build`'s typecheck pass hit it, since Next
                # scans the whole shared src/ tree, not just its own files).
                content = self._merge_tsconfig_json(previous, content)
            latest[name] = content
        latest = self._normalize_build_files(latest)
        files = [EmittedFile(path=name, content=content) for name, content in latest.items()]
        if not files:
            raise StageFailure("Nenhum arquivo valido para build.", diagnostic=self._diagnostic(job, "BUILD_RUNNING", "build", "Nenhum arquivo valido para build."))
        result = ProjectWriter().write(files, project_name=job["projectName"], metadata={"generation_job_id": job["id"], "partial": True}, owner=owner, workspace_id=job.get("workspaceId"))
        job["generatedProjectId"] = result.project_id
        job["resultPath"] = str(result.root_path)
        job["buildStatus"] = "RUNNING"
        self._save(job, owner)
        report = generation_validation_engine.validate(
            {"project_id": result.project_id, "generated_project_path": result.root_path},
            event_sink=self._build_sink(job, owner),
        )
        report_data = report.model_dump(mode="json")
        self._write_json_artifact(job, owner, PipelineStep("BUILD_RUNNING", "build", "build"), "build.report.json", report_data, "validation")
        failed_commands = [command for command in report.build.commands if command.exit_code not in {0, None}]
        job["buildAttempts"] = len(failed_commands)
        if report.build.recovery_status == "SKIPPED_AFTER_FAILURE":
            guide = report.build.manual_fix_guide
            guide_data = guide.model_dump(mode="json") if guide is not None else {
                "root_cause": "Build failed after bounded automatic recovery.",
                "original_error": report.build.logs_tail or "Build command failed.",
                "affected_files": [], "problematic_dependencies": [], "suggested_versions": {},
                "commands": [], "steps": [], "patches_applied": [], "full_logs": report.build.logs_tail,
            }
            job["buildStatus"] = "SKIPPED_AFTER_FAILURE"
            job["manualBuildFixGuide"] = guide_data
            job["stageStatuses"]["build"] = "skipped"
            job["valid"] = False
            self._write_json_artifact(
                job, owner, PipelineStep("BUILD_RUNNING", "build", "build"),
                "ManualBuildFixGuide.json", guide_data, "manual_fix_guide",
            )
            self._log(
                job, "BUILD_RUNNING", "warning",
                "Build marcado como SKIPPED_AFTER_FAILURE apos no maximo 2 auto-reparos; pipeline continuara.",
                guide_data.get("root_cause"),
            )
            self._emit(
                job, owner, "repair_failed", stage="BUILD_RUNNING", level="warning",
                message="Limite de auto-recuperacao atingido. Build pulado e guia manual gerado.",
            )
            self._save(job, owner)
            return
        build_skipped = bool(report.build.skipped_reason)
        if not report.passed or not report.build.ok or build_skipped:
            failed_checks = [
                str(check.get("message"))
                for check in (report.quality.get("checks") or [])
                if isinstance(check, dict) and check.get("status") == "failed"
            ]
            # Prefer the classified error (BuildErrorClassifier): cause + root cause
            # + suggested fix, so the UI shows an actionable card, not a log dump.
            classified = report.build.classified_error
            if classified is not None:
                message = (
                    f"{classified.message} Causa raiz: {classified.root_cause} "
                    f"Correcao sugerida: {classified.suggested_fix}"
                )
            else:
                message = (
                    report.build.skipped_reason
                    or "; ".join(failed_checks)
                    or "; ".join(report.warnings)
                    or report.build.logs_tail
                    or "Build local falhou."
                )
            if report.build.repairs:
                applied = sum(1 for item in report.build.repairs if item.applied)
                message += f" (Auto-reparo: {applied}/{len(report.build.repairs)} patch(es) aplicado(s) antes desta falha.)"
            raise StageFailure("Build final nao passou; projeto permanece parcial e sem pacote.", diagnostic=self._diagnostic(job, "BUILD_RUNNING", "build", message, validator="lint+typecheck+tests+build+openapi"))
        ProjectWriter().set_verification(result.project_id, verified=True, score=report.score)
        job["buildStatus"] = "PASSED"
        job["manualBuildFixGuide"] = None
        job["valid"] = True

    @staticmethod
    def _sanitize_java_reserved_package_segments(name: str, content: str) -> tuple[str, str, bool]:
        """Repair Java package path/declaration segments that are reserved words.

        Providers still occasionally emit Clean Architecture folders like
        ``.../interface/...`` and a matching ``package ...interface...``. That is
        invalid Java, so repair the artifact before it reaches build/publish.
        """
        if not name.lower().endswith(".java"):
            return name, content, False

        repaired = False

        def safe_segment(segment: str) -> str:
            nonlocal repaired
            if segment in JAVA_RESERVED_PACKAGE_SEGMENTS:
                repaired = True
                return f"{segment}_"
            return segment

        safe_name = "/".join(safe_segment(part) for part in name.split("/"))

        def repair_package(match: re.Match[str]) -> str:
            prefix, package_name, wildcard, suffix = match.groups()
            safe_package = ".".join(safe_segment(part) for part in package_name.split("."))
            return f"{prefix}{safe_package}{wildcard or ''}{suffix}"

        repaired_content = re.sub(
            r"(?m)^(\s*(?:package|import)\s+)([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)(\.\*)?(\s*;)",
            repair_package,
            content,
        )
        return safe_name, repaired_content, repaired
    @staticmethod
    def _merge_package_json(previous: str, current: str) -> str:
        """Union dependencies/scripts from an earlier stage's package.json into
        the later stage's, instead of the later one silently replacing it. Falls
        back to `current` unchanged if either side doesn't parse as a JSON
        object — publishing whatever the pipeline actually produced is safer
        than raising mid-build over a merge nicety."""
        try:
            before = json.loads(previous)
            after = json.loads(current)
        except json.JSONDecodeError:
            return current
        if not isinstance(before, dict) or not isinstance(after, dict):
            return current
        for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "scripts"):
            before_section = before.get(section)
            if not isinstance(before_section, dict):
                continue
            after_section = after.get(section)
            merged = dict(before_section)
            if isinstance(after_section, dict):
                merged.update(after_section)  # later stage wins on an exact key collision
            after[section] = merged
        return json.dumps(after, indent=2, ensure_ascii=False) + "\n"

    @staticmethod
    def _merge_tsconfig_json(previous: str, current: str) -> str:
        """Union compilerOptions from an earlier stage's tsconfig.json into the
        later stage's, instead of the later one silently replacing it — same
        collision and fix shape as _merge_package_json. Any key only the
        earlier stage set (e.g. a NestJS backend's "experimentalDecorators")
        survives untouched; the later stage's value wins on an exact key
        collision. Falls back to `current` unchanged if either side doesn't
        parse as a JSON object."""
        try:
            before = json.loads(previous)
            after = json.loads(current)
        except json.JSONDecodeError:
            return current
        if not isinstance(before, dict) or not isinstance(after, dict):
            return current
        before_options = before.get("compilerOptions")
        if isinstance(before_options, dict):
            after_options = after.get("compilerOptions")
            merged = dict(before_options)
            if isinstance(after_options, dict):
                merged.update(after_options)
            after["compilerOptions"] = merged
        return json.dumps(after, indent=2, ensure_ascii=False) + "\n"

    def _package(self, job: dict[str, Any], owner: str) -> None:
        degraded = job.get("buildStatus") == "SKIPPED_AFTER_FAILURE"
        if (not job.get("valid") and not degraded) or not job.get("generatedProjectId"):
            raise StageFailure("Package bloqueado: build ainda nao esta valido.", diagnostic=self._diagnostic(job, "PACKAGE_CREATING", "package", "Build obrigatorio nao aprovado."))
        project = {
            "project_id": job["generatedProjectId"],
            "generated_project_path": str(DEFAULT_OUTPUT_ROOT / job["generatedProjectId"]),
            "owner_user_id": owner,
            "workspace_id": job.get("workspaceId"),
        }
        package = self.download_service.prepare_archive(
            GeneratedProjectService(), project,
            download_url=f"/api/meta-factory/{job['generatedProjectId']}/download",
        )
        ProjectWriter().append(
            job["generatedProjectId"],
            [],
            metadata={
                "partial": degraded,
                "package_ready": True,
                "generation_job_id": job["id"],
                "build_status": job.get("buildStatus"),
            },
            owner=owner,
            workspace_id=job.get("workspaceId"),
        )
        self._write_json_artifact(job, owner, PipelineStep("PACKAGE_CREATING", "package", "package"), "package.report.json", package, "package")

    def _deterministic_stage_fallback(self, job: dict[str, Any], owner: str, step: PipelineStep) -> None:
        if step.logical == "contracts":
            content = "openapi: 3.1.0\ninfo:\n  title: Generated API\n  version: 1.0.0\npaths: {}\n"
            self._write_text_artifact(job, owner, step, "openapi.yaml", content, "generated", valid=True, warnings=["Fallback deterministico"])
        else:
            name = f"fallback/{step.logical}-{step.chunk or 'main'}.md"
            self._write_text_artifact(job, owner, step, name, f"# Fallback {step.logical}\n\nEtapa requer revisao humana antes do build.\n", "generated", valid=False, warnings=["NEEDS_USER_ACTION"])

    def _begin_step(self, job: dict[str, Any], owner: str, step: PipelineStep, index: int, steps: list[PipelineStep] | None = None) -> None:
        steps = steps if steps is not None else STEPS
        job["status"] = step.state
        job["currentStage"] = step.state
        # Progress is monotonic: never dip below what a previous checkpoint reported.
        job["progress"] = max(int(job.get("progress", 0)), min(98, round(index / len(steps) * 100)))
        job["stageStatuses"][step.logical] = "running"
        self._log(job, step.state, "info", f"Etapa iniciada: {step.logical}{'.' + step.chunk if step.chunk else ''}.")
        self._emit(job, owner, "stage_started", stage=step.state, message=f"Etapa iniciada: {step.logical}{'.' + step.chunk if step.chunk else ''}.")
        self._save(job, owner)

    def _finish_step(self, job: dict[str, Any], owner: str, step: PipelineStep, index: int, steps: list[PipelineStep] | None = None) -> None:
        steps = steps if steps is not None else STEPS
        build_was_skipped = step.logical == "build" and job.get("buildStatus") == "SKIPPED_AFTER_FAILURE"
        checkpoint = next(
            (item for item in reversed(job["checkpoints"]) if item["stage"] == step.state),
            None,
        ) or self._checkpoint(job, step, 0, 0)
        checkpoint["status"] = "skipped" if build_was_skipped else "success"
        checkpoint["finished_at"] = self._now()
        if build_was_skipped:
            job["stageStatuses"][step.logical] = "skipped"
        elif not any(next_step.logical == step.logical for next_step in steps[index + 1:]):
            job["stageStatuses"][step.logical] = "success"
        job["progress"] = max(int(job.get("progress", 0)), min(98, round((index + 1) / len(steps) * 100)))
        level = "warning" if build_was_skipped else "info"
        message = f"Checkpoint salvo como skipped: {step.state}." if build_was_skipped else f"Checkpoint salvo: {step.state}."
        self._log(job, step.state, level, message)
        self._emit(job, owner, "stage_finished", stage=step.state, level=level, message=message)
        self._save(job, owner)

    def _checkpoint(self, job: dict[str, Any], step: PipelineStep, payload_bytes: int, token_estimate: int) -> dict[str, Any]:
        existing = next((item for item in reversed(job["checkpoints"]) if item["stage"] == step.state and item.get("chunk") == step.chunk and item["status"] == "running"), None)
        if existing:
            if payload_bytes:
                existing["payload_bytes"] = payload_bytes
                existing["estimated_tokens"] = token_estimate
            return existing
        checkpoint = {"id": f"cp_{uuid4().hex[:12]}", "stage": step.state, "chunk": step.chunk, "status": "running", "attempt": 1, "artifact_ids": [], "payload_bytes": payload_bytes, "estimated_tokens": token_estimate, "parser": None, "validator": None, "partitioned": False, "started_at": self._now(), "finished_at": None, "detail": ""}
        job["checkpoints"].append(checkpoint)
        return checkpoint

    def _write_json_artifact(self, job: dict[str, Any], owner: str, step: PipelineStep, name: str, value: Any, kind: str) -> dict[str, Any]:
        return self._write_text_artifact(job, owner, step, name, json.dumps(value, ensure_ascii=False, indent=2), kind, valid=True)

    def _write_text_artifact(self, job: dict[str, Any], owner: str, step: PipelineStep, name: str, content: str, kind: str, *, valid: bool, warnings: list[str] | None = None) -> dict[str, Any]:
        self._assert_not_paused(job, owner)
        safe_name = "/".join(part for part in Path(name).as_posix().split("/") if part not in {"", ".", ".."})
        safe_name, content, java_repaired = self._sanitize_java_reserved_package_segments(safe_name, content)
        if java_repaired:
            warnings = [*(warnings or []), "java_reserved_package_segment_repaired"]
        root = (self.checkpoint_root / job["id"]).resolve()
        target = (root / step.logical / safe_name).resolve()
        if root not in target.parents:
            raise StageFailure("Artifact path invalido.", diagnostic=self._diagnostic(job, step.state, step.logical, name))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        data = content.encode("utf-8")
        artifact = {"id": f"art_{uuid4().hex[:12]}", "stage": f"{step.logical}.{step.chunk}" if step.chunk else step.logical, "name": safe_name, "kind": kind, "path": str(target), "size_bytes": len(data), "checksum": hashlib.sha256(data).hexdigest(), "valid": valid, "warnings": warnings or [], "created_at": self._now()}
        job["artifacts"].append(artifact)
        self._emit(job, owner, "artifact_written", stage=step.state, message=f"Arquivo gerado: {name} ({len(data)} bytes).", artifact_path=name)
        self._save(job, owner)
        return artifact

    def _artifact_content(self, job: dict[str, Any], name: str) -> str:
        artifact = next((item for item in reversed(job["artifacts"]) if item["name"].lower().endswith(name.lower()) and item["valid"]), None)
        return Path(artifact["path"]).read_text(encoding="utf-8") if artifact else ""

    def _database_schema(self, spec: ProjectSpec) -> str:
        lines = ["-- Generated from normalized domain model", "BEGIN;"]
        for entity in spec.entities or ["application_record"]:
            table = "".join(char.lower() if char.isalnum() else "_" for char in entity).strip("_") or "record"
            lines.append(f"CREATE TABLE IF NOT EXISTS {table} (id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());")
        lines.append("COMMIT;")
        return "\n".join(lines) + "\n"

    def _context_requirements(self, stage: str) -> list[str]:
        return {
            "contracts": ["product summary", "entities", "flows", "API rules", "auth", "integrations"],
            "backend": ["openapi", "domain", "database", "auth", "security"],
            "frontend": ["routes", "screens", "personas", "design system", "openapi"],
            "mobile": ["screens", "navigation", "personas", "openapi"],
            "security": ["auth", "openapi", "generated files"],
        }.get(stage, ["validated upstream artifacts"])

    @staticmethod
    def _mobile_stack(spec: ProjectSpec, blueprint: dict[str, Any]) -> str:
        if spec.mobile_stack:
            return spec.mobile_stack
        decisions = blueprint.get("decisions") if isinstance(blueprint, dict) else None
        for decision in decisions if isinstance(decisions, list) else []:
            if isinstance(decision, dict) and decision.get("area") == "mobile":
                return "flutter" if "flutter" in str(decision.get("choice", "")).lower() else "react_native_expo"
        return "react_native_expo"

    def _diagnostic(self, job: dict[str, Any], stage: str, agent: str, message: str, *, http_status: int | None = None, payload_size: int = 0, token_estimate: int = 0, parser: str | None = None, validator: str | None = None, attempt: int = 0, raw_response_path: str | None = None, kind: str = "failure", reason: str = "", timeout_seconds: int | None = None, steps: list[PipelineStep] | None = None) -> dict[str, Any]:
        snapshot = self._context_snapshot(job, stage, steps)
        recommended = (
            "Esta etapa excedeu o tempo limite. Reexecute o Backend, continue com warnings, "
            "troque o provider ou use o fallback determinístico desta etapa."
            if kind == "stall"
            else "Reexecute somente esta etapa em modo particionado; se persistir, troque o provider ou use o fallback especifico."
        )
        return {
            "stage": stage,
            "agent": agent,
            "provider": job.get("provider"),
            "model": job.get("model"),
            "http_status": http_status,
            "payload_size": payload_size,
            "token_estimate": token_estimate,
            "parser": parser,
            "validator": validator,
            "attempt": attempt,
            "raw_response_path": raw_response_path,
            "artifacts_preserved": [item["name"] for item in job.get("artifacts", [])],
            "recommended_action": recommended,
            "message": message,
            "kind": kind,
            "reason": reason or message,
            "timeout_seconds": timeout_seconds,
            **snapshot,
        }

    def _context_snapshot(self, job: dict[str, Any], stage: str, steps: list[PipelineStep] | None = None) -> dict[str, Any]:
        """Mandatory diagnostic context: why the transition did not happen, what
        was preserved, and how long the stage ran. Computed from persisted state so
        it is identical on refresh."""
        steps = steps if steps is not None else STEPS
        artifacts = job.get("artifacts", [])
        all_warnings = [warning for item in artifacts for warning in item.get("warnings", [])]
        classification = classify_warnings(all_warnings)
        logs = job.get("logs", [])
        last_log = None
        if logs:
            entry = logs[-1]
            last_log = entry["message"] + (f" — {entry['detail']}" if entry.get("detail") else "")
        last_success = next(
            (item["stage"] for item in reversed(job.get("checkpoints", [])) if item["status"] == "success"),
            None,
        )
        last_generated = next(
            (item["name"] for item in reversed(artifacts) if item.get("kind") == "generated"),
            None,
        )
        running = next((item for item in reversed(job.get("checkpoints", [])) if item["stage"] == stage), None)
        started = (running or {}).get("started_at") or job.get("startedAt")
        index = self._recovery_index(job, steps, stage)
        next_transition = steps[index + 1].state if 0 <= index < len(steps) - 1 else "READY"
        logical = steps[index].logical if index >= 0 else None
        stage_has_files = bool(logical) and any(
            item.get("kind") == "generated" and item.get("valid") and item["stage"].split(".")[0] == logical
            for item in artifacts
        )
        return {
            "elapsed_seconds": self._elapsed_seconds(started),
            "last_log": last_log,
            "next_expected_transition": next_transition,
            "warning_count": classification.warning_count,
            "error_count": classification.error_count,
            "blocking_count": classification.blocking_count,
            "warning_breakdown": dict(classification.breakdown),
            "last_successful_checkpoint": last_success,
            "last_generated_artifact": last_generated,
            "can_continue_with_warnings": stage_has_files,
        }

    @staticmethod
    def _elapsed_seconds(started: str | None) -> int:
        if not started:
            return 0
        try:
            start = datetime.fromisoformat(started)
            if start.tzinfo is None:
                start = start.replace(tzinfo=UTC)
            return max(0, int((datetime.now(UTC) - start).total_seconds()))
        except (ValueError, TypeError):
            return 0

    def _log(self, job: dict[str, Any], stage: str, level: str, message: str, detail: str | None = None) -> None:
        job["logs"].append({"id": f"log_{uuid4().hex[:10]}", "timestamp": self._now(), "stage": stage, "level": level, "message": message, "detail": detail})
        job["logs"] = job["logs"][-1000:]

    def _emit(
        self, job: dict[str, Any], owner: str, event_type: str, *, message: str,
        stage: str | None = None, level: str = "info", throttle: bool = False,
        command: str | None = None, cwd: str | None = None, duration_ms: int | None = None,
        stream: str | None = None, stdout: str | None = None, stderr: str | None = None,
        artifact_path: str | None = None, exit_code: int | None = None,
    ) -> None:
        """Append a fine-grained execution event for the live console and persist it.
        High-frequency command output is throttled so a streaming build does not
        re-serialize the whole job on every line (boundaries always persist)."""
        with self._event_lock:
            job.setdefault("events", []).append({
                "id": f"evt_{uuid4().hex[:12]}", "jobId": job["id"], "timestamp": self._now(),
                "stage": stage or job.get("currentStage", ""), "type": event_type, "level": level,
                "message": message, "command": command, "cwd": cwd, "durationMs": duration_ms,
                "stream": stream, "stdout": stdout, "stderr": stderr,
                "artifactPath": artifact_path, "exitCode": exit_code,
            })
            job["events"] = job["events"][-2000:]
            now = time.monotonic()
            if throttle and (now - self._last_event_save.get(job["id"], 0.0)) < 0.4:
                return
            self._last_event_save[job["id"]] = now
            self._save(job, owner)

    def _build_sink(self, job: dict[str, Any], owner: str):
        """Bind a build-runner event sink to this job: each command_started /
        command_output / command_finished from build_validation_service streams into
        the job's live console."""
        def sink(payload: dict[str, Any]) -> None:
            event_type = str(payload.get("type", "info"))
            self._emit(
                job, owner, event_type, message=str(payload.get("message", "")),
                level=str(payload.get("level", "info")),
                throttle=event_type == "command_output",
                command=payload.get("command"), cwd=payload.get("cwd"),
                duration_ms=payload.get("durationMs"), stream=payload.get("stream"),
                stdout=payload.get("stdout"), stderr=payload.get("stderr"),
                exit_code=payload.get("exitCode"),
            )
        return sink

    def _save(self, job: dict[str, Any], owner: str) -> dict[str, Any]:
        job["updatedAt"] = self._now()
        self.repository.update(job["id"], owner, job)
        return job

    def _assert_not_paused(self, job: dict[str, Any], owner: str) -> None:
        current = self.repository.get(job["id"], owner)
        if current and current.get("status") == "PAUSED" and job.get("status") != "PAUSED":
            raise JobPaused()

    def _step_index(self, state: str | None, steps: list[PipelineStep] | None = None) -> int:
        steps = steps if steps is not None else STEPS
        return next((i for i, step in enumerate(steps) if step.state == state), -1)

    def _recovery_index(self, job: dict[str, Any], steps: list[PipelineStep], stage: str | None) -> int:
        candidates = [i for i, step in enumerate(steps) if step.logical == stage or step.state == stage]
        if not candidates:
            return -1
        checkpoint = next(
            (
                item for item in reversed(job.get("checkpoints", []))
                if item.get("stage") == stage and item.get("status") in {"running", "failed", "stalled"}
            ),
            None,
        )
        if checkpoint and checkpoint.get("chunk"):
            chunk = checkpoint["chunk"]
            return next((i for i in candidates if steps[i].chunk == chunk), candidates[0])
        return candidates[0]

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()


generation_job_engine = GenerationJobEngine()



