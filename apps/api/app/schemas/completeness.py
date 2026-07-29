from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

CoverageKind = Literal["business_rule", "workflow", "entity"]
CoverageStatus = Literal["covered", "partial", "missing"]


class RuleCoverage(ApiModel):
    item: str
    kind: CoverageKind
    status: CoverageStatus
    evidence: list[str] = Field(default_factory=list)
    note: str = ""


class CompletenessReport(ApiModel):
    project_id: str
    completeness_score: int = Field(ge=0, le=100)
    items: list[RuleCoverage] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    degraded: bool = False
