from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel

# Runtime Functional Test (Product Certification Engine P1, third slice): start
# the generated backend + frontend for real and drive a real headless browser
# through it -- everything before this was static analysis. Scope, confirmed
# with the user before building: no login (only unauthenticated flows), host
# execution only (dev/local, same gate HostExecutionRuntime already enforces),
# Python/FastAPI backend + Next.js/React frontend only -- anything else is an
# honest supported=False, never a false pass (same pattern runtime_api_audit_service.py
# already established).


class RouteCheck(ApiModel):
    path: str
    ok: bool
    http_status: int | None = None
    redirected_to: str | None = None  # e.g. "/login" -- expected on an auth-gated route, not a failure
    console_errors: list[str] = Field(default_factory=list)
    network_failures: list[str] = Field(default_factory=list)  # "{method} {url} -> {status}"
    screenshot_path: str | None = None
    detail: str = ""


class RuntimeFunctionalTestReport(ApiModel):
    project_id: str
    supported: bool
    reason: str = ""
    backend_started: bool = False
    frontend_started: bool = False
    routes: list[RouteCheck] = Field(default_factory=list)
    crash_count: int = 0
    generated_at: str
