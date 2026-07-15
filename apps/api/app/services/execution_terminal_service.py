from __future__ import annotations

import json
import re
import shlex
import threading
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.schemas.execution_terminal import TerminalCommandRecord
from app.services.execution_runtime import (
    ExecutionRequest,
    ExecutionRuntime,
    ExecutionStatus,
    NetworkPolicy,
    SandboxExecutionRuntime,
    execution_runtime,
)
from app.services.project_writer import DEFAULT_OUTPUT_ROOT

LineSink = Any
_SHELL_META_RE = re.compile(r"[|&;<>`$\r\n]")

ALLOWED_COMMANDS: dict[str, set[str | None]] = {
    "npm": {"install", "ci", "run", "test", "exec", "ls", "audit", "view", "outdated", "--version", "-v"},
    "git": {"status", "log", "diff", "branch", "show", "remote", "--version"},
    "node": set(),
    "npx": {"tsc", "eslint", "vitest", "jest", "prettier", "next"},
}
ALLOWED_COMMANDS_DISPLAY = [
    "npm install", "npm run build", "npm run test", "npm run lint", "npm ci",
    "git status", "git log", "git diff", "node <script dentro do projeto>",
    "npx tsc|eslint|vitest|jest|prettier|next",
]
HISTORY_LIMIT = 200
SESSIONS_ROOT = DEFAULT_OUTPUT_ROOT.parent / "terminal-sessions"


class TerminalCommandRejected(ValueError):
    pass


