from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.orchestrator import ProjectSpec

StageStatus = Literal["passed", "attention"]


class DeepAnalyzeRequest(ApiModel):
    spec: ProjectSpec
    blueprint: dict | None = None
    pace: bool = True  # deliberate per-stage pacing on the stream (disable for tests)
RiskLevel = Literal["low", "medium", "high"]


class DeepDecision(ApiModel):
    decision: str
    rationale: str
    alternatives: list[str] = Field(default_factory=list)
    trade_offs: str = ""


class DeepStage(ApiModel):
    id: str
    title: str
    summary: str
    details: list[str] = Field(default_factory=list)
    metrics: dict[str, int] = Field(default_factory=dict)
    status: StageStatus = "passed"


class DeepEngineeringAnalysis(ApiModel):
    contractVersion: str
    title: str
    product_summary: str
    entity_count: int = 0
    endpoint_count: int = 0
    workflow_count: int = 0
    rule_count: int = 0
    component_count: int = 0
    complexity: str = "unknown"
    risk_level: RiskLevel = "low"
    effort_estimate: str = ""
    confidence: float = 0.0
    decisions: list[DeepDecision] = Field(default_factory=list)
    stages: list[DeepStage] = Field(default_factory=list)
    security_considerations: list[str] = Field(default_factory=list)
    validation_criteria: list[str] = Field(default_factory=list)
    generated_at: str
