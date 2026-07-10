from __future__ import annotations

from app.engines.agent_foundation_engine import (
    PHASE7_REQUIRED_ROLE_IDS,
    get_agent_foundation_status,
    list_agent_roles,
)

MANDATORY_AGENT_IDS = {
    "orchestrator",
    "prompt_master",
    "architect",
    "stack_specialist",
    "frontend",
    "backend",
    "security",
    "testing",
    "gatekeeper",
    "download",
    "template",
    "ui_ux",
    "ldcn",
}


def test_agent_foundation_catalog_declares_all_required_roles():
    roles = list_agent_roles()
    role_ids = {role.id for role in roles}

    assert role_ids == MANDATORY_AGENT_IDS
    assert set(PHASE7_REQUIRED_ROLE_IDS) <= role_ids
    for role in roles:
        assert role.purpose
        assert role.input_contract
        assert role.output_contract
        assert role.boundary
        assert role.test_coverage_id
        assert role.llm_required is False
        assert role.direct_actions_allowed is False


def test_agent_foundation_role_isolation_and_orchestrator_control():
    roles = {role.id: role for role in list_agent_roles()}

    assert roles["orchestrator"].orchestrated_by is None
    for role_id, role in roles.items():
        if role_id != "orchestrator":
            assert role.orchestrated_by == "orchestrator"
            assert "bypass_orchestrator" in role.forbidden_actions
        assert role.filesystem_access == "none"
        assert role.network_access == "none"
        assert "direct_filesystem_write" in role.forbidden_actions
        assert "direct_network_call" in role.forbidden_actions
        assert "direct_provider_call" in role.forbidden_actions


def test_agent_foundation_security_and_testing_roles_are_review_only():
    roles = {role.id: role for role in list_agent_roles()}

    security = roles["security"]
    testing = roles["testing"]
    assert "block" in security.boundary.lower()
    assert "critical findings" in security.boundary.lower()
    assert "must not mark execution as passed" in testing.boundary
    assert security.direct_actions_allowed is False
    assert testing.direct_actions_allowed is False


def test_agent_foundation_gatekeeper_is_last_decision_role():
    status = get_agent_foundation_status()

    assert status.external_llm_required is False
    assert status.orchestrator_controls_execution is True
    assert status.orchestration_sequence[0] == "orchestrator"
    assert status.orchestration_sequence.index("security") < status.orchestration_sequence.index("gatekeeper")
    assert status.orchestration_sequence.index("testing") < status.orchestration_sequence.index("gatekeeper")
    assert status.orchestration_sequence.index("gatekeeper") < status.orchestration_sequence.index("download")


def test_agent_foundation_route_returns_local_catalog(client):
    response = client.get("/api/agents/foundation")

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "local_foundation"
    assert payload["external_llm_required"] is False
    assert payload["orchestrator_controls_execution"] is True
    assert {role["id"] for role in payload["roles"]} == MANDATORY_AGENT_IDS