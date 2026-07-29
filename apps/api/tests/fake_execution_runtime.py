from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.services.execution_runtime import (
    ExecutionRequest,
    ExecutionResult,
    ExecutionRuntime,
    ExecutionStatus,
    RuntimeLimits,
    redact,
    sanitized_command,
)


class FakeExecutionRuntime(ExecutionRuntime):
    """Deterministic test double. It never creates a process."""

    def __init__(self) -> None:
        self.sessions: dict[str, Path] = {}
        self.cancelled: set[str] = set()
        self.requests: list[ExecutionRequest] = []

    def open_session(self, workspace: Path, *, project_id: str, workspace_id: str = "", job_id: str = "") -> str:
        sandbox_id = f"fake_{uuid4().hex[:8]}"
        self.sessions[sandbox_id] = workspace
        return sandbox_id

    def execute(self, sandbox_id: str, request: ExecutionRequest, *, on_line=None) -> ExecutionResult:
        self.requests.append(request)
        status = ExecutionStatus.CANCELLED if sandbox_id in self.cancelled else ExecutionStatus.SUCCEEDED
        exit_code = None if status == ExecutionStatus.CANCELLED else 0
        stdout = ""
        stderr = ""
        command = request.command
        root = self.sessions[sandbox_id] / (request.cwd if request.cwd != "." else "")
        failure_reason = ""
        if command and command[0] == "ldcn-nonexistent-binary-zzz":
            status, exit_code = ExecutionStatus.SECURITY_BLOCKED, None
            failure_reason = "Program is not in the execution policy."
        elif command[:2] == ("git", "status"):
            status, exit_code, stderr = ExecutionStatus.FAILED, 128, "fatal: not a git repository"
        elif command and command[0] == "node" and len(command) > 1:
            script = root / command[1]
            content = script.read_text(encoding="utf-8") if script.is_file() else ""
            match = re.search(r"console\.log\(['\"](.+?)['\"]\)", content)
            stdout = redact(match.group(1) if match else "")
        elif command and command[0] in {"python", "python3"} and len(command) > 2 and command[1] == "-c":
            match = re.search(r"print\(['\"](.+?)['\"]\)", command[2])
            stdout = match.group(1) if match else ""
        elif command and command[0] in {"python", "python3"} and len(command) > 1 and command[1].endswith(".py"):
            content = (root / command[1]).read_text(encoding="utf-8")
            match = re.search(r"write\('([^']+)'", content)
            stdout = match.group(1) if match else ""
        elif command and command[0] in {"python", "python3"} and "--version" in command:
            stdout = "Python 3.12.0"
        elif "LDCN_RUNTIME_AUDIT_RESULT=" in " ".join(command):
            endpoints = json.loads(command[-1])
            checks = [
                {
                    "method": method, "path": path,
                    "status_code": 500 if path == "/boom" else 200,
                    "ok": path != "/boom",
                    "detail": "Endpoint returned a server error." if path == "/boom" else "",
                }
                for method, path in endpoints
            ]
            stdout = "LDCN_RUNTIME_AUDIT_RESULT=" + json.dumps(checks, separators=(",", ":"))
        if on_line and stdout:
            on_line("stdout", stdout)
        if on_line and stderr:
            on_line("stderr", stderr)
        now = datetime.now(UTC).replace(microsecond=0).isoformat()
        return ExecutionResult(
            execution_id=f"exec_{uuid4().hex[:8]}", sandbox_id=sandbox_id,
            status=status, command=sanitized_command(command), cwd=request.cwd,
            image="fake/sandbox:test", started_at=now, finished_at=now,
            exit_code=exit_code, stdout=stdout, stderr=stderr, failure_reason=failure_reason,
        )

    def sync_workspace(self, sandbox_id: str) -> None:
        return

    def export_workspace(self, sandbox_id: str, destination: Path) -> list[str]:
        return []

    def close_session(self, sandbox_id: str) -> None:
        self.sessions.pop(sandbox_id, None)

    def cancel(self, sandbox_id: str) -> bool:
        self.cancelled.add(sandbox_id)
        return sandbox_id in self.sessions

    def default_limits(self, timeout_seconds: int | None = None) -> RuntimeLimits:
        return RuntimeLimits(timeout_seconds=timeout_seconds or 300)
