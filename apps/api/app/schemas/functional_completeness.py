from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

# Build passing is necessary but not sufficient: a project can compile cleanly
# and still ship an empty product (Dashboard-only frontend, Login-only mobile,
# a Java package literally named `interface`). This status is a stricter,
# deterministic release verdict layered on top of QualityGateReport.
#   VERIFIED           -> build passed AND resource/UI coverage is real
#   PARTIALLY_VERIFIED -> build passed but coverage is thin, or the build was
#                         only reached via the bounded auto-repair fallback
#                         (SKIPPED_AFTER_FAILURE) -- usable, not delivery-grade
#   BLOCKED             -> a structural defect makes the project unsafe/broken
#                         regardless of coverage (reserved-word package,
#                         duplicate backend trees, leaked protocol markers,
#                         a documented service/file that doesn't exist)
#   NEEDS_HUMAN_REVIEW  -> resource discovery couldn't run for this stack;
#                         never silently treated as passing
CompletenessStatus = Literal["VERIFIED", "PARTIALLY_VERIFIED", "BLOCKED", "NEEDS_HUMAN_REVIEW"]
CompletenessIssueSeverity = Literal["BLOCKER", "WARNING", "INFO"]


class CompletenessIssue(ApiModel):
    id: str
    title: str
    severity: CompletenessIssueSeverity
    category: str
    file: str | None = None
    detail: str


class BackendResourceCoverage(ApiModel):
    controller: bool = False
    service: bool = False
    repository: bool = False
    endpoints: list[str] = Field(default_factory=list)


class FrontendResourceCoverage(ApiModel):
    listPage: bool = False
    createPage: bool = False
    editPage: bool = False
    detailPage: bool = False
    deletePage: bool = False
    apiClient: bool = False
    inMenu: bool = False


class MobileResourceCoverage(ApiModel):
    listScreen: bool = False
    detailScreen: bool = False
    deleteScreen: bool = False
    apiClient: bool = False


class ResourceCoverage(ApiModel):
    resource: str
    backend: BackendResourceCoverage
    frontend: FrontendResourceCoverage | None = None
    mobile: MobileResourceCoverage | None = None
    coverage: int = 0  # 0-100, weighted presence across backend/frontend/mobile


class UiDepthScore(ApiModel):
    page_count: int = 0
    form_count: int = 0
    list_or_table_count: int = 0
    api_call_count: int = 0
    loading_state_hits: int = 0
    error_state_hits: int = 0
    empty_state_hits: int = 0
    nav_link_count: int = 0
    has_auth_guard: bool = False
    score: int = 0


class FunctionalCompletenessReport(ApiModel):
    project_id: str
    status: CompletenessStatus
    backend_completeness: int = 0
    frontend_completeness: int | None = None
    mobile_completeness: int | None = None
    # Engineering Policy gap #4: the remaining 6 of the policy's 10 categories.
    # Security/Integrations are read-only, informational percentages derived
    # from QualityGateEngine's own findings -- they never feed back into this
    # report's own issues/status (that boundary stays exactly as documented at
    # the top of functional_completeness_engine.py: this is a coverage gate,
    # QualityGateEngine is the quality/security gate).
    security_completeness: int | None = None
    documentation_completeness: int | None = None
    tests_completeness: int | None = None
    api_coverage_completeness: int | None = None
    build_completeness: int | None = None
    integrations_completeness: int | None = None
    resources: list[ResourceCoverage] = Field(default_factory=list)
    ui_depth: UiDepthScore | None = None
    issues: list[CompletenessIssue] = Field(default_factory=list)
    missing_features: list[str] = Field(default_factory=list)
    build_skipped: bool = False
    generated_at: str
