from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

# Severity drives the release gate:
#   BLOCKER -> cannot deliver (build broken, missing mandatory file, secret, traversal…)
#   WARNING -> can deliver with a warning (docs/coverage/SEO…)
#   INFO    -> suggestion only
QualityIssueSeverity = Literal["BLOCKER", "WARNING", "INFO"]
QualityIssueFixStatus = Literal["pending", "applied", "failed", "skipped"]


class QualityIssue(ApiModel):
    id: str
    title: str
    severity: QualityIssueSeverity
    category: str
    file: str | None = None
    root_cause: str
    suggested_fix: str
    auto_fixable: bool = False
    fix_status: QualityIssueFixStatus = "pending"


class QualityGateReport(ApiModel):
    project_id: str
    passed: bool  # no BLOCKER issues
    can_release: bool  # passed OR a conscious release override is on the project
    release_override: bool = False
    score: int
    built: bool  # True when the real build (npm/pip/mvn) was run for this report
    blocker_count: int = 0
    warning_count: int = 0
    info_count: int = 0
    issues: list[QualityIssue] = Field(default_factory=list)
    generated_at: str