class ExecutionTerminalService:
    def __init__(
        self,
        timeout_seconds: int = 300,
        sessions_root: Path | None = None,
        workspace_root: Path | None = None,
        runtime: ExecutionRuntime | None = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.sessions_root = (sessions_root or SESSIONS_ROOT).resolve()
        self.workspace_root = (workspace_root or DEFAULT_OUTPUT_ROOT).resolve()
        self.runtime = runtime or execution_runtime
        self._active: dict[str, str] = {}
        self._active_lock = threading.RLock()

    def execute(
        self,
        project: dict[str, Any],
        command: str,
        *,
        cwd: str = "",
        executed_by: str | None = None,
        source: str = "user",
        on_line: LineSink | None = None,
    ) -> TerminalCommandRecord:
        project_id = str(project["project_id"])
        started_at = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        record_id = f"term_{uuid4().hex[:12]}"
        try:
            root = self._project_root(project)
            workdir = self._confined_cwd(root, cwd)
            argv = self._validated_argv(root, workdir, command)
        except TerminalCommandRejected as exc:
            return self._record_rejection(record_id, project_id, command, cwd, str(exc), executed_by, started_at, source)

        relative_cwd = workdir.relative_to(root).as_posix() or "."
        sandbox_id = ""
        try:
            sandbox_id = self.runtime.open_session(
                root,
                project_id=project_id,
                workspace_id=str(project.get("workspace_id") or project.get("workspaceId") or ""),
                job_id=str(project.get("job_id") or project.get("jobId") or ""),
            )
            with self._active_lock:
                self._active[project_id] = sandbox_id
            network = self._network_policy(argv)
            limits = self.runtime.default_limits(self.timeout_seconds) if isinstance(self.runtime, SandboxExecutionRuntime) else None
            request_kwargs: dict[str, Any] = {}
            if limits is not None:
                request_kwargs["limits"] = limits
            result = self.runtime.execute(
                sandbox_id,
                ExecutionRequest(
                    command=tuple(argv), project_id=project_id,
                    workspace_id=str(project.get("workspace_id") or project.get("workspaceId") or ""),
                    job_id=str(project.get("job_id") or project.get("jobId") or ""),
                    cwd=relative_cwd, network=network, source=f"terminal:{source}", **request_kwargs,
                ),
                on_line=on_line,
            )
        except (OSError, RuntimeError, ValueError) as exc:
            return self._record_rejection(
                record_id, project_id, command, relative_cwd,
                f"SANDBOX_ERROR: {exc}", executed_by, started_at, source,
                runtime_status=ExecutionStatus.SANDBOX_ERROR.value,
            )
        finally:
            if sandbox_id:
                with self._active_lock:
                    if self._active.get(project_id) == sandbox_id:
                        self._active.pop(project_id, None)
                self.runtime.close_session(sandbox_id)

        legacy_status = "completed"
        if result.status == ExecutionStatus.TIMED_OUT:
            legacy_status = "timeout"
        elif result.status in {
            ExecutionStatus.SECURITY_BLOCKED, ExecutionStatus.SANDBOX_ERROR,
            ExecutionStatus.RESOURCE_LIMIT_EXCEEDED, ExecutionStatus.CANCELLED,
        }:
            legacy_status = "rejected"
        record = TerminalCommandRecord(
            id=record_id, project_id=project_id, command=result.command, cwd=relative_cwd,
            status=legacy_status, runtime_status=result.status.value,
            sandbox_id=result.sandbox_id, exit_code=result.exit_code,
            duration_ms=result.duration_ms, stdout_tail=self._tail(result.stdout),
            stderr_tail=self._tail(result.stderr), rejection_reason=result.failure_reason or None,
            executed_by=executed_by, started_at=started_at, source=source,
        )
        self._persist(project_id, record)
        return record

    def cancel(self, project_id: str) -> bool:
        with self._active_lock:
            sandbox_id = self._active.get(project_id)
        return bool(sandbox_id and self.runtime.cancel(sandbox_id))
    def history(self, project_id: str) -> list[TerminalCommandRecord]:
        path = self._history_path(project_id)
        if not path.is_file():
            return []
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        return [TerminalCommandRecord.model_validate(item) for item in data if isinstance(item, dict)]

    def _record_rejection(self, record_id: str, project_id: str, command: str, cwd: str, reason: str, executed_by: str | None, started_at: str, source: str, *, runtime_status: str = ExecutionStatus.SECURITY_BLOCKED.value) -> TerminalCommandRecord:
        record = TerminalCommandRecord(
            id=record_id, project_id=project_id, command=command, cwd=cwd or ".",
            status="rejected", runtime_status=runtime_status, rejection_reason=reason,
            executed_by=executed_by, started_at=started_at, source=source,
        )
        self._persist(project_id, record)
        return record

    def _project_root(self, project: dict[str, Any]) -> Path:
        raw = project.get("generated_project_path")
        if not raw:
            raise TerminalCommandRejected("Projeto sem workspace gerado.")
        root = Path(str(raw)).resolve()
        if not root.is_dir():
            raise TerminalCommandRejected("O workspace do projeto nao existe no servidor.")
        if root == self.workspace_root or self.workspace_root not in root.parents:
            raise TerminalCommandRejected("O terminal so executa dentro do workspace de projetos gerados.")
        return root

    def _confined_cwd(self, root: Path, cwd: str) -> Path:
        candidate = (root / cwd).resolve() if cwd else root
        if candidate != root and root not in candidate.parents:
            raise TerminalCommandRejected(f"Diretorio '{cwd}' fora do projeto; o terminal e isolado por projeto.")
        if not candidate.is_dir():
            raise TerminalCommandRejected(f"Diretorio '{cwd}' nao existe no projeto.")
        return candidate

    def _validated_argv(self, root: Path, workdir: Path, command: str) -> list[str]:
        if _SHELL_META_RE.search(command):
            raise TerminalCommandRejected("Operadores de shell (| & ; > < ` $) nao sao permitidos; execute um comando por vez.")
        try:
            argv = shlex.split(command, posix=True)
        except ValueError as exc:
            raise TerminalCommandRejected(f"Comando invalido: {exc}") from exc
        if not argv:
            raise TerminalCommandRejected("Comando vazio.")
        program = argv[0].lower()
        allowed = ALLOWED_COMMANDS.get(program)
        if allowed is None:
            raise TerminalCommandRejected(f"'{program}' nao esta na allowlist do terminal. Permitidos: {', '.join(sorted(ALLOWED_COMMANDS))}.")
        if program == "node":
            self._validate_node(root, workdir, argv)
        else:
            first = argv[1] if len(argv) > 1 else None
            if first is not None and first.lower() not in allowed:
                raise TerminalCommandRejected(f"Subcomando '{first}' de {program} nao permitido.")
            if first is None and program != "git":
                raise TerminalCommandRejected(f"Informe um subcomando para {program}.")
        return argv

    @staticmethod
    def _validate_node(root: Path, workdir: Path, argv: list[str]) -> None:
        if any(arg in {"-e", "--eval", "-p", "--print", "--input-type"} for arg in argv[1:]):
            raise TerminalCommandRejected("node -e/--eval nao e permitido; execute um script do projeto.")
        script = next((arg for arg in argv[1:] if not arg.startswith("-")), None)
        if script is None:
            raise TerminalCommandRejected("Informe o script do projeto a executar.")
        target = (workdir / script).resolve()
        if root not in {target, *target.parents} or not target.is_file():
            raise TerminalCommandRejected(f"Script '{script}' nao existe dentro do projeto.")

    @staticmethod
    def _network_policy(argv: list[str]) -> NetworkPolicy:
        if argv[0].lower() in {"npx"}:
            return NetworkPolicy.PACKAGE_REGISTRY
        if argv[0].lower() == "npm" and len(argv) > 1 and argv[1].lower() in {"install", "ci", "exec", "audit", "view", "outdated"}:
            return NetworkPolicy.PACKAGE_REGISTRY
        return NetworkPolicy.NONE

    def _persist(self, project_id: str, record: TerminalCommandRecord) -> None:
        path = self._history_path(project_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        records = [item.model_dump(mode="json") for item in self.history(project_id)]
        records.append(record.model_dump(mode="json"))
        path.write_text(json.dumps(records[-HISTORY_LIMIT:], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def _history_path(self, project_id: str) -> Path:
        return self.sessions_root / f"{re.sub(r'[^A-Za-z0-9_.-]', '_', project_id)}.json"

    @staticmethod
    def _tail(text: str, keep: int = 200) -> str:
        return "\n".join(text.splitlines()[-keep:])


execution_terminal_service = ExecutionTerminalService()
