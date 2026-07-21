from __future__ import annotations

import sys
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable
from uuid import uuid4

from app.core.event_catalog import emit_named_event
from app.schemas.live_preview import LivePreviewSession, LivePreviewStatus
from app.services.execution_runtime import HostExecutionRuntime
from app.services.preview_inspector import PreviewInspector
from app.services.project_writer import DEFAULT_OUTPUT_ROOT, ProjectWriter
from app.services.runtime_functional_test_service import (
    RuntimeFunctionalTestService,
    _free_port,
    _venv_python,
    _wait_ready,
)

# Live App Preview (MLTagente vault gap #1). See schemas/live_preview.py for
# the scope this deliberately does and does not cover. This service is the
# long-lived sibling of RuntimeFunctionalTestService: same discovery/prepare/
# start_background choreography (reused directly as static methods, not
# duplicated), except the backend+frontend process pair is kept alive in an
# in-memory registry across requests instead of being torn down at the end of
# one run() call. Idle sessions are reaped lazily (checked on start()) rather
# than via a dedicated background thread -- this is a single-process, dev-only
# feature; a new thread just for this is unwarranted.
#
# preview_url points the iframe DIRECTLY at http://127.0.0.1:{port}/ rather
# than through a same-origin API proxy. A subpath reverse-proxy was tried
# first and rejected after live verification: Next.js emits root-relative
# asset URLs (/_next/static/...) that resolve against the iframe's origin,
# escaping any /api/live-preview/{id}/proxy/ prefix and 404ing every JS/CSS
# asset -- the page loads but never hydrates. Making that transparent needs
# real HTML/asset response rewriting (basePath-style), a materially bigger
# problem than this minimal slice's scope. Direct-port exposure is
# consistent with the risk HostExecutionRuntime already accepts (it is
# documented as an "unsafe development escape hatch" bound to 127.0.0.1
# only) -- confirmed with the user before dropping the proxy.

IDLE_TIMEOUT_SECONDS = 15 * 60


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


class LivePreviewAccessError(ValueError):
    """Raised when the target generated project cannot be resolved or does not belong to the requesting owner."""


class _Session:
    def __init__(self, *, session_id: str, project_id: str, owner_user_id: str, host_runtime: HostExecutionRuntime, sandbox_id: str) -> None:
        self.session_id = session_id
        self.project_id = project_id
        self.owner_user_id = owner_user_id
        self.host_runtime = host_runtime
        self.sandbox_id = sandbox_id
        self.backend_handle_id: str | None = None
        self.frontend_handle_id: str | None = None
        self.frontend_port: int | None = None
        self.inspector: PreviewInspector | None = None
        self.status: LivePreviewStatus = "starting"
        self.reason = ""
        self.started_at = _now()
        self.last_activity_wall = _now()
        self.last_activity_monotonic = time.monotonic()

    def touch(self) -> None:
        self.last_activity_wall = _now()
        self.last_activity_monotonic = time.monotonic()


