from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class PerformanceFinding(ApiModel):
    id: str
    title: str
    severity: Literal["WARNING"] = "WARNING"
    detail: str
    metric: str
    value: float
    threshold: float


class PerformanceReviewReport(ApiModel):
    """Enterprise-only Performance Review: real build metrics already captured
    by the Build Guarantee loop, plus a frontend built-output size check.
    WARNING-only by design — performance must never block the "no broken
    code" guarantee every profile keeps."""

    project_id: str
    status: Literal["OK", "WARNING"]
    findings: list[PerformanceFinding] = Field(default_factory=list)
    build_ms: int | None = None
    peak_memory_mb: float | None = None
    cpu_seconds: float | None = None
    frontend_bundle_bytes: int | None = None
    generated_at: str
