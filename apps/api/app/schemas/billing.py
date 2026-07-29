from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class UsageSummaryItem(ApiModel):
    resource_type: str
    quantity: float
    unit: str


class UsageSummary(ApiModel):
    period_start: str
    items: list[UsageSummaryItem] = Field(default_factory=list)


class EntitlementCheck(ApiModel):
    resource_type: str
    used: float
    monthly_limit: float | None = None  # None = unlimited (no invented default)
    allowed: bool
    period_start: str


class SetEntitlementLimitRequest(ApiModel):
    resource_type: str = Field(min_length=1, max_length=60)
    monthly_limit: float = Field(gt=0)
