from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.orchestrator import ProjectSpec


class LoadProfile(ApiModel):
    """A rough, explicitly-labeled pre-launch load estimate -- never a real
    measurement. See infra_cost_estimation_engine.estimate_load_profile()."""

    tier: str  # "micro" | "small" | "medium" | "large"
    size_band: str
    monthly_active_users_label: str
    storage_gb: float
    monthly_traffic_gb: float
    uncertainty_multiplier: float
    assumptions: list[str] = Field(default_factory=list)


class ProviderCostEstimate(ApiModel):
    provider_id: str
    provider_name: str
    estimated_monthly_usd_low: float
    estimated_monthly_usd_mid: float
    estimated_monthly_usd_high: float
    lock_in_risk: str
    tradeoffs: list[str] = Field(default_factory=list)


class InfraCostEstimate(ApiModel):
    load_profile: LoadProfile
    providers: list[ProviderCostEstimate]
    ai_explanation: str
    # True when no LLM was available and the deterministic template was used
    # instead -- never silently disguised as a real AI opinion.
    degraded: bool
    generated_at: str


class EstimateInfraCostRequest(ApiModel):
    spec: ProjectSpec
    blueprint: dict | None = None
    user_model_choice: str | None = None
