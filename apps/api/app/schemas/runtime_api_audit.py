from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class RuntimeEndpointCheck(ApiModel):
    method: str
    path: str
    status_code: int | None = None
    # False only for a 5xx response or a connection failure while the server is
    # supposedly up -- proof the app crashed handling a REAL request, not "the
    # endpoint requires auth" (401/403/404 without a token are expected and ok).
    ok: bool
    detail: str = ""


class RuntimeApiAuditReport(ApiModel):
    project_id: str
    # False = this project's language/layout isn't covered yet (honest "not run",
    # never silently reported as passing). Only Python/FastAPI is supported today.
    supported: bool
    language: str | None = None
    started: bool = False  # the server process was launched
    ready: bool = False  # it answered ANY HTTP request before the startup timeout
    reason: str = ""  # why supported=False, or why started/ready is False
    checks: list[RuntimeEndpointCheck] = Field(default_factory=list)
    endpoints_total: int = 0
    # A bounded sweep (see _MAX_ENDPOINTS) -- this is how many were left untested,
    # so the report never silently implies full coverage.
    endpoints_skipped: int = 0
    crash_count: int = 0
    startup_log_tail: str = ""
    generated_at: str
