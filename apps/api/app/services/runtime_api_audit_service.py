from __future__ import annotations

import json
import socket
import subprocess
import sys
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import yaml

try:
    import psutil
except ImportError:  # pragma: no cover - psutil is an optional dependency
    psutil = None  # type: ignore[assignment]

from app.schemas.runtime_api_audit import RuntimeApiAuditReport, RuntimeEndpointCheck

# Runtime API Auditor: the "Backend Agent Universal" capability the Production
# Guarantee Engine gap audit found missing -- every other check in this codebase
# is static (regex/filename heuristics over generated source). This one actually
# STARTS the generated backend and hits its real endpoints, so a handler that
# imports a module that doesn't exist, or crashes on the happy path, is caught
# by a real 500 instead of only surfacing at deploy time.
#
# Scope (honest, not "100%"): only Python/FastAPI today, matching the ONE
# ecosystem this codebase already gives a fully deterministic location for --
# build_validation_service's `.ldcn-venv` (created during install) and the
# `app.main:app` entrypoint convention its own generator enforces (see
# quality_gate_engine._extra_detections, language_agent_profiles.py's Python
# backend_rules). Every other language reports supported=False, never a false
# "passed". GET-only, no bodies synthesized: POST/PUT/DELETE could mutate a
# real database and are out of scope for a safe automated sweep.

_BACKEND_CANDIDATES = ("", "apps/api", "backend")  # same search order as build_validation_service
_OPENAPI_SPEC_NAMES = ("openapi.yaml", "openapi.yml", "openapi.json")
_OPENAPI_SPEC_DIRS = (".", "docs")

