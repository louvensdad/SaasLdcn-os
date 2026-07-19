from __future__ import annotations

import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.schemas.test_runner import TestRunReport, TestSuiteResult
from app.services.execution_runtime import (
    ExecutionRequest,
    ExecutionRuntime,
    ExecutionStatus,
    NetworkPolicy,
    SandboxExecutionRuntime,
    execution_runtime,
)
from app.services.project_writer import DEFAULT_OUTPUT_ROOT, ProjectWriter

# Test Runner (55 - Quality Platform/Test Runner.md). See schemas/test_runner.py
# for the scope this deliberately does and does not cover. Uses the generic
# ExecutionRuntime (execution_runtime singleton, sandbox by default) rather
# than HostExecutionRuntime specifically -- unlike live_preview_service.py,
# running a test suite is a single blocking command (execute()), not a
# long-lived server (start_background()), so this works in production's
# Docker-sandboxed mode too, not only dev/local.

_BACKEND_CANDIDATES = ("", "apps/api", "backend")
_NODE_CANDIDATES = ("", "apps/web", "apps/frontend", "backend", "frontend")
_PYTEST_TEST_FILE_RE = re.compile(r"(^|[/\\])(test_[^/\\]+\.py|[^/\\]+_test\.py)$")
_NPM_PLACEHOLDER_TEST_RE = re.compile(r"no test specified")
_COUNT_RE = re.compile(r"(\d+)\s+(passed|failed|skipped|error|errors|xfailed|xpassed)", re.IGNORECASE)


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _tail(text: str, lines: int = 60) -> str:
    return "\n".join(text.strip().splitlines()[-lines:])


def _parse_counts(output: str) -> tuple[int | None, int | None, int | None, int | None]:
    """Best-effort: sums labeled counts from the tail of pytest/Jest/Vitest
    output. Returns (passed, failed, skipped, total); any of these stays
    None if nothing recognizable was found -- exit code remains the source
    of truth for status regardless of whether parsing succeeds."""
    tally: dict[str, int] = {}
    for match in _COUNT_RE.finditer(_tail(output, lines=15)):
        count, label = int(match.group(1)), match.group(2).lower()
        tally[label] = tally.get(label, 0) + count
    passed = tally.get("passed")
    failed_count = tally.get("failed", 0) + tally.get("error", 0) + tally.get("errors", 0)
    failed = failed_count or (0 if passed is not None else None)
    skipped = tally.get("skipped")
    if passed is None and failed is None and skipped is None:
        return None, None, None, None
    total = (passed or 0) + (failed or 0) + (skipped or 0)
    return passed, failed, skipped, total


class TestRunnerAccessError(ValueError):
    """Raised when the target generated project cannot be resolved or does
    not belong to the requesting owner."""


