from __future__ import annotations

from app.data.model_registry import resolve_model
from app.engines.performance_review_engine import performance_review_engine
from app.registry.execution_profiles_registry import (
    EXECUTION_PROFILES,
    list_execution_profiles,
    resolve_execution_profile,
)
from app.schemas.execution_profile import ExecutionProfile
from app.schemas.generation_validation import BuildRuntimeMetrics
from app.schemas.orchestrator import ProjectSpec
from app.schemas.project_room import CreateRoomRequest


def test_all_three_profiles_are_registered_with_the_spec_values():
    assert set(EXECUTION_PROFILES) == {"economy", "professional", "enterprise"}

    economy = EXECUTION_PROFILES["economy"]
    assert economy.model_strategy == "economy"
    assert economy.max_repair_cycles == 1
    assert economy.enable_architecture_review is False
    assert economy.enable_security_review is False
    assert economy.enable_performance_review is False
    assert economy.enable_import_graph is False
    assert economy.enable_dependency_graph is False
    assert economy.enable_runtime_validation is False
    assert economy.enable_deep_project_planning is False
    assert economy.recommended is False

    professional = EXECUTION_PROFILES["professional"]
    assert professional.model_strategy == "balanced"
    assert professional.max_repair_cycles == 2  # today's MAX_AUTO_REPAIR_ATTEMPTS default
    assert professional.enable_architecture_review is True
    assert professional.enable_security_review is True
    assert professional.enable_performance_review is False
    assert professional.enable_import_graph is True
    assert professional.enable_dependency_graph is True
    assert professional.recommended is True

    enterprise = EXECUTION_PROFILES["enterprise"]
    assert enterprise.model_strategy == "premium"
    assert enterprise.max_repair_cycles == 3
    assert enterprise.enable_architecture_review is True
    assert enterprise.enable_security_review is True
    assert enterprise.enable_performance_review is True
    assert enterprise.enable_import_graph is True
    assert enterprise.enable_dependency_graph is True
    assert enterprise.enable_runtime_validation is True
    assert enterprise.enable_deep_project_planning is True
    assert enterprise.recommended is False

    # No profile is allowed to skip the two absolute guarantees.
    for profile in EXECUTION_PROFILES.values():
        assert profile.enable_build_guarantee is True
        assert profile.enable_product_certification is True
        assert profile.max_repair_cycles >= 1


def test_resolve_execution_profile_falls_back_to_professional():
    assert resolve_execution_profile(None).id == "professional"
    assert resolve_execution_profile("").id == "professional"
    assert resolve_execution_profile("not-a-real-profile").id == "professional"
    assert resolve_execution_profile("enterprise").id == "enterprise"


def test_list_execution_profiles_matches_the_get_endpoint_shape():
    summaries = list_execution_profiles()
    assert {s.id for s in summaries} == {"economy", "professional", "enterprise"}
    recommended = [s for s in summaries if s.recommended]
    assert [s.id for s in recommended] == ["professional"]


def test_execution_profiles_endpoint_returns_the_three_profiles(client):
    response = client.get("/api/execution-profiles")

    assert response.status_code == 200
    payload = response.json()
    assert {item["id"] for item in payload} == {"economy", "professional", "enterprise"}
    professional = next(item for item in payload if item["id"] == "professional")
    assert professional["recommended"] is True
    # Public shape stays minimal -- internal flags never leak to the list endpoint.
    assert "enable_security_review" not in professional


def test_project_spec_defaults_execution_profile_to_professional():
    spec = ProjectSpec(raw_intent="idea")
    assert spec.execution_profile == "professional"

    dumped = spec.model_dump(mode="json")
    assert dumped["execution_profile"] == "professional"
    restored = ProjectSpec.model_validate(dumped)
    assert restored.execution_profile == "professional"


def test_project_spec_accepts_an_explicit_execution_profile():
    spec = ProjectSpec(raw_intent="idea", execution_profile="enterprise")
    assert spec.execution_profile == "enterprise"


def test_create_room_request_defaults_execution_profile_to_professional():
    request = CreateRoomRequest(title="x")
    assert request.execution_profile == "professional"


def test_model_registry_applies_profile_overrides_but_user_choice_always_wins():
    # No profile: unchanged existing behavior (ROLE_MODEL_HINTS).
    assert resolve_model(agent_role="backend") == "claude-opus-4-8"
    # Economy forces a cheaper model for the same role.
    assert resolve_model(agent_role="backend", model_strategy="economy") == "claude-sonnet-4-6"
    # Enterprise (premium) keeps/forces the premium model.
    assert resolve_model(agent_role="backend", model_strategy="premium") == "claude-opus-4-8"
    # An explicit user choice always wins over any profile override.
    assert resolve_model(user_choice="claude-haiku-4-5", agent_role="backend", model_strategy="premium") == "claude-haiku-4-5"
    # Balanced/professional is not in the override table -- falls through to ROLE_MODEL_HINTS.
    assert resolve_model(agent_role="docs", model_strategy="economy") == "claude-haiku-4-5"


def test_performance_review_engine_only_emits_warnings(tmp_path):
    metrics = BuildRuntimeMetrics(build_ms=10 * 60 * 1000, peak_memory_mb=4096.0, total_ms=10 * 60 * 1000)
    report = performance_review_engine.evaluate("project-1", str(tmp_path), metrics)

    assert report.status == "WARNING"
    assert report.findings, "expected at least one finding for a slow, memory-heavy build"
    for finding in report.findings:
        assert finding.severity == "WARNING"


def test_performance_review_engine_is_ok_for_a_fast_lean_build(tmp_path):
    metrics = BuildRuntimeMetrics(build_ms=5_000, peak_memory_mb=256.0, total_ms=5_000)
    report = performance_review_engine.evaluate("project-1", str(tmp_path), metrics)

    assert report.status == "OK"
    assert report.findings == []


def test_performance_review_engine_handles_missing_metrics(tmp_path):
    report = performance_review_engine.evaluate("project-1", str(tmp_path), None)

    assert report.status == "OK"
    assert report.build_ms is None


def test_execution_profile_schema_roundtrips_through_json():
    profile = ExecutionProfile.model_validate(EXECUTION_PROFILES["enterprise"].model_dump(mode="json"))
    assert profile.id == "enterprise"
    assert profile.enable_runtime_validation is True