_STARTUP_TIMEOUT_SECONDS = 25
_POLL_INTERVAL_SECONDS = 0.5
_REQUEST_TIMEOUT_SECONDS = 8
_MAX_ENDPOINTS = 25  # bounded sweep -- report.endpoints_skipped states what was left out
_LOG_TAIL_LINES = 80


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class RuntimeApiAuditService:
    def audit(self, project: dict[str, Any]) -> RuntimeApiAuditReport:
        project_id = str(project.get("project_id") or "")
        root = self._root(project)
        if root is None:
            return self._report(project_id, supported=False, reason="Generated project not found on disk.")

        backend_root = self._find_python_backend(root)
        if backend_root is None:
            return self._report(
                project_id, supported=False,
                reason="No Python/FastAPI backend detected. Only Python is supported today -- "
                "this is a real scope limit, not a passing result for other languages.",
            )

        venv_python = self._venv_python(backend_root)
        if venv_python is None:
            return self._report(
                project_id, supported=True, language="python",
                reason="No .ldcn-venv found for this backend -- run the build/install step (POST .../validate "
                "with build=true) before a runtime audit; there is nothing to start yet.",
            )

        endpoints = self._get_only_endpoints(self._load_openapi(root))
        port = _free_port()
        proc, log_lines = self._start_server(venv_python, backend_root, port)
        try:
            ready = self._wait_ready(port, proc)
            if not ready:
                return self._report(
                    project_id, supported=True, language="python", started=True, ready=False,
                    reason="The server did not answer any request before the startup timeout "
                    f"({_STARTUP_TIMEOUT_SECONDS}s) -- likely an import error or unhandled startup exception.",
                    startup_log_tail="\n".join(log_lines[-_LOG_TAIL_LINES:]),
                )
            sample = endpoints[:_MAX_ENDPOINTS]
            checks = [self._check(port, method, path) for method, path in sample]
            crashes = sum(1 for check in checks if not check.ok)
            return self._report(
                project_id, supported=True, language="python", started=True, ready=True,
                checks=checks, endpoints_total=len(endpoints),
                endpoints_skipped=max(0, len(endpoints) - len(sample)),
                crash_count=crashes,
                reason="" if crashes == 0 else f"{crashes} endpoint(s) returned a 5xx or failed to connect.",
                startup_log_tail="\n".join(log_lines[-_LOG_TAIL_LINES:]) if crashes else "",
            )
        finally:
            self._kill(proc)

    # ------------------------------------------------------------------ setup
    def _root(self, project: dict[str, Any]) -> Path | None:
        raw = project.get("generated_project_path")
        if not raw:
            return None
        root = Path(str(raw)).resolve()
        return root if root.is_dir() else None

    def _find_python_backend(self, root: Path) -> Path | None:
        for candidate in _BACKEND_CANDIDATES:
            candidate_root = (root / candidate).resolve() if candidate else root
            if (candidate_root / "requirements.txt").is_file() and (candidate_root / "app" / "main.py").is_file():
                return candidate_root
        return None

    def _venv_python(self, backend_root: Path) -> Path | None:
        venv = backend_root / ".ldcn-venv"
        python = venv / ("Scripts/python.exe" if sys.platform.startswith("win") else "bin/python")
        return python if python.is_file() else None

    def _load_openapi(self, root: Path) -> dict[str, Any] | None:
        for dir_name in _OPENAPI_SPEC_DIRS:
            for spec_name in _OPENAPI_SPEC_NAMES:
                path = root / dir_name / spec_name
                if not path.is_file():
                    continue
                try:
                    text = path.read_text(encoding="utf-8", errors="ignore")
                    return json.loads(text) if spec_name.endswith(".json") else yaml.safe_load(text)
                except (OSError, ValueError, yaml.YAMLError):
                    continue
        return None

    def _get_only_endpoints(self, openapi: dict[str, Any] | None) -> list[tuple[str, str]]:
        if not isinstance(openapi, dict):
            return []
        paths = openapi.get("paths")
        if not isinstance(paths, dict):
            return []
        out: list[tuple[str, str]] = []
        for path, operations in paths.items():
            if not isinstance(path, str) or "{" in path or not isinstance(operations, dict):
                continue  # unresolved path params (e.g. /orders/{id}) can't be safely synthesized
            if "get" in {key.lower() for key in operations}:
                out.append(("GET", path))
        return sorted(out)

    # ---------------------------------------------------------------- process
    def _start_server(self, venv_python: Path, backend_root: Path, port: int) -> tuple[subprocess.Popen, list[str]]:
        command = [str(venv_python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)]
        popen = psutil.Popen if psutil is not None else subprocess.Popen
        proc = popen(
            command, cwd=str(backend_root), text=True, encoding="utf-8", errors="replace",
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1,
        )
        log_lines: list[str] = []

        def pump() -> None:
            try:
                stdout = proc.stdout
                if stdout is None:
                    return
                for line in iter(stdout.readline, ""):
                    log_lines.append(line.rstrip("\n"))
                    if len(log_lines) > _LOG_TAIL_LINES * 4:
                        del log_lines[: -_LOG_TAIL_LINES]
            except (OSError, ValueError):
                pass  # pipe closed by _kill() -- nothing left to read

        threading.Thread(target=pump, daemon=True).start()
        return proc, log_lines

    def _wait_ready(self, port: int, proc: subprocess.Popen) -> bool:
        deadline = time.monotonic() + _STARTUP_TIMEOUT_SECONDS
        base = f"http://127.0.0.1:{port}"
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                return False  # the process already exited -- it will never become ready
            for probe in ("/openapi.json", "/"):
                try:
                    httpx.get(base + probe, timeout=1.5)
                    return True
                except httpx.HTTPError:
                    continue
            time.sleep(_POLL_INTERVAL_SECONDS)
        return False

    def _check(self, port: int, method: str, path: str) -> RuntimeEndpointCheck:
        url = f"http://127.0.0.1:{port}{path}"
        try:
            response = httpx.request(method, url, timeout=_REQUEST_TIMEOUT_SECONDS)
        except httpx.HTTPError as exc:
            return RuntimeEndpointCheck(method=method, path=path, status_code=None, ok=False, detail=f"connection failed: {exc}")
        ok = response.status_code < 500
        detail = "" if ok else f"HTTP {response.status_code}: server error handling a real request"
        return RuntimeEndpointCheck(method=method, path=path, status_code=response.status_code, ok=ok, detail=detail)

    def _kill(self, proc: subprocess.Popen) -> None:
        if psutil is not None:
            try:
                parent = psutil.Process(proc.pid)
                for child in parent.children(recursive=True):
                    try:
                        child.kill()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        try:
            proc.kill()
        except (OSError, ProcessLookupError):
            pass
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass

    # ----------------------------------------------------------------- report
    def _report(
        self, project_id: str, *, supported: bool, language: str | None = None, started: bool = False,
        ready: bool = False, reason: str = "", checks: list[RuntimeEndpointCheck] | None = None,
        endpoints_total: int = 0, endpoints_skipped: int = 0, crash_count: int = 0, startup_log_tail: str = "",
    ) -> RuntimeApiAuditReport:
        return RuntimeApiAuditReport(
            project_id=project_id, supported=supported, language=language, started=started, ready=ready,
            reason=reason, checks=checks or [], endpoints_total=endpoints_total,
            endpoints_skipped=endpoints_skipped, crash_count=crash_count, startup_log_tail=startup_log_tail,
            generated_at=_now(),
        )


runtime_api_audit_service = RuntimeApiAuditService()