class TestRunnerService:
    def __init__(self, runtime: ExecutionRuntime | None = None, writer: ProjectWriter | None = None) -> None:
        self.workspace_root = DEFAULT_OUTPUT_ROOT.resolve()
        self.runtime = runtime or execution_runtime
        self.writer = writer or ProjectWriter()

    def run(self, project_id: str, owner_user_id: str) -> TestRunReport:
        # Existence/ownership checked BEFORE any capability/support check --
        # same fix already applied to live_preview_service.py: otherwise an
        # unsupported project would mask a real "unknown project" 404 behind
        # a generic 200 response.
        owner = self.writer.read_owner(project_id)
        if owner is not None and owner != owner_user_id:
            raise TestRunnerAccessError("Generated project was not found.")
        project = {"project_id": project_id, "generated_project_path": str(self.workspace_root / project_id)}
        root = self._root(project)
        if root is None:
            raise TestRunnerAccessError("Generated project was not found.")

        backend_root = self._find_python_backend(root)
        node_root = self._find_node_project(root)
        if backend_root is None and node_root is None:
            return self._report(
                project_id, status="unsupported",
                reason="Test Runner precisa de um backend Python (requirements.txt) ou um projeto Node (package.json). Nenhum foi encontrado.",
            )

        sandbox_id = ""
        suites: list[TestSuiteResult] = []
        try:
            sandbox_id = self.runtime.open_session(root, project_id=project_id)
        except (RuntimeError, ValueError, OSError) as exc:
            return self._report(project_id, status="unsupported", reason=f"Execution runtime unavailable: {exc}")
        try:
            if backend_root is not None:
                relative_backend = backend_root.relative_to(root).as_posix() or "."
                suites.append(self._run_pytest(sandbox_id, project_id, backend_root, relative_backend))
            if node_root is not None:
                relative_node = node_root.relative_to(root).as_posix() or "."
                suites.append(self._run_npm_test(sandbox_id, project_id, node_root, relative_node))
        finally:
            if sandbox_id:
                self.runtime.close_session(sandbox_id)

        return self._report(project_id, status=self._overall_status(suites), suites=suites)

    # ------------------------------------------------------------- discovery
    @staticmethod
    def _find_python_backend(root: Path) -> Path | None:
        for candidate in _BACKEND_CANDIDATES:
            candidate_root = (root / candidate).resolve() if candidate else root
            if (candidate_root / "requirements.txt").is_file():
                return candidate_root
        return None

    @staticmethod
    def _find_node_project(root: Path) -> Path | None:
        for candidate in _NODE_CANDIDATES:
            candidate_root = (root / candidate).resolve() if candidate else root
            package_json = candidate_root / "package.json"
            if package_json.is_file():
                return candidate_root
        return None

    @staticmethod
    def _has_pytest_test_files(root: Path) -> bool:
        return any(
            _PYTEST_TEST_FILE_RE.search(path.as_posix())
            for path in root.rglob("*.py")
            if ".ldcn-venv" not in path.parts and "node_modules" not in path.parts
        )

    @staticmethod
    def _real_npm_test_script(root: Path) -> str | None:
        try:
            data = json.loads((root / "package.json").read_text(encoding="utf-8", errors="ignore"))
        except (OSError, ValueError):
            return None
        script = (data.get("scripts") or {}).get("test")
        if not script or _NPM_PLACEHOLDER_TEST_RE.search(script):
            return None
        return script

    # ------------------------------------------------------------------- run
    def _run_pytest(self, sandbox_id: str, project_id: str, backend_root: Path, relative_backend: str) -> TestSuiteResult:
        if not self._has_pytest_test_files(backend_root):
            return TestSuiteResult(framework="pytest", command="pytest -q", status="skipped", reason="Nenhum arquivo de teste encontrado (test_*.py ou *_test.py).")

        prepared, reason = self._prepare_python(sandbox_id, project_id, relative_backend)
        if not prepared:
            return TestSuiteResult(framework="pytest", command="pytest -q", status="error", reason=f"Falha ao preparar o ambiente Python: {reason}")

        command = (self._venv_python(sandbox_id, relative_backend), "-m", "pytest", "-q")
        result = self.runtime.execute(
            sandbox_id,
            ExecutionRequest(command=command, project_id=project_id, cwd=relative_backend, limits=self.runtime.default_limits(120), source="test-runner:pytest"),
        )
        combined = f"{result.stdout}\n{result.stderr}"
        if "No module named pytest" in combined:
            return TestSuiteResult(framework="pytest", command="pytest -q", status="skipped", reason="pytest nao esta declarado nas dependencias do backend gerado.", duration_ms=result.duration_ms)
        if result.status not in (ExecutionStatus.SUCCEEDED, ExecutionStatus.FAILED):
            return TestSuiteResult(framework="pytest", command="pytest -q", status="error", reason=result.failure_reason or result.status.value, duration_ms=result.duration_ms, logs_tail=_tail(combined))
        passed, failed, skipped, total = _parse_counts(combined)
        if result.exit_code == 5:  # pytest: no tests collected
            return TestSuiteResult(framework="pytest", command="pytest -q", status="skipped", reason="Nenhum teste foi coletado pelo pytest.", duration_ms=result.duration_ms, logs_tail=_tail(combined))
        status = "passed" if result.exit_code == 0 else "failed"
        return TestSuiteResult(framework="pytest", command="pytest -q", status=status, passed=passed, failed=failed, skipped=skipped, total=total, duration_ms=result.duration_ms, logs_tail=_tail(combined))

    def _run_npm_test(self, sandbox_id: str, project_id: str, node_root: Path, relative_node: str) -> TestSuiteResult:
        script = self._real_npm_test_script(node_root)
        if script is None:
            return TestSuiteResult(framework="npm", command="npm test", status="skipped", reason="package.json nao declara um script de teste real (ausente ou placeholder padrao).")

        npm = self._npm_binary()
        install = self.runtime.execute(
            sandbox_id,
            ExecutionRequest(command=(npm, "install"), project_id=project_id, cwd=relative_node, network=NetworkPolicy.PACKAGE_REGISTRY, limits=self.runtime.default_limits(240), source="test-runner:install"),
        )
        if install.status != ExecutionStatus.SUCCEEDED:
            return TestSuiteResult(framework="npm", command="npm test", status="error", reason=f"Falha ao instalar dependencias do frontend: {install.failure_reason or _tail(install.stdout + install.stderr)}", duration_ms=install.duration_ms)

        result = self.runtime.execute(
            sandbox_id,
            ExecutionRequest(command=(npm, "test"), project_id=project_id, cwd=relative_node, limits=self.runtime.default_limits(180), source="test-runner:npm-test"),
        )
        combined = f"{result.stdout}\n{result.stderr}"
        if result.status not in (ExecutionStatus.SUCCEEDED, ExecutionStatus.FAILED):
            return TestSuiteResult(framework="npm", command="npm test", status="error", reason=result.failure_reason or result.status.value, duration_ms=result.duration_ms, logs_tail=_tail(combined))
        passed, failed, skipped, total = _parse_counts(combined)
        status = "passed" if result.exit_code == 0 else "failed"
        return TestSuiteResult(framework="npm", command="npm test", status=status, passed=passed, failed=failed, skipped=skipped, total=total, duration_ms=result.duration_ms, logs_tail=_tail(combined))

    def _prepare_python(self, sandbox_id: str, project_id: str, relative_backend: str) -> tuple[bool, str]:
        # Live-verified real bug: a bare "python" literal hits WinError 2 on
        # Windows host execution -- PATH also resolves a Microsoft Store
        # "app execution alias" stub (WindowsApps\python.exe) that isn't a
        # real interpreter in this filtered-env subprocess context, and it
        # can shadow the real install depending on PATH order. sys.executable
        # (the API server's own interpreter) sidesteps that reliably, but is
        # meaningless inside a Docker sandbox container -- so branch on
        # runtime type, same as the venv/npm binary helpers below.
        python_bin = sys.executable if not self._is_sandboxed() else "python"
        create = self.runtime.execute(
            sandbox_id,
            ExecutionRequest(command=(python_bin, "-m", "venv", ".ldcn-venv"), project_id=project_id, cwd=relative_backend, limits=self.runtime.default_limits(60), source="test-runner:prepare"),
        )
        if create.status != ExecutionStatus.SUCCEEDED:
            return False, create.failure_reason or _tail(f"{create.stdout}\n{create.stderr}")
        pip = self._venv_pip(sandbox_id, relative_backend)
        install = self.runtime.execute(
            sandbox_id,
            ExecutionRequest(command=(pip, "install", "-r", "requirements.txt"), project_id=project_id, cwd=relative_backend, network=NetworkPolicy.PACKAGE_REGISTRY, limits=self.runtime.default_limits(180), source="test-runner:install"),
        )
        if install.status != ExecutionStatus.SUCCEEDED:
            return False, install.failure_reason or _tail(f"{install.stdout}\n{install.stderr}")
        return True, ""

    # -------------------------------------------------------------- internal
    def _root(self, project: dict[str, Any]) -> Path | None:
        raw = project.get("generated_project_path")
        if not raw:
            return None
        root = Path(str(raw)).resolve()
        if not root.is_dir() or (root != self.workspace_root and self.workspace_root not in root.parents):
            return None
        return root

    def _is_sandboxed(self) -> bool:
        # SandboxExecutionRuntime is always a Linux Docker container regardless
        # of the API server's own host OS -- that's the one case where
        # sys.platform must NOT decide the binary layout.
        return isinstance(self.runtime, SandboxExecutionRuntime)

    def _venv_python(self, sandbox_id: str, relative_backend: str) -> str:
        return self._venv_binary(sandbox_id, relative_backend, "python.exe", "python")

    def _venv_pip(self, sandbox_id: str, relative_backend: str) -> str:
        return self._venv_binary(sandbox_id, relative_backend, "pip.exe", "pip")

    def _venv_binary(self, sandbox_id: str, relative_backend: str, windows_name: str, posix_name: str) -> str:
        if self._is_sandboxed():
            return f".ldcn-venv/bin/{posix_name}"
        if sys.platform != "win32":
            return f".ldcn-venv/bin/{posix_name}"
        # Live-verified real bug: on Windows, CreateProcess resolves a
        # relative executable path containing slashes against the PARENT
        # process's cwd, not the child's `cwd` argument -- unlike POSIX,
        # where fork() -> chdir() -> exec() means a relative path resolves
        # against the NEW cwd. ".ldcn-venv/Scripts/pip.exe" as a relative
        # path therefore silently resolves against the API server's own
        # working directory (wrong) and fails with WinError 2. Only an
        # absolute path into the host-local temp copy works here.
        sessions = getattr(self.runtime, "_sessions", {})  # noqa: SLF001 -- deliberate reuse, HostExecutionRuntime only (guarded by _is_sandboxed() above)
        session = sessions.get(sandbox_id) if isinstance(sessions, dict) else None
        session_root = Path(session["root"]) if isinstance(session, dict) and session.get("root") else Path(relative_backend)
        backend_dir = session_root if relative_backend in ("", ".") else session_root / relative_backend
        return str(backend_dir / ".ldcn-venv" / "Scripts" / windows_name)

    def _npm_binary(self) -> str:
        if sys.platform == "win32" and not self._is_sandboxed():
            return "npm.cmd"
        return "npm"

    @staticmethod
    def _overall_status(suites: list[TestSuiteResult]) -> str:
        if not suites:
            return "unsupported"
        if any(suite.status in ("failed", "error") for suite in suites):
            return "failed"
        if all(suite.status == "skipped" for suite in suites):
            return "partially_skipped"
        return "passed"

    @staticmethod
    def _report(project_id: str, *, status: str, reason: str = "", suites: list[TestSuiteResult] | None = None) -> TestRunReport:
        return TestRunReport(
            run_id=f"tr_{uuid4().hex[:16]}", project_id=project_id, status=status,
            reason=reason, suites=suites or [], generated_at=_now(),
        )


test_runner_service = TestRunnerService()
