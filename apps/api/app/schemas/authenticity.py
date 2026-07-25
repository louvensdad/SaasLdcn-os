from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

# Frontend Authenticity Review Gate (PARTE 7 of the request): static detection
# of content that makes a generated frontend look like an unfinished AI
# template rather than a real product -- lorem ipsum, generic marketing
# filler copy, generic placeholder imagery, and mock data leaking into a real
# page/component instead of staying in the designated mock/repository layer.
# Same confidence-tagged-finding philosophy as FunctionalCoverageReport (see
# functional_coverage_engine.py's own docstring): a regex/heuristic detector
# can false-positive, so only "confirmed_error" is allowed to block.

AuthenticityConfidence = Literal["confirmed_error", "high_confidence", "warning", "informational"]


class AuthenticityFinding(ApiModel):
    id: str
    category: str
    confidence: AuthenticityConfidence
    file: str | None = None
    detail: str
    evidence: list[str] = Field(default_factory=list)


class AuthenticityReport(ApiModel):
    project_id: str
    score: int = 100
    findings: list[AuthenticityFinding] = Field(default_factory=list)
    blocking: bool = False
    generated_at: str
