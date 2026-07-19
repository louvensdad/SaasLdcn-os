from __future__ import annotations

import json
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from app.schemas.functional_coverage import FunctionalCoverageReport
from app.schemas.runtime_functional_test import RouteCheck, RuntimeFunctionalTestReport
from app.services.execution_runtime import (
    ExecutionRequest,
    ExecutionResult,
    ExecutionStatus,
    HostExecutionRuntime,
    NetworkPolicy,
)
from app.services.project_writer import DEFAULT_OUTPUT_ROOT

# Runtime Functional Test (Product Certification Engine P1, third slice): start
# the generated backend + frontend for REAL and drive a real headless browser
# through it -- everything else in this codebase is static analysis. Scope,
# confirmed with the user before building:
#   - No login: only unauthenticated flows (a redirect to /login is expected,
#     not a failure). Real login needs a credential strategy this pass
#     deliberately doesn't solve.
#   - Host execution only, dev/local scope: constructing HostExecutionRuntime()
#     and letting it raise on a disallowed environment IS the permission check
#     -- no new config flag invented.
#   - Python/FastAPI backend + Next.js/React frontend only. Anything else is an
#     honest supported=False, same pattern runtime_api_audit_service.py (the
#     only other execution-based check in this codebase) already established.
#
# execution_runtime.py is "the only module allowed to create host processes"
# (its own docstring, enforced by test_no_process_creation_exists_outside_the_
# runtime_adapter) -- so the long-running dev-server piece (execute() always
# blocks until the child exits; a listening dev server never will) lives as
# start_background()/stop_background()/tail_background() on HostExecutionRuntime
# itself, not as a local subprocess.Popen here.

_BACKEND_CANDIDATES = ("", "apps/api", "backend")
_FRONTEND_CANDIDATES = ("", "apps/web", "apps/frontend")
_READY_TIMEOUT_SECONDS = 30.0
_READY_POLL_INTERVAL_SECONDS = 0.5
_SAFE_ENV_NAMES = {
    "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "HOME", "USERPROFILE",
    "TEMP", "TMP", "LANG", "LC_ALL",
}
_LOGIN_PATH_HINT = ("login", "signin", "sign-in", "auth")


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _venv_python(venv_dir: Path) -> Path:
    # runtime_api_audit_service.py hardcodes POSIX bin/ paths safely because it
    # always runs INSIDE a Linux sandbox container; this service runs directly
    # on the host OS, so the Windows/POSIX split is a real requirement here.
    if sys.platform == "win32":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def _wait_ready(url: str, *, timeout_seconds: float = _READY_TIMEOUT_SECONDS) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:  # noqa: S310 -- localhost only
                if response.status < 500:
                    return True
        except (urllib.error.URLError, OSError, TimeoutError):
            pass
        time.sleep(_READY_POLL_INTERVAL_SECONDS)
    return False


def _diagnose(result: ExecutionResult, *, max_chars: int = 2000) -> str:
    """ExecutionResult.status alone ("FAILED") tells a caller nothing about
    WHY a real install command failed -- surface the real stdout/stderr tail
    (already redacted by execute()) instead."""
    detail = (result.failure_reason or result.stderr or result.stdout or "").strip()
    return f"{result.status.value}. {detail[-max_chars:]}" if detail else f"{result.status.value}."


def _route_from_page_file(relative_path: str) -> str | None:
    """'apps/web/app/produtos/page.tsx' -> '/produtos'. None for anything that
    isn't a real Next.js app-router page file, or that carries a dynamic
    segment (no real id to substitute)."""
    path = PurePosixPath(relative_path)
    if path.name not in {"page.tsx", "page.jsx"}:
        return None
    parts = path.parts
    if "app" not in parts:
        return None
    segments = [s for s in parts[parts.index("app") + 1 : -1] if not (s.startswith("(") and s.endswith(")"))]
    if any("[" in s for s in segments):
        return None
    return "/" + "/".join(segments) if segments else "/"


