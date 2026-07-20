from __future__ import annotations

import shutil
import sys
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable
from uuid import uuid4

import httpx

from app.engines.metering_engine import record_consumption
from app.repositories.staging_deployment_repository import StagingDeploymentRepository
from app.schemas.staging import StagingDeployment, StagingHealthCheck
from app.services.execution_runtime import HostExecutionRuntime
from app.services.fs_publish import force_rmtree
from app.services.project_writer import WORKSPACE_ROOT, DEFAULT_OUTPUT_ROOT, ProjectWriter
from app.services.runtime_functional_test_service import (
    RuntimeFunctionalTestService,
    _free_port,
    _venv_python,
    _wait_ready,
)

# Staging (vault 60 - Publicação/Estratégia de publicação.md: "Staging:
# ambiente persistente para aprovação", distinct from the ephemeral Preview
# and from "Produção gerenciada"/"Produção externa").
#
# Scope decision (2026-07-20, confirmed with the user, after finding that
# "Produção gerenciada" would require exposing sandbox containers to the
# public internet -- a real new attack surface on the network isolation
# hardened in this same session's sandbox-isolation work): build Staging
# instead, as a persistent, health-checked, rollback-capable evolution of
# live_preview_service.py. Same HostExecutionRuntime primitives, same
# dev/local-only gate -- this does NOT yet work in a real production
# deployment (SandboxExecutionRuntime has no background-process or
# port-publish capability at all today; extending it is real future work,
# not pretended here).
#
# What's genuinely new versus Preview: (1) persistent -- no idle-timeout
# auto-stop; (2) a real, callable, on-demand health check (not just a
# startup gate); (3) real rollback -- each deploy snapshots the CURRENT
# generated-project directory into an immutable versioned copy under
# generated-projects/staging-versions/{project_id}/{version_id}/ and starts
# the staging processes against THAT snapshot, not the live/mutable project
# directory, so a later Change Request to the live project can never alter
# an already-deployed staging version out from under it. Only the current +
# previous snapshot are kept; anything older is pruned.

STAGING_VERSIONS_ROOT = WORKSPACE_ROOT / "generated-projects" / "staging-versions"


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


class StagingAccessError(ValueError):
    """Raised when the target generated project cannot be resolved or does not belong to the requesting owner."""


class _RunningSession:
    def __init__(self, *, project_id: str, host_runtime: HostExecutionRuntime, sandbox_id: str) -> None:
        self.project_id = project_id
        self.host_runtime = host_runtime
        self.sandbox_id = sandbox_id
        self.backend_handle_id: str | None = None
        self.frontend_handle_id: str | None = None
        self.backend_port: int | None = None
        self.frontend_port: int | None = None


