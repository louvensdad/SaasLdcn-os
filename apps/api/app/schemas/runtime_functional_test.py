from __future__ import annotations

from typing import Literal

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


class ResponsiveCheck(ApiModel):
    """One real breakpoint pass (PARTE 8, item 11) -- a real Playwright
    viewport resize + a real DOM measurement (scrollWidth vs. clientWidth),
    not a guess from the markup."""

    viewport: Literal["mobile", "tablet", "desktop"]
    width: int
    height: int
    horizontal_overflow: bool
    overflow_px: int = 0
    screenshot_path: str | None = None


class AccessibilityFinding(ApiModel):
    """One real DOM-level accessibility check (PARTE 8, item 12) -- baseline,
    deterministic checks (missing alt/label/lang/accessible-name), not a
    heuristic guess and not a third-party audit library dependency."""

    rule: str
    severity: Literal["error", "warning"]
    detail: str
    count: int = 1


class RouteCheck(ApiModel):
    path: str
    ok: bool
    http_status: int | None = None
    redirected_to: str | None = None  # e.g. "/login" -- expected on an auth-gated route, not a failure
    console_errors: list[str] = Field(default_factory=list)
    network_failures: list[str] = Field(default_factory=list)  # "{method} {url} -> {status}"
    screenshot_path: str | None = None
    detail: str = ""
    responsive: list[ResponsiveCheck] = Field(default_factory=list)
    accessibility: list[AccessibilityFinding] = Field(default_factory=list)


class RuntimeFunctionalTestReport(ApiModel):
    project_id: str
    supported: bool
    reason: str = ""
    backend_started: bool = False
    frontend_started: bool = False
    routes: list[RouteCheck] = Field(default_factory=list)
    crash_count: int = 0
    generated_at: str


class RouteComparison(ApiModel):
    """PARTE 8: 'comparar evidencia anterior e nova' -- one route's before/
    after state across two RuntimeFunctionalTestReport runs (pre- and
    post-repair)."""

    path: str
    previously_ok: bool
    now_ok: bool
    regressed: bool  # was ok, now broken -- the repair made this route worse
    recovered: bool  # was broken, now ok -- the repair actually fixed it
    new_console_errors: list[str] = Field(default_factory=list)
    resolved_console_errors: list[str] = Field(default_factory=list)


class RuntimeFunctionalTestComparison(ApiModel):
    project_id: str
    routes: list[RouteComparison] = Field(default_factory=list)
    regressed_count: int = 0
    recovered_count: int = 0
    generated_at: str
