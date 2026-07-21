from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class PlanView(ApiModel):
    code: str
    name: str
    audience: str
    price_cents: int | None = None
    currency: str
    features: list[str] = Field(default_factory=list)
    limits: dict[str, float | None] = Field(default_factory=dict)


class SubscriptionView(ApiModel):
    id: str
    organization_id: str
    plan_code: str
    status: str
    started_at: str
    current_period_end: str | None = None
    cancelled_at: str | None = None
    created_by_user_id: str


class TrialView(ApiModel):
    status: str
    started_at: str
    expires_at: str
    converted_at: str | None = None


class SubscribeRequest(ApiModel):
    plan_code: str = Field(min_length=1, max_length=40)
    organization_id: str | None = None
