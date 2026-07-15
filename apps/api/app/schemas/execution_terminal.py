from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class TerminalExecuteRequest(ApiModel):
    """One command for the LDCN Execution Terminal. `cwd` is a path RELATIVE to
    the generated project root (e.g. "apps/web"); it can never escape it."""

    command: str = Field(min_length=1, max_length=500)
    cwd: str = ""


class TerminalCommandRecord(ApiModel):
    """A persisted terminal execution: what ran, where, how it ended, and the
    sanitized output tails. This is the durable command history / audit trail."""

    id: str
    project_id: str
    command: str
    cwd: str
    status: Literal["completed", "rejected", "timeout"]
    runtime_status: Literal[
        "QUEUED", "PREPARING_SANDBOX", "RUNNING", "SUCCEEDED", "FAILED",
        "TIMED_OUT", "RESOURCE_LIMIT_EXCEEDED", "SECURITY_BLOCKED",
        "CANCELLED", "SANDBOX_ERROR",
    ] | None = None
    sandbox_id: str | None = None
    exit_code: int | None = None
    duration_ms: int = 0
    stdout_tail: str = ""
    stderr_tail: str = ""
    rejection_reason: str | None = None
    executed_by: str | None = None
    started_at: str
    source: Literal["user", "ai_suggestion"] = "user"


class TerminalHistoryResponse(ApiModel):
    project_id: str
    records: list[TerminalCommandRecord] = Field(default_factory=list)
    allowed_commands: list[str] = Field(default_factory=list)