class StagingService:
    def __init__(
        self,
        repository: StagingDeploymentRepository | None = None,
        host_runtime_factory: Callable[[], HostExecutionRuntime] | None = None,
        writer: ProjectWriter | None = None,
    ) -> None:
        self.repository = repository or StagingDeploymentRepository()
        self.workspace_root = DEFAULT_OUTPUT_ROOT.resolve()
        self._host_runtime_factory = host_runtime_factory or HostExecutionRuntime
        self.writer = writer or ProjectWriter()
        self._running: dict[str, _RunningSession] = {}
        self._lock = threading.RLock()

    # ---------------------------------------------------------------- deploy
    def deploy(self, project_id: str, owner_user_id: str) -> StagingDeployment:
        owner = self.writer.read_owner(project_id)
        if owner is not None and owner != owner_user_id:
            raise StagingAccessError("Generated project was not found.")
        live_root = self._live_root(project_id)
        if live_root is None:
            raise StagingAccessError("Generated project was not found.")

        existing = self.repository.get_for_owner(project_id, owner_user_id)
        version_id = f"v_{uuid4().hex[:12]}"
        snapshot_path = self._snapshot(project_id, live_root, version_id)

        try:
            new_session = self._start_processes(project_id, snapshot_path)
        except Exception as exc:  # noqa: BLE001 -- a bad deploy must never take down a healthy previous one
            force_rmtree(snapshot_path)
            row = self.repository.upsert(
                project_id, owner_user_id,
                current_version_id=(existing or {}).get("current_version_id"),
                current_snapshot_path=(existing or {}).get("current_snapshot_path"),
                previous_version_id=(existing or {}).get("previous_version_id"),
                previous_snapshot_path=(existing or {}).get("previous_snapshot_path"),
                status="failed" if not existing else existing["status"],
                reason=f"Deploy failed, previous version (if any) kept running: {exc}",
            )
            return self._to_model(row)

        if new_session.frontend_port is None:  # health check failed inside _start_processes
            reason = "Staging deploy failed health check; previous version (if any) kept running."
            self._teardown_session(new_session)
            force_rmtree(snapshot_path)
            row = self.repository.upsert(
                project_id, owner_user_id,
                current_version_id=(existing or {}).get("current_version_id"),
                current_snapshot_path=(existing or {}).get("current_snapshot_path"),
                previous_version_id=(existing or {}).get("previous_version_id"),
                previous_snapshot_path=(existing or {}).get("previous_snapshot_path"),
                status="failed" if not existing else existing["status"],
                reason=reason,
            )
            return self._to_model(row)

        # New version is healthy: swap it in, stop the old one AFTER the new
        # one is confirmed running (never leave a gap with nothing serving).
        with self._lock:
            old_session = self._running.pop(project_id, None)
            self._running[project_id] = new_session
        if old_session is not None:
            self._teardown_session(old_session)

        previous_version_id = (existing or {}).get("current_version_id")
        previous_snapshot_path = (existing or {}).get("current_snapshot_path")
        self._prune_older_than(project_id, keep={version_id, previous_version_id})
        row = self.repository.upsert(
            project_id, owner_user_id, current_version_id=version_id, current_snapshot_path=str(snapshot_path),
            previous_version_id=previous_version_id, previous_snapshot_path=previous_snapshot_path,
            status="running", reason="",
        )
        record_consumption(owner_user_id=owner_user_id, resource_type="staging_deploy", quantity=1, unit="count", origin=f"staging:{project_id}:{version_id}")
        return self._to_model(row)

    # ------------------------------------------------------------------ read
    def get(self, project_id: str, owner_user_id: str) -> StagingDeployment | None:
        row = self.repository.get_for_owner(project_id, owner_user_id)
        if row is None:
            return None
        return self._to_model(row)

    def health_check(self, project_id: str, owner_user_id: str) -> StagingHealthCheck | None:
        row = self.repository.get_for_owner(project_id, owner_user_id)
        if row is None:
            return None
        with self._lock:
            session = self._running.get(project_id)
        backend_healthy = bool(session and session.backend_port and _probe(f"http://127.0.0.1:{session.backend_port}/"))
        frontend_healthy = bool(session and session.frontend_port and _probe(f"http://127.0.0.1:{session.frontend_port}/"))
        if session is not None and not (backend_healthy and frontend_healthy):
            self.repository.set_status(project_id, "failed", "Health check failed on a running deployment.")
        return StagingHealthCheck(
            project_id=project_id, backend_healthy=backend_healthy, frontend_healthy=frontend_healthy, checked_at=_now(),
        )

    # -------------------------------------------------------------- rollback
    def rollback(self, project_id: str, owner_user_id: str) -> StagingDeployment | None:
        row = self.repository.get_for_owner(project_id, owner_user_id)
        if row is None:
            return None
        if not row.get("previous_snapshot_path"):
            raise StagingAccessError("No previous version available to roll back to.")

        with self._lock:
            old_session = self._running.pop(project_id, None)
        if old_session is not None:
            self._teardown_session(old_session)

        try:
            new_session = self._start_processes(project_id, Path(row["previous_snapshot_path"]))
        except Exception as exc:  # noqa: BLE001
            updated = self.repository.set_status(project_id, "failed", f"Rollback failed: {exc}")
            return self._to_model(updated)

        if new_session.frontend_port is None:
            self._teardown_session(new_session)
            updated = self.repository.set_status(project_id, "failed", "Rollback target failed its health check.")
            return self._to_model(updated)

        with self._lock:
            self._running[project_id] = new_session
        # Swap current <-> previous rather than discarding either -- lets the
        # user roll forward again without losing the version they just left.
        updated = self.repository.upsert(
            project_id, owner_user_id, current_version_id=row["previous_version_id"],
            current_snapshot_path=row["previous_snapshot_path"], previous_version_id=row["current_version_id"],
            previous_snapshot_path=row["current_snapshot_path"], status="running", reason="",
        )
        return self._to_model(updated)

    # ------------------------------------------------------------------ stop
    def stop(self, project_id: str, owner_user_id: str) -> bool:
        row = self.repository.get_for_owner(project_id, owner_user_id)
        if row is None:
            return False
        with self._lock:
            session = self._running.pop(project_id, None)
        if session is not None:
            self._teardown_session(session)
        self.repository.set_status(project_id, "stopped", "")
        return True

    # -------------------------------------------------------------- internal
    def _live_root(self, project_id: str) -> Path | None:
        root = (self.workspace_root / project_id).resolve()
        if not root.is_dir() or (root != self.workspace_root and self.workspace_root not in root.parents):
            return None
        return root

    def _snapshot(self, project_id: str, live_root: Path, version_id: str) -> Path:
        destination = STAGING_VERSIONS_ROOT / project_id / version_id
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(live_root, destination)
        return destination

    def _prune_older_than(self, project_id: str, *, keep: set[str | None]) -> None:
        versions_dir = STAGING_VERSIONS_ROOT / project_id
        if not versions_dir.is_dir():
            return
        for child in versions_dir.iterdir():
            if child.is_dir() and child.name not in keep:
                force_rmtree(child)

    def _start_processes(self, project_id: str, snapshot_root: Path) -> _RunningSession:
        host_runtime = self._host_runtime_factory()  # raises RuntimeError outside dev/local -- propagates as a failed deploy
        backend_root = RuntimeFunctionalTestService._find_python_backend(snapshot_root)  # noqa: SLF001
        frontend_root = RuntimeFunctionalTestService._find_nextjs_frontend(snapshot_root)  # noqa: SLF001
        if backend_root is None or frontend_root is None:
            raise RuntimeError(
                "Staging needs a Python/FastAPI backend and a Next.js/React frontend. Only that combination is supported today."
            )
        relative_backend = backend_root.relative_to(snapshot_root).as_posix() or "."
        relative_frontend = frontend_root.relative_to(snapshot_root).as_posix() or "."

        sandbox_id = host_runtime.open_session(snapshot_root, project_id=project_id)
        session = _RunningSession(project_id=project_id, host_runtime=host_runtime, sandbox_id=sandbox_id)

        prepared, reason = RuntimeFunctionalTestService._prepare_backend(host_runtime, sandbox_id, project_id, relative_backend)  # noqa: SLF001
        if not prepared:
            host_runtime.close_session(sandbox_id)
            raise RuntimeError(reason)
        prepared, reason = RuntimeFunctionalTestService._prepare_frontend(host_runtime, sandbox_id, project_id, relative_frontend)  # noqa: SLF001
        if not prepared:
            host_runtime.close_session(sandbox_id)
            raise RuntimeError(reason)

        backend_port = _free_port()
        frontend_port = _free_port()
        work_root = Path(host_runtime._sessions[sandbox_id]["root"])  # noqa: SLF001 -- deliberate reuse, isolated copy
        venv_python = _venv_python(work_root / relative_backend / ".ldcn-venv")
        evidence_dir = host_runtime.evidence_root / "staging" / project_id

        session.backend_handle_id = host_runtime.start_background(
            sandbox_id, [str(venv_python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(backend_port)],
            cwd=relative_backend, log_path=evidence_dir / "backend.log",
        )
        if not _wait_ready(f"http://127.0.0.1:{backend_port}/"):
            return session  # frontend_port stays None -> caller treats as a failed health check

        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        session.frontend_handle_id = host_runtime.start_background(
            sandbox_id, [npm, "run", "dev", "--", "--port", str(frontend_port), "--hostname", "127.0.0.1"],
            cwd=relative_frontend, log_path=evidence_dir / "frontend.log",
            extra_env={"NEXT_PUBLIC_API_URL": f"http://127.0.0.1:{backend_port}"},
        )
        if not _wait_ready(f"http://127.0.0.1:{frontend_port}/"):
            return session  # frontend_port stays None -> caller treats as a failed health check

        session.backend_port = backend_port
        session.frontend_port = frontend_port
        return session

    @staticmethod
    def _teardown_session(session: _RunningSession) -> None:
        if session.frontend_handle_id:
            session.host_runtime.stop_background(session.frontend_handle_id)
        if session.backend_handle_id:
            session.host_runtime.stop_background(session.backend_handle_id)
        session.host_runtime.close_session(session.sandbox_id)

    def _to_model(self, row: dict) -> StagingDeployment:
        with self._lock:
            session = self._running.get(row["project_id"])
        preview_url = f"http://127.0.0.1:{session.frontend_port}/" if session and session.frontend_port else None
        return StagingDeployment(
            project_id=row["project_id"], status=row["status"], reason=row["reason"],
            current_version_id=row["current_version_id"], previous_version_id=row["previous_version_id"],
            preview_url=preview_url, can_rollback=bool(row["previous_snapshot_path"]),
            created_at=row["created_at"], updated_at=row["updated_at"],
        )


def _probe(url: str) -> bool:
    try:
        response = httpx.get(url, timeout=5.0)
        return response.status_code < 500
    except httpx.TransportError:
        return False


staging_service = StagingService()
