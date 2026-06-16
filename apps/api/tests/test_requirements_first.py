from __future__ import annotations


def _base_payload() -> dict:
    return {
        "project_name": "requirements-first",
        "language_id": "typescript",
        "runtime_id": "nodejs",
        "framework_id": "nestjs",
        "architecture_id": "modular_monolith",
        "archetype_id": "rest_api",
        "capability_ids": ["analytics"],
        "business_module_ids": ["reports"],
        "endpoint_ids": ["analytics.overview"],
        "locale": "pt-BR",
        "generation_mode": "local_build_90",
    }


def test_blueprint_without_requirements_is_invalid(client):
    response = client.post("/api/blueprints/preview", json=_base_payload())

    assert response.status_code == 200
    payload = response.json()
    assert payload["validation"]["valid"] is False
    codes = {item["code"] for item in payload["validation"]["errors"]}
    assert "requirements_project_goal_missing" in codes
    assert "requirements_business_rules_missing" in codes
    assert "requirements_delivery_target_missing" in codes


def test_gatekeeper_blocks_incomplete_requirements(client):
    blueprint = client.post("/api/blueprints/preview", json=_base_payload()).json()
    prompt_master = client.post("/api/prompt-master/preview", json={"blueprint": blueprint}).json()

    report = client.post("/api/gatekeeper/preview", json={"blueprint": blueprint, "prompt_master": prompt_master}).json()

    assert report["decision"] == "blocked"
    checks = {item["id"]: item for item in report["checks"]}
    assert checks["requirements_completeness_check"]["status"] == "failed"
    assert checks["business_rules_check"]["status"] == "failed"
    assert checks["entity_model_check"]["status"] == "failed"
    assert checks["delivery_target_check"]["status"] == "failed"
