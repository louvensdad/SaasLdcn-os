from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.engines.infra_cost_estimation_engine import estimate
from app.schemas.infra_cost import EstimateInfraCostRequest, InfraCostEstimate
from app.services.llm_settings_service import llm_provider_resolver

router = APIRouter(tags=["infra-cost"])


@router.post("/infra-cost/estimate", response_model=InfraCostEstimate)
def estimate_infra_cost(payload: EstimateInfraCostRequest, user: CurrentUser) -> InfraCostEstimate:
    """Pre-deploy cost estimate (vault 36 - Custos/Sistema de custos
    inteligentes.md), scoped to a one-way estimate -- see
    infra_pricing_registry.py for why "custo real vs estimado" is not
    implemented. Premium path uses a real LLM to explain the tradeoffs when
    available; degrades to a deterministic template otherwise, never silently."""
    context = llm_provider_resolver.resolve(
        workspace_id=None, user_id=user["user_id"], requested_capability="infra_cost_estimate",
        requested_model=payload.user_model_choice,
    )
    api_key = context.api_key if context.resolution.mode == "llm" else None
    return estimate(payload.spec, payload.blueprint, api_key=api_key, user_model_choice=payload.user_model_choice)
