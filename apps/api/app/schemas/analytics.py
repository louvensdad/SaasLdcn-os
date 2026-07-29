"""Analytics Center V1 response contracts.

Field names mirror the existing frontend types in `apps/web/lib/api/analytics.ts`
(`AnalyticsMetric`, `AnalyticsSection`, `AnalyticsFilterOptions`,
`AnalyticsOverviewResponse`) so the Analytics Center page consumes this payload
without any adapter. Extra, non-sensitive fields (`source`, section `status` /
`reason`) are additive and safely ignored by the frontend.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

MetricSeverity = Literal["neutral", "positive", "warning", "critical"]
SectionStatus = Literal["available", "empty", "error"]


class AnalyticsMetric(BaseModel):
    id: str
    label: str
    value: float | int | None = None
    unit: str | None = None
    # Frontend reads `change`; kept nullable because V1 has no historical deltas.
    change: float | None = None
    severity: MetricSeverity = "neutral"
    drilldown_count: int | None = None
    # Which real module produced this metric (operational provenance).
    source: str | None = None


class AnalyticsSeriesPoint(BaseModel):
    label: str
    value: float | int
    series: str | None = None


class AnalyticsSection(BaseModel):
    id: str
    title: str
    description: str | None = None
    # `available` with data, `empty` with a reason, or `error` if the collector
    # failed in isolation (the rest of the response still succeeds).
    status: SectionStatus = "available"
    reason: str | None = None
    metrics: list[AnalyticsMetric] = Field(default_factory=list)
    series: list[AnalyticsSeriesPoint] = Field(default_factory=list)
    # Drill-down rows. Arbitrary, already-redacted, JSON-safe dicts; each has an `id`.
    records: list[dict[str, Any]] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)


class AnalyticsFilterOptions(BaseModel):
    workspaces: list[str] = Field(default_factory=list)
    project_types: list[str] = Field(default_factory=list)
    providers: list[str] = Field(default_factory=list)
    stacks: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=list)
    modules: list[str] = Field(default_factory=list)
    severities: list[str] = Field(default_factory=list)
    agents: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    frameworks: list[str] = Field(default_factory=list)


class AnalyticsOverviewResponse(BaseModel):
    generated_at: str
    period_start: str | None = None
    period_end: str | None = None
    metrics: list[AnalyticsMetric] = Field(default_factory=list)
    sections: list[AnalyticsSection] = Field(default_factory=list)
    filters: AnalyticsFilterOptions = Field(default_factory=AnalyticsFilterOptions)