def _looks_like_login_redirect(path: str) -> bool:
    lowered = path.lower()
    return any(hint in lowered for hint in _LOGIN_PATH_HINT)


class _BackgroundHandle:
    """Thin wrapper around a HostExecutionRuntime background-process handle --
    all actual process creation stays inside execution_runtime.py."""

    def __init__(self, host_runtime: HostExecutionRuntime, handle_id: str) -> None:
        self._host_runtime = host_runtime
        self._handle_id = handle_id

    def stop(self) -> None:
        self._host_runtime.stop_background(self._handle_id)

    def tail_output(self) -> str:
        return self._host_runtime.tail_background(self._handle_id)


class RuntimeFunctionalTestService:
    def __init__(self, host_runtime_factory: Callable[[], HostExecutionRuntime] | None = None) -> None:
        self.workspace_root = DEFAULT_OUTPUT_ROOT.resolve()
        # Injectable so tests can substitute a lightweight double instead of a
        # real HostExecutionRuntime (which needs EXECUTION_RUNTIME=host/
        # ALLOW_HOST_EXECUTION=true and a real venv+Docker toolchain to do
        # anything past construction).
        self._host_runtime_factory = host_runtime_factory or HostExecutionRuntime

    def run(self, project: dict[str, Any], coverage: FunctionalCoverageReport | None = None) -> RuntimeFunctionalTestReport:
        project_id = str(project.get("project_id") or "")
        try:
            host_runtime = self._host_runtime_factory()
        except RuntimeError as exc:
            return self._report(project_id, supported=False, reason=str(exc))

        root = self._root(project)
        if root is None:
            return self._report(project_id, supported=False, reason="Generated project not found in the project workspace.")
        backend_root = self._find_python_backend(root)
        frontend_root = self._find_nextjs_frontend(root)
        if backend_root is None or frontend_root is None:
            return self._report(
                project_id, supported=False,
                reason="Runtime Functional Test needs a Python/FastAPI backend and a Next.js/React "
                       "frontend. Only that combination is supported today.",
            )

        relative_backend = backend_root.relative_to(root).as_posix() or "."
        relative_frontend = frontend_root.relative_to(root).as_posix() or "."

        sandbox_id = ""
        backend_proc: _BackgroundHandle | None = None
        frontend_proc: _BackgroundHandle | None = None
        try:
            sandbox_id = host_runtime.open_session(root, project_id=project_id)
            work_root = Path(host_runtime._sessions[sandbox_id]["root"])  # noqa: SLF001 -- deliberate reuse, isolated copy
            evidence_dir = host_runtime.evidence_root / "runtime-functional-test" / project_id

            prepared, reason = self._prepare_backend(host_runtime, sandbox_id, project_id, relative_backend)
            if not prepared:
                return self._report(project_id, supported=True, reason=reason)
            prepared, reason = self._prepare_frontend(host_runtime, sandbox_id, project_id, relative_frontend)
            if not prepared:
                return self._report(project_id, supported=True, reason=reason)

            backend_port = _free_port()
            frontend_port = _free_port()
            venv_python = _venv_python(work_root / relative_backend / ".ldcn-venv")

            backend_proc = _BackgroundHandle(
                host_runtime,
                host_runtime.start_background(
                    sandbox_id,
                    [str(venv_python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(backend_port)],
                    cwd=relative_backend, log_path=evidence_dir / "backend.log",
                ),
            )
            backend_started = _wait_ready(f"http://127.0.0.1:{backend_port}/")
            if not backend_started:
                return self._report(
                    project_id, supported=True, backend_started=False,
                    reason=f"Backend did not become ready within the startup budget.\n{backend_proc.tail_output()}",
                )

            npm = "npm.cmd" if sys.platform == "win32" else "npm"
            frontend_proc = _BackgroundHandle(
                host_runtime,
                host_runtime.start_background(
                    sandbox_id, [npm, "run", "dev", "--", "--port", str(frontend_port)],
                    cwd=relative_frontend, log_path=evidence_dir / "frontend.log",
                    extra_env={"NEXT_PUBLIC_API_URL": f"http://127.0.0.1:{backend_port}"},
                ),
            )
            frontend_started = _wait_ready(f"http://127.0.0.1:{frontend_port}/")
            if not frontend_started:
                return self._report(
                    project_id, supported=True, backend_started=True, frontend_started=False,
                    reason=f"Frontend did not become ready within the startup budget.\n{frontend_proc.tail_output()}",
                )

            routes = self._routes_to_visit(coverage)
            checks, browser_reason = self._run_browser_pass(frontend_port, routes, evidence_dir)
            crash_count = sum(1 for check in checks if not check.ok)
            return self._report(
                project_id, supported=True, backend_started=True, frontend_started=True,
                routes=checks, crash_count=crash_count, reason=browser_reason,
            )
        finally:
            if frontend_proc is not None:
                frontend_proc.stop()
            if backend_proc is not None:
                backend_proc.stop()
            if sandbox_id:
                host_runtime.close_session(sandbox_id)

    # ------------------------------------------------------------- discovery

    def _root(self, project: dict[str, Any]) -> Path | None:
        raw = project.get("generated_project_path")
        if not raw:
            return None
        root = Path(str(raw)).resolve()
        if not root.is_dir() or (root != self.workspace_root and self.workspace_root not in root.parents):
            return None
        return root

    @staticmethod
    def _find_python_backend(root: Path) -> Path | None:
        for candidate in _BACKEND_CANDIDATES:
            candidate_root = (root / candidate).resolve() if candidate else root
            if (candidate_root / "requirements.txt").is_file() and (candidate_root / "app" / "main.py").is_file():
                return candidate_root
        return None

    @staticmethod
    def _find_nextjs_frontend(root: Path) -> Path | None:
        # "next" specifically, not a bare react+react-dom fallback: the dev
        # command (npm run dev) and NEXT_PUBLIC_API_URL wiring below are both
        # Next.js-specific. A React SPA on Vite/CRA would start "successfully"
        # under a loose react+react-dom check but never actually see the
        # backend URL -- a false pass, exactly what this service must not give.
        for candidate in _FRONTEND_CANDIDATES:
            candidate_root = (root / candidate).resolve() if candidate else root
            package_json = candidate_root / "package.json"
            if not package_json.is_file():
                continue
            try:
                data = json.loads(package_json.read_text(encoding="utf-8", errors="ignore"))
            except (OSError, ValueError):
                continue
            deps = {**(data.get("dependencies") or {}), **(data.get("devDependencies") or {})}
            if "next" in deps:
                return candidate_root
        return None

    def _routes_to_visit(self, coverage: FunctionalCoverageReport | None) -> list[str]:
        routes = {"/"}
        if coverage is not None and coverage.frontend is not None:
            for finding in coverage.frontend.findings:
                if finding.file:
                    route = _route_from_page_file(finding.file)
                    if route:
                        routes.add(route)
        return sorted(routes)

    # ------------------------------------------------------------ preparation

    @staticmethod
    def _prepare_backend(
        host_runtime: HostExecutionRuntime, sandbox_id: str, project_id: str, relative_backend: str,
    ) -> tuple[bool, str]:
        create = host_runtime.execute(
            sandbox_id,
            ExecutionRequest(
                command=(sys.executable, "-m", "venv", ".ldcn-venv"), project_id=project_id,
                cwd=relative_backend, limits=host_runtime.default_limits(60), source="runtime-functional-test:prepare",
            ),
        )
        if create.status != ExecutionStatus.SUCCEEDED:
            return False, f"Could not prepare the isolated Python runtime: {_diagnose(create)}"
        venv_dir = Path(host_runtime._sessions[sandbox_id]["root"]) / relative_backend / ".ldcn-venv"  # noqa: SLF001 -- deliberate reuse
        pip = _venv_python(venv_dir).parent / ("pip.exe" if sys.platform == "win32" else "pip")
        install = host_runtime.execute(
            sandbox_id,
            ExecutionRequest(
                command=(str(pip), "install", "-r", "requirements.txt"),
                project_id=project_id, cwd=relative_backend, network=NetworkPolicy.PACKAGE_REGISTRY,
                limits=host_runtime.default_limits(180), source="runtime-functional-test:install",
            ),
        )
        if install.status != ExecutionStatus.SUCCEEDED:
            return False, f"Could not install backend dependencies: {_diagnose(install)}"
        return True, ""

    @staticmethod
    def _prepare_frontend(
        host_runtime: HostExecutionRuntime, sandbox_id: str, project_id: str, relative_frontend: str,
    ) -> tuple[bool, str]:
        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        install = host_runtime.execute(
            sandbox_id,
            ExecutionRequest(
                command=(npm, "install"), project_id=project_id, cwd=relative_frontend,
                network=NetworkPolicy.PACKAGE_REGISTRY, limits=host_runtime.default_limits(240),
                source="runtime-functional-test:install",
            ),
        )
        if install.status != ExecutionStatus.SUCCEEDED:
            return False, f"Could not install frontend dependencies: {_diagnose(install)}"
        return True, ""

    # ------------------------------------------------------------- browser

    def _run_browser_pass(self, frontend_port: int, routes: list[str], evidence_dir: Path) -> tuple[list[RouteCheck], str]:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            return [], "playwright is not installed (pip install -r requirements-dev.txt && playwright install chromium)."

        checks: list[RouteCheck] = []
        try:
            evidence_dir.mkdir(parents=True, exist_ok=True)
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True)
                try:
                    for route in routes:
                        checks.append(self._visit_route(browser, frontend_port, route, evidence_dir))
                finally:
                    browser.close()
        except Exception as exc:  # noqa: BLE001 -- a browser crash must degrade to a report, not a 500
            return checks, f"Browser pass failed: {type(exc).__name__}: {exc}"
        return checks, ""

    def _visit_route(self, browser: Any, frontend_port: int, route: str, evidence_dir: Path) -> RouteCheck:
        console_errors: list[str] = []
        network_failures: list[str] = []
        page = browser.new_page()
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: console_errors.append(str(exc)))
        page.on(
            "response",
            lambda resp: network_failures.append(f"{resp.request.method} {resp.url} -> {resp.status}") if resp.status >= 500 else None,
        )
        detail = ""
        http_status: int | None = None
        redirected_to: str | None = None
        screenshot_path: str | None = None
        try:
            response = page.goto(f"http://127.0.0.1:{frontend_port}{route}", timeout=15_000, wait_until="networkidle")
            http_status = response.status if response else None
            final_path = urllib.parse.urlparse(page.url).path if response else route
            if final_path != route and _looks_like_login_redirect(final_path):
                redirected_to = final_path
            slug = route.strip("/").replace("/", "_") or "root"
            target = evidence_dir / f"{slug}.png"
            page.screenshot(path=str(target), full_page=True)
            screenshot_path = str(target)
        except Exception as exc:  # noqa: BLE001 -- a navigation failure is itself the finding
            detail = f"{type(exc).__name__}: {exc}"
        finally:
            page.close()
        ok = not detail and not console_errors and not network_failures and (http_status is None or http_status < 500)
        return RouteCheck(
            path=route, ok=ok, http_status=http_status, redirected_to=redirected_to,
            console_errors=console_errors, network_failures=network_failures,
            screenshot_path=screenshot_path, detail=detail,
        )

    @staticmethod
    def _report(project_id: str, **kwargs: Any) -> RuntimeFunctionalTestReport:
        return RuntimeFunctionalTestReport(project_id=project_id, generated_at=_now(), **kwargs)


runtime_functional_test_service = RuntimeFunctionalTestService()
