from __future__ import annotations

from app.data.infra_pricing_registry import PROVIDER_PRICING
from app.engines.infra_cost_estimation_engine import (
    estimate,
    estimate_load_profile,
    estimate_provider_costs,
)
from app.schemas.orchestrator import ProjectSpec, SuggestedStack


def _spec(*, entities=2, workflows=1, business_rules=1, delivery_type="web") -> ProjectSpec:
    return ProjectSpec(
        raw_intent="Loja online simples",
        product_summary="E-commerce simples",
        entities=[f"Entity{i}" for i in range(entities)],
        core_workflows=[f"Workflow{i}" for i in range(workflows)],
        business_rules=[f"Rule{i}" for i in range(business_rules)],
        delivery_type=delivery_type,
        suggested_stack=SuggestedStack(language="python", framework="fastapi"),
    )


# --------------------------------------------------------------- load profile

def test_small_spec_gets_a_micro_or_small_load_tier():
    profile = estimate_load_profile(_spec(entities=1, workflows=1, business_rules=0))
    assert profile.tier in ("micro", "small")
    assert profile.assumptions  # never empty -- every estimate states its premises


def test_larger_spec_gets_a_bigger_load_tier_than_a_smaller_one():
    small = estimate_load_profile(_spec(entities=1, workflows=1, business_rules=0))
    large = estimate_load_profile(_spec(entities=20, workflows=15, business_rules=10))
    tiers = ["micro", "small", "medium", "large"]
    assert tiers.index(large.tier) > tiers.index(small.tier)


def test_load_profile_carries_a_real_uncertainty_range_not_false_precision():
    profile = estimate_load_profile(_spec())
    assert profile.uncertainty_multiplier > 1.0


# --------------------------------------------------------------- provider cost comparison

def test_all_four_vault_named_providers_are_present_and_comparable():
    profile = estimate_load_profile(_spec())
    estimates = estimate_provider_costs(profile)
    ids = {item.provider_id for item in estimates}
    assert ids == {"aws", "azure", "railway", "render"}


def test_estimates_are_sorted_by_cost_and_low_le_mid_le_high():
    profile = estimate_load_profile(_spec(entities=20, workflows=15, business_rules=10))
    estimates = estimate_provider_costs(profile)
    costs = [item.estimated_monthly_usd_mid for item in estimates]
    assert costs == sorted(costs)
    for item in estimates:
        assert item.estimated_monthly_usd_low <= item.estimated_monthly_usd_mid <= item.estimated_monthly_usd_high


def test_bigger_load_tier_costs_more_on_every_provider():
    small_profile = estimate_load_profile(_spec(entities=1, workflows=1, business_rules=0))
    large_profile = estimate_load_profile(_spec(entities=30, workflows=20, business_rules=15))
    small_by_id = {e.provider_id: e.estimated_monthly_usd_mid for e in estimate_provider_costs(small_profile)}
    large_by_id = {e.provider_id: e.estimated_monthly_usd_mid for e in estimate_provider_costs(large_profile)}
    for provider_id in PROVIDER_PRICING:
        assert large_by_id[provider_id] > small_by_id[provider_id]


def test_every_provider_reports_a_lock_in_risk_and_tradeoffs():
    estimates = estimate_provider_costs(estimate_load_profile(_spec()))
    for item in estimates:
        assert item.lock_in_risk in ("Baixo", "Médio", "Alto")
        assert item.tradeoffs


# --------------------------------------------------------------- estimate() end-to-end + degrade

def test_estimate_without_llm_key_degrades_to_deterministic_explanation_not_silently():
    result = estimate(_spec(), api_key=None, use_llm=False)
    assert result.degraded is True
    assert result.ai_explanation  # never empty, grounded in the real comparison
    assert result.providers
    assert len(result.providers) == 4


def test_deterministic_explanation_cites_the_real_cheapest_provider_by_name():
    result = estimate(_spec(), api_key=None, use_llm=False)
    cheapest = min(result.providers, key=lambda p: p.estimated_monthly_usd_mid)
    assert cheapest.provider_name in result.ai_explanation


# --------------------------------------------------------------- route

def test_route_returns_a_degraded_estimate_without_any_llm_configured(client):
    response = client.post(
        "/api/infra-cost/estimate",
        json={"spec": _spec().model_dump(mode="json")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["degraded"] is True
    assert len(body["providers"]) == 4
    assert body["load_profile"]["assumptions"]
