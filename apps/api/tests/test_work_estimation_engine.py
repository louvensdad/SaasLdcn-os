from __future__ import annotations

from app.engines.work_estimation_engine import estimate_generation_effort
from app.schemas.orchestrator import ProjectSpec, SuggestedStack

_NO_INSTANT_PHRASES = ("minuto", "instant")


def _spec(**overrides) -> ProjectSpec:
    defaults: dict = {"raw_intent": "teste", "delivery_type": "web"}
    defaults.update(overrides)
    return ProjectSpec(**defaults)


def test_minimal_spec_is_a_landing_page_with_no_padded_phases():
    estimate = estimate_generation_effort(_spec())
    assert estimate.size_band == "landing_page"
    phase_ids = {p.id for p in estimate.phases}
    assert phase_ids == {"architecture"}
    lowered = estimate.no_rush_message.lower()
    assert not any(phrase in lowered for phrase in _NO_INSTANT_PHRASES)


def test_medium_spec_gets_backend_and_frontend_but_no_mobile():
    estimate = estimate_generation_effort(
        _spec(entities=["User", "Order", "Product", "Invoice"], core_workflows=["checkout", "billing"])
    )
    assert estimate.size_band in {"api_simples", "saas"}
    phase_ids = {p.id for p in estimate.phases}
    assert {"backend", "frontend"} <= phase_ids
    assert "mobile" not in phase_ids


def test_full_stack_delivery_adds_a_mobile_phase():
    estimate = estimate_generation_effort(
        _spec(delivery_type="full_stack", entities=["User", "Order"], core_workflows=["checkout"])
    )
    assert "mobile" in {p.id for p in estimate.phases}


def test_web_only_delivery_never_adds_a_mobile_phase():
    estimate = estimate_generation_effort(_spec(delivery_type="web", entities=["User", "Order", "Product"]))
    assert "mobile" not in {p.id for p in estimate.phases}


def test_large_distributed_spec_with_security_signals_is_enterprise_and_high_risk():
    spec = _spec(
        delivery_type="full_stack",
        entities=[f"Entity{i}" for i in range(12)],
        core_workflows=["w1", "w2", "w3", "w4"],
        business_rules=["r1", "r2", "r3"],
        suggested_stack=SuggestedStack(architecture="microservices"),
        non_functional={"security": "LGPD compliance mandatory", "scale": "high"},
    )
    estimate = estimate_generation_effort(spec)
    assert estimate.size_band == "enterprise"
    assert estimate.risk_level == "Alto"
    assert estimate.complexity in {"Alta", "Enterprise"}


def test_no_rush_message_and_healthy_minimum_never_imply_instant_delivery():
    specs = [
        _spec(),
        _spec(entities=["A", "B"], core_workflows=["w"]),
        _spec(delivery_type="full_stack", entities=[f"E{i}" for i in range(8)], core_workflows=["w1", "w2"]),
    ]
    for spec in specs:
        estimate = estimate_generation_effort(spec)
        assert estimate.healthy_minimum_label
        assert estimate.no_rush_message
        lowered = (estimate.healthy_minimum_label + estimate.no_rush_message).lower()
        assert not any(phrase in lowered for phrase in _NO_INSTANT_PHRASES)


def test_more_blueprint_decisions_raise_the_score_relative_to_no_blueprint():
    spec = _spec(entities=["User", "Order"], core_workflows=["checkout"])
    without_blueprint = estimate_generation_effort(spec, None)
    with_blueprint = estimate_generation_effort(spec, {"decisions": [{}] * 15})
    # Same size band inputs, but more recorded architecture decisions should
    # never produce a *smaller* project than an otherwise-identical spec with
    # no blueprint at all.
    order = {"landing_page": 0, "api_simples": 1, "saas": 2, "enterprise": 3}
    assert order[with_blueprint.size_band] >= order[without_blueprint.size_band]
