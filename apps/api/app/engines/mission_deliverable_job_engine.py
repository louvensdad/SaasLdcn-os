from __future__ import annotations

import threading
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from app.engines.mission_artifact_engine import draft_artifact
from app.repositories.mission_deliverable_job_repository import MissionDeliverableJobRepository
from app.repositories.mission_repository import MissionRepository
from app.services.mission_service import MissionService

STALE_HEARTBEAT_SECONDS = 120
NON_TERMINAL_STATUSES = ("QUEUED", "ANSWERS_LOADING", "DRAFTING", "PERSISTING")
# DRAFTS_READY is a terminal *stream* state (nothing more happens until an
# explicit confirm/retry/cancel call) but not a terminal *job* state -- it is
# intentionally excluded from NON_TERMINAL_STATUSES (nothing to reconcile,
# nothing to auto-restart) and from the SSE route's TERMINAL set (the stream
# ends there too, since drafts are ready to review).


class MissionDeliverableJobEngine:
    """Wraps mission_artifact_engine.draft_artifact (unmodified) in a
    background-thread job so Mission Workspace's "Gerar entregaveis" buttons
    get real, persisted, SSE-streamable progress instead of a single blocking
    request with zero visual feedback. Mirrors GenerationJobEngine's
    create/start/execute/_emit/_save/reconcile_startup shape, without the
    multi-worker lease machinery a handful of sequential LLM calls doesn't
    need -- a crashed process is instead recovered by reconcile_startup()
    failing out anything with a stale heartbeat."""

    def __init__(
        self,
        repository: MissionDeliverableJobRepository | None = None,
        mission_repository: MissionRepository | None = None,
        mission_service: MissionService | None = None,
    ) -> None:
        self.repository = repository or MissionDeliverableJobRepository()
        self.mission_repository = mission_repository or MissionRepository()
        self.mission_service = mission_service or MissionService(self.mission_repository)
        self._threads: dict[str, threading.Thread] = {}
        self._lock = threading.RLock()

    # ------------------------------------------------------------ compile

    def compile(
        self, mission_id: str, owner_user_id: str, *, artifact_definitions: list[dict[str, Any]],
        step_titles: dict[str, str], api_key: str | None, user_model_choice: str | None,
        idempotency_key: str, workspace_id: str | None,
    ) -> tuple[dict[str, Any], bool]:
        """Idempotent: a repeated call with the same idempotency_key returns
        the existing job (restarting its background thread if the process was
        restarted mid-run) instead of creating a duplicate."""

        def build_data() -> dict[str, Any]:
            now = self._now()
            return {
                "id": f"mdjob_{uuid4().hex[:14]}", "mission_id": mission_id, "workspace_id": workspace_id,
                "status": "QUEUED", "idempotency_key": idempotency_key, "error": None, "degraded": False,
                "artifacts_progress": [
                    {"type": d["type"], "title": d["title"], "status": "pending", "provider": None, "model": None, "input_tokens": 0, "output_tokens": 0, "started_at": None, "finished_at": None}
                    for d in artifact_definitions
                ],
                "drafts": [], "events": [], "requested_model": user_model_choice, "retry_count": 0,
                "created_at": now, "updated_at": now, "completed_at": None, "heartbeat_at": now,
                # working fields, not part of the public schema -- never persisted api_key.
                "_artifact_definitions": artifact_definitions, "_step_titles": step_titles, "_cancel_requested": False,
            }

        job, created = self.repository.create_or_get_idempotent(owner_user_id, mission_id, idempotency_key, build_data)
        if created:
            self._start(job["id"], owner_user_id, api_key=api_key, user_model_choice=user_model_choice)
        else:
            self._ensure_running(job, owner_user_id, api_key=api_key, user_model_choice=user_model_choice)
        return self.repository.get(job["id"], owner_user_id) or job, created

    def _start(self, job_id: str, owner_user_id: str, *, api_key: str | None, user_model_choice: str | None) -> None:
        with self._lock:
            running = self._threads.get(job_id)
            if running and running.is_alive():
                return
            thread = threading.Thread(
                target=self._execute, args=(job_id, owner_user_id),
                kwargs={"api_key": api_key, "user_model_choice": user_model_choice},
                daemon=False,
            )
            self._threads[job_id] = thread
            thread.start()

    def _ensure_running(self, job: dict[str, Any], owner_user_id: str, *, api_key: str | None, user_model_choice: str | None) -> None:
        if job["status"] not in NON_TERMINAL_STATUSES:
            return
        with self._lock:
            running = self._threads.get(job["id"])
            if running and running.is_alive():
                return
        self._start(job["id"], owner_user_id, api_key=api_key, user_model_choice=user_model_choice)

    def _execute(self, job_id: str, owner_user_id: str, *, api_key: str | None, user_model_choice: str | None) -> None:
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            return

        job["status"] = "ANSWERS_LOADING"
        self._emit(job, "answers_loading", message="Carregando respostas da missão.")
        self._save(job, owner_user_id)

        mission = self.mission_repository.get_for_owner(job["mission_id"], owner_user_id)
        if mission is None:
            job["status"] = "FAILED"
            job["error"] = {"kind": "mission_not_found", "message": "Missão não encontrada ou removida.", "artifact_type": None}
            job["completed_at"] = self._now()
            self._emit(job, "job_failed", level="error", message="Missão não encontrada ou removida.")
            self._save(job, owner_user_id)
            return

        job["status"] = "DRAFTING"
        self._emit(job, "drafting_started", message="Gerando rascunhos dos artefatos.")
        self._save(job, owner_user_id)

        answers = mission["context"].get("answers") or {}
        decisions = mission["context"].get("decisions") or []
        already_drafted = {draft["type"] for draft in job["drafts"]}

        for definition in job["_artifact_definitions"]:
            if definition["type"] in already_drafted:
                continue
            if job.get("_cancel_requested"):
                job["status"] = "CANCELLED"
                job["completed_at"] = self._now()
                self._emit(job, "job_cancelled", message="Geração cancelada pelo usuário.")
                self._save(job, owner_user_id)
                return

            stage_started_at = self._now()
            self._set_artifact_status(job, definition["type"], "drafting", started_at=stage_started_at)
            self._emit(job, "artifact_drafting_started", artifact_type=definition["type"], message=f"Gerando \"{definition['title']}\".")
            self._save(job, owner_user_id)

            try:
                draft, degraded, meta = draft_artifact(
                    artifact_type=definition["type"], artifact_title=definition["title"],
                    mission_title=mission["title"], step_titles=job["_step_titles"],
                    answers=answers, decisions=decisions,
                    api_key=api_key, user_model_choice=user_model_choice,
                )
            except Exception as exc:  # real provider/parsing errors -- never swallowed
                self._set_artifact_status(job, definition["type"], "failed", finished_at=self._now())
                job["error"] = {"kind": "llm_error", "message": str(exc), "artifact_type": definition["type"]}
                job["status"] = "FAILED"
                job["completed_at"] = self._now()
                self._emit(job, "artifact_draft_failed", level="error", artifact_type=definition["type"], message=str(exc))
                self._emit(job, "job_failed", level="error", message=f"Falha ao gerar \"{definition['title']}\": {exc}")
                self._save(job, owner_user_id)
                return

            job["drafts"].append({**draft, "can_feed_mission": definition.get("can_feed_mission") or [], "degraded": degraded})
            job["degraded"] = bool(job.get("degraded")) or degraded
            self._set_artifact_status(
                job, definition["type"], "ready", finished_at=self._now(),
                provider=meta["provider"], model=meta["model"],
                input_tokens=meta["input_tokens"], output_tokens=meta["output_tokens"],
            )
            self._emit(
                job, "artifact_drafted", artifact_type=definition["type"], message=f"\"{definition['title']}\" gerado.",
                metadata={"provider": meta["provider"], "model": meta["model"], "input_tokens": meta["input_tokens"], "output_tokens": meta["output_tokens"]},
            )
            self._save(job, owner_user_id)

        job["status"] = "DRAFTS_READY"
        self._emit(job, "drafts_ready", message="Todos os rascunhos estão prontos para revisão.")
        self._save(job, owner_user_id)

    @staticmethod
    def _set_artifact_status(job: dict[str, Any], artifact_type: str, status: str, **extra: Any) -> None:
        for progress in job["artifacts_progress"]:
            if progress["type"] == artifact_type:
                progress["status"] = status
                progress.update(extra)
                return

    # ------------------------------------------------------------ confirm / retry / cancel

    def confirm(self, job_id: str, owner_user_id: str, *, artifacts: list[dict[str, Any]] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
        """`artifacts`, when given, is what actually gets persisted -- the
        drafts the user reviewed *and possibly edited* in ArtifactsReviewModal
        (mirrors the existing artifacts/confirm endpoint's request body).
        Falling back to job["drafts"] (the unedited originals) only covers a
        caller that genuinely has no edits to send."""
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            raise ValueError("Job de entregáveis não encontrado.")
        if job["status"] != "DRAFTS_READY":
            raise ValueError(f"Job está em '{job['status']}', esperado 'DRAFTS_READY'.")

        job["status"] = "PERSISTING"
        self._emit(job, "persisting_started", message="Salvando artefatos confirmados na missão.")
        self._save(job, owner_user_id)

        try:
            updated_mission = self.mission_service.confirm_artifacts(job["mission_id"], owner_user_id, artifacts=artifacts if artifacts is not None else job["drafts"])
        except Exception as exc:
            job["status"] = "DRAFTS_READY"
            job["error"] = {"kind": "confirm_failed", "message": str(exc), "artifact_type": None}
            self._save(job, owner_user_id)
            raise
        if updated_mission is None:
            job["status"] = "DRAFTS_READY"
            job["error"] = {"kind": "confirm_failed", "message": "Missão não encontrada ao confirmar.", "artifact_type": None}
            self._save(job, owner_user_id)
            raise ValueError("Missão não encontrada ao confirmar os artefatos.")

        job["status"] = "COMPLETED"
        job["completed_at"] = self._now()
        self._emit(job, "persisted", message="Artefatos salvos na missão.")
        self._save(job, owner_user_id)
        return job, updated_mission

    def retry(self, job_id: str, owner_user_id: str, *, api_key: str | None, user_model_choice: str | None) -> dict[str, Any]:
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            raise ValueError("Job de entregáveis não encontrado.")
        if job["status"] != "FAILED":
            raise ValueError(f"Job está em '{job['status']}', esperado 'FAILED'.")

        job["status"] = "QUEUED"
        job["error"] = None
        job["_cancel_requested"] = False
        job["retry_count"] = int(job.get("retry_count") or 0) + 1
        job["requested_model"] = user_model_choice
        drafted_types = {draft["type"] for draft in job["drafts"]}
        for progress in job["artifacts_progress"]:
            if progress["type"] not in drafted_types:
                progress["status"] = "pending"
        self._save(job, owner_user_id)
        self._start(job_id, owner_user_id, api_key=api_key, user_model_choice=user_model_choice)
        return job

    def cancel(self, job_id: str, owner_user_id: str) -> dict[str, Any]:
        job = self.repository.get(job_id, owner_user_id)
        if job is None:
            raise ValueError("Job de entregáveis não encontrado.")
        if job["status"] not in NON_TERMINAL_STATUSES:
            return job
        job["_cancel_requested"] = True
        self._save(job, owner_user_id)
        return job

    # ------------------------------------------------------------ reads

    def get(self, job_id: str, owner_user_id: str) -> dict[str, Any] | None:
        return self.repository.get(job_id, owner_user_id)

    def latest(self, mission_id: str, owner_user_id: str) -> dict[str, Any] | None:
        return self.repository.latest_for_mission(mission_id, owner_user_id)

    # ------------------------------------------------------------ startup recovery

    def reconcile_startup(self) -> dict[str, int]:
        """Fails out any job whose heartbeat went stale (crashed/restarted
        worker) instead of leaving it stuck 'running' forever -- mirrors
        GenerationJobEngine.reconcile_startup, without lease/claim machinery
        this job type doesn't need."""
        older_than = (datetime.now(UTC) - timedelta(seconds=STALE_HEARTBEAT_SECONDS)).replace(microsecond=0).isoformat()
        stale = self.repository.stale_jobs(statuses=NON_TERMINAL_STATUSES, older_than=older_than)
        for job_id, owner_user_id in stale:
            job = self.repository.get(job_id, owner_user_id)
            if job is None:
                continue
            job["status"] = "FAILED"
            job["error"] = {
                "kind": "worker_lease_expired",
                "message": "O worker foi reiniciado antes da conclusão; tente novamente.",
                "artifact_type": None,
            }
            job["completed_at"] = self._now()
            self._save(job, owner_user_id)
        return {"stalled": len(stale)}

    # ------------------------------------------------------------ internals

    def _emit(
        self, job: dict[str, Any], event_type: str, *, message: str, level: str = "info",
        artifact_type: str | None = None, metadata: dict[str, Any] | None = None,
    ) -> None:
        job.setdefault("events", []).append({
            "id": f"evt_{uuid4().hex[:12]}", "job_id": job["id"], "timestamp": self._now(),
            "stage": job.get("status", ""), "type": event_type, "level": level,
            "message": message, "artifact_type": artifact_type, "metadata": metadata or {},
        })
        job["events"] = job["events"][-2000:]

    def _save(self, job: dict[str, Any], owner_user_id: str) -> dict[str, Any]:
        now = self._now()
        job["updated_at"] = now
        job["heartbeat_at"] = now
        self.repository.update(job["id"], owner_user_id, job)
        return job

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()
