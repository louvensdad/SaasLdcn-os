from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

# Functional Coverage (Product Certification Engine P1, first slice): static
# detection of real functional WIRING, not just presence -- a button that
# exists but has no handler, a form with no real submit, a screen that never
# calls its API. Same regex/heuristic philosophy as the rest of this codebase
# (import_graph_engine.py's own docstring: "a static, regex-based reader ...
# a regex parser can false-positive") -- so findings carry an explicit
# confidence level instead of a flat pass/fail, and only confirmed_error
# (multiple independent signals agreeing) is allowed to block certification.

FunctionalCoverageConfidence = Literal["confirmed_error", "high_confidence", "warning", "informational"]


class FunctionalCoverageFinding(ApiModel):
    id: str
    category: str
    confidence: FunctionalCoverageConfidence
    file: str | None = None
    detail: str
    evidence: list[str] = Field(default_factory=list)


class ApplicationFunctionalCoverage(ApiModel):
    application: Literal["frontend", "mobile"]
    score: int = 100
    findings: list[FunctionalCoverageFinding] = Field(default_factory=list)
    blocking: bool = False


class FunctionalCoverageReport(ApiModel):
    project_id: str
    frontend: ApplicationFunctionalCoverage | None = None
    mobile: ApplicationFunctionalCoverage | None = None
    generated_at: str