class LivePreviewService:
    def __init__(
        self,
        host_runtime_factory: Callable[[], HostExecutionRuntime] | None = None,
        writer: ProjectWriter | None = None,
        inspector_factory: Callable[[str], PreviewInspector | None] | None = None,
    ) -> None:
        self.workspace_root = DEFAULT_OUTPUT_ROOT.resolve()
        self._host_runtime_factory = host_runtime_factory or HostExecutionRuntime
        self.writer = writer or ProjectWriter()
        # Injectable for the same reason host_runtime_factory is: unit tests
        # that fake the backend/frontend process pair must not also spin up a
        # real Chromium instance per session.
        self._inspector_factory = inspector_factory or PreviewInspector
        self._sessions: dict[str, _Session] = {}
        self._by_project: dict[str, str] = {}
        self._lock = threading.RLock()

    # ----------------------------------------------------------------- start
    def start(self, project_id: str, owner_user_id: str) -> LivePreviewSession:
        # Existence/ownership is checked BEFORE any host-runtime-availability or
        # stack-support check, same order change_request_service.create() uses --
        # otherwise "host execution disabled" would mask a real "unknown
        # project" 404 behind a generic 200 unsupported response.
        owner = self.writer.read_owner(project_id)
        if owner is not None and owner != owner_user_id:
            raise LivePreviewAccessError("Generated project was not found.")
        root = self._root(project_id)
        if root is None:
            raise LivePreviewAccessError("Generated project was not found.")

        self._reap_idle()
        with self._lock:
            existing_id = self._by_project.get(project_id)
        if existing_id:
            self._stop_internal(existing_id)

        try:
            host_runtime = self._host_runtime_factory()
        except RuntimeError as exc:
            return self._unsupported(project_id, str(exc))

        backend_root = RuntimeFunctionalTestService._find_python_backend(root)  # noqa: SLF001 -- shared static helper
        frontend_root = RuntimeFunctionalTestService._find_nextjs_frontend(root)  # noqa: SLF001 -- shared static helper
        if backend_root is None or frontend_root is None:
            return self._unsupported(
                project_id,
                "Live preview needs a Python/FastAPI backend and a Next.js/React frontend. "
                "Only that combination is supported today.",
            )

        relative_backend = backend_root.relative_to(root).as_posix() or "."
        relative_frontend = frontend_root.relative_to(root).as_posix() or "."

        session_id = f"lp_{uuid4().hex[:16]}"
        sandbox_id = host_runtime.open_session(root, project_id=project_id)
        session = _Session(
            session_id=session_id, project_id=project_id, owner_user_id=owner_user_id,
            host_runtime=host_runtime, sandbox_id=sandbox_id,
        )
        with self._lock:
            self._sessions[session_id] = session
            self._by_project[project_id] = session_id

        prepared, reason = RuntimeFunctionalTestService._prepare_backend(  # noqa: SLF001 -- shared static helper
            host_runtime, sandbox_id, project_id, relative_backend,
        )
        if not prepared:
            return self._fail(session, reason)
        prepared, reason = RuntimeFunctionalTestService._prepare_frontend(  # noqa: SLF001 -- shared static helper
            host_runtime, sandbox_id, project_id, relative_frontend,
        )
        if not prepared:
            return self._fail(session, reason)

        backend_port = _free_port()
        frontend_port = _free_port()
        work_root = Path(host_runtime._sessions[sandbox_id]["root"])  # noqa: SLF001 -- deliberate reuse, isolated copy
        venv_python = _venv_python(work_root / relative_backend / ".ldcn-venv")
        evidence_dir = host_runtime.evidence_root / "live-preview" / session_id

        session.backend_handle_id = host_runtime.start_background(
            sandbox_id,
            [str(venv_python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(backend_port)],
            cwd=relative_backend, log_path=evidence_dir / "backend.log",
        )
        if not _wait_ready(f"http://127.0.0.1:{backend_port}/"):
            return self._fail(
                session,
                f"Backend did not become ready within the startup budget.\n{host_runtime.tail_background(session.backend_handle_id)}",
            )

        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        session.frontend_handle_id = host_runtime.start_background(
            sandbox_id,
            [npm, "run", "dev", "--", "--port", str(frontend_port), "--hostname", "127.0.0.1"],
            cwd=relative_frontend, log_path=evidence_dir / "frontend.log",
            extra_env={"NEXT_PUBLIC_API_URL": f"http://127.0.0.1:{backend_port}"},
        )
        if not _wait_ready(f"http://127.0.0.1:{frontend_port}/"):
            return self._fail(
                session,
                f"Frontend did not become ready within the startup budget.\n{host_runtime.tail_background(session.frontend_handle_id)}",
            )

        session.frontend_port = frontend_port
        session.status = "running"
        session.touch()
        # Best-effort: the console/error panel and screenshot button are a
        # bonus observability layer (see preview_inspector.py), not core
        # preview correctness -- a Playwright/Chromium problem here must
        # never fail the preview session itself.
        try:
            session.inspector = self._inspector_factory(f"http://127.0.0.1:{frontend_port}/")
        except Exception:  # noqa: BLE001
            session.inspector = None
        emit_named_event("PreviewStarted", owner_user_id, project_id=project_id, metadata={"session_id": session_id})
        return self._to_model(session)

    # ------------------------------------------------------------------ read
    def get(self, session_id: str, owner_user_id: str) -> LivePreviewSession | None:
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None or session.owner_user_id != owner_user_id:
            return None
        return self._to_model(session)

    def get_by_project(self, project_id: str, owner_user_id: str) -> LivePreviewSession | None:
        with self._lock:
            session_id = self._by_project.get(project_id)
            session = self._sessions.get(session_id) if session_id else None
        if session is None or session.owner_user_id != owner_user_id:
            return None
        return self._to_model(session)

    def active_count_for_owner(self, owner_user_id: str, *, exclude_project_id: str | None = None) -> int:
        """Concurrent preview-instance count for the plan-access engine's
        `preview_instances` limit -- `_sessions` only ever holds starting/running
        entries (stop/fail immediately pop the entry, see `_stop_internal`).
        `exclude_project_id` lets a restart of the SAME project's own preview
        (start() always stops any prior session for that project first) not
        count against its own replacement."""
        self._reap_idle()
        with self._lock:
            return sum(
                1 for session in self._sessions.values()
                if session.owner_user_id == owner_user_id and session.project_id != exclude_project_id
            )

    def _authorized_session(self, session_id: str, owner_user_id: str) -> _Session | None:
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None or session.owner_user_id != owner_user_id:
            return None
        return session

    def console_log(self, session_id: str, owner_user_id: str) -> list[dict[str, str]] | None:
        session = self._authorized_session(session_id, owner_user_id)
        if session is None or session.inspector is None:
            return None
        session.touch()
        return session.inspector.snapshot_console()

    def screenshot(self, session_id: str, owner_user_id: str) -> bytes | None:
        session = self._authorized_session(session_id, owner_user_id)
        if session is None or session.inspector is None:
            return None
        session.touch()
        return session.inspector.screenshot()

    def navigate(self, session_id: str, owner_user_id: str, path: str) -> bool:
        session = self._authorized_session(session_id, owner_user_id)
        if session is None or session.inspector is None or session.frontend_port is None:
            return False
        target = path if path.startswith("/") else f"/{path}"
        session.inspector.navigate(f"http://127.0.0.1:{session.frontend_port}{target}")
        session.touch()
        return True

    def reload(self, session_id: str, owner_user_id: str) -> bool:
        session = self._authorized_session(session_id, owner_user_id)
        if session is None or session.inspector is None:
            return False
        session.inspector.reload()
        session.touch()
        return True

    # ------------------------------------------------------------------ stop
    def stop(self, session_id: str, owner_user_id: str) -> bool:
        with self._lock:
            session = self._sessions.get(session_id)
        if session is None or session.owner_user_id != owner_user_id:
            return False
        self._stop_internal(session_id)
        return True

    def _stop_internal(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(session_id, None)
            if session is not None:
                self._by_project.pop(session.project_id, None)
        if session is None:
            return
        if session.inspector is not None:
            session.inspector.stop()
        if session.frontend_handle_id:
            session.host_runtime.stop_background(session.frontend_handle_id)
        if session.backend_handle_id:
            session.host_runtime.stop_background(session.backend_handle_id)
        session.host_runtime.close_session(session.sandbox_id)
        session.status = "stopped"
        emit_named_event("PreviewStopped", session.owner_user_id, project_id=session.project_id, metadata={"session_id": session_id})

    def _reap_idle(self) -> None:
        with self._lock:
            stale = [
                sid for sid, session in self._sessions.items()
                if time.monotonic() - session.last_activity_monotonic > IDLE_TIMEOUT_SECONDS
            ]
        for sid in stale:
            self._stop_internal(sid)

    # -------------------------------------------------------------- internal
    def _root(self, project_id: str) -> Path | None:
        root = (self.workspace_root / project_id).resolve()
        if not root.is_dir() or (root != self.workspace_root and self.workspace_root not in root.parents):
            return None
        return root

    @staticmethod
    def _unsupported(project_id: str, reason: str) -> LivePreviewSession:
        now = _now()
        return LivePreviewSession(
            session_id="", project_id=project_id, status="unsupported", reason=reason,
            preview_url=None, started_at=now, last_activity_at=now,
        )

    def _fail(self, session: _Session, reason: str) -> LivePreviewSession:
        session.status = "failed"
        session.reason = reason
        model = self._to_model(session)
        self._stop_internal(session.session_id)
        return model

    @staticmethod
    def _to_model(session: _Session) -> LivePreviewSession:
        preview_url = f"http://127.0.0.1:{session.frontend_port}/" if session.status == "running" and session.frontend_port else None
        return LivePreviewSession(
            session_id=session.session_id, project_id=session.project_id, status=session.status,
            reason=session.reason, preview_url=preview_url,
            started_at=session.started_at, last_activity_at=session.last_activity_wall,
        )


live_preview_service = LivePreviewService()
