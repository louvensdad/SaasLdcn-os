from __future__ import annotations


def _build_blueprint(client, *, valid: bool = True, insecure: bool = False):
    capability_ids = ["authentication", "rbac", "analytics", "observability"]
    business_module_ids = ["users", "reports", "subscriptions"]
    endpoint_ids = ["auth.login", "auth.register", "auth.me", "analytics.overview"]
    archetype_id = "ai_saas"
    if not valid:
        capability_ids = ["authentication"]
        business_module_ids = ["users"]
        endpoint_ids = ["auth.login", "ai.chat"]
    if insecure:
        capability_ids = ["authentication", "analytics"]
        business_module_ids = ["users", "reports", "subscriptions", "notifications"]
        endpoint_ids = ["auth.login", "auth.register", "auth.me", "analytics.overview"]
        archetype_id = "saas_dashboard"

    response = client.post(
        "/api/blueprints/preview",
        json={
            "project_name": "ldcn-gatekeeper-app",
            "language_id": "typescript",
            "runtime_id": "nodejs",
            "framework_id": "nestjs",
            "architecture_id": "modular_monolith",
            "archetype_id": archetype_id,
            "capability_ids": capability_ids,
            "business_module_ids": business_module_ids,
            "endpoint_ids": endpoint_ids,
            "locale": "pt-BR",
            "generation_mode": "local_build_90",
            "project_requirements": {
                "project_goal": "Deliver a governed SaaS application.",
                "business_context": "Commercial SaaS operation.",
                "target_users": ["operators", "customers"],
                "business_rules": ["Authorized users manage records."],
                "entities": ["User", "Account"],
                "workflows": ["Customer request is reviewed by an operator."],
                "constraints": ["Protect personal data."],
                "delivery_target": "github",
            },
        },
    )
    assert response.status_code == 200
    return response.json()


def _build_prompt_master(client, blueprint: dict):
    response = client.post("/api/prompt-master/preview", json={"blueprint": blueprint})
    assert response.status_code == 200
    return response.json()


def test_gatekeeper_preview_approved(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)

    response = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "approved"
    assert len(payload["checks"]) == 17
    assert all(check["status"] == "passed" for check in payload["checks"])


def test_gatekeeper_prompt_master_invalid_blocks(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    prompt_master["validation"]["valid"] = False
    prompt_master["validation"]["errors"] = [
        {
            "code": "manual_prompt_master_failure",
            "message": "Prompt Master was manually invalidated for test coverage.",
            "related_section_ids": ["quality_gates"],
        }
    ]

    response = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert any(check["id"] == "generation_constraint_check" or check["status"] == "failed" for check in payload["checks"])


def test_gatekeeper_blueprint_invalid_blocks(client):
    blueprint = _build_blueprint(client, valid=False)
    prompt_master = _build_prompt_master(client, blueprint)

    response = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert any(check["id"] == "capability_dependency_check" and check["status"] == "failed" for check in payload["checks"])


def test_gatekeeper_endpoint_without_capability_blocks(client):
    blueprint = _build_blueprint(client, valid=False)
    prompt_master = _build_prompt_master(client, blueprint)

    response = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    )

    assert response.status_code == 200
    payload = response.json()
    endpoint_check = next(check for check in payload["checks"] if check["id"] == "capability_dependency_check")
    assert endpoint_check["status"] == "failed"
    assert any("dependency" in blocker.lower() for blocker in endpoint_check["blockers"])


def test_gatekeeper_missing_security_baseline_generates_warnings(client):
    blueprint = _build_blueprint(client, insecure=True)
    prompt_master = _build_prompt_master(client, blueprint)

    response = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "approved_with_warnings"
    security_check = next(check for check in payload["checks"] if check["id"] == "security_baseline_check")
    assert security_check["status"] == "warning"
    assert security_check["warnings"]


def test_gatekeeper_microservices_without_observability_blocks(client):
    response = client.post(
        "/api/blueprints/preview",
        json={
            "project_name": "ldcn-microservices-gap",
            "language_id": "java",
            "runtime_id": "jvm",
            "framework_id": "spring_boot",
            "architecture_id": "microservices",
            "archetype_id": "microservice_api",
            "capability_ids": ["authentication", "queue"],
            "business_module_ids": ["users"],
            "endpoint_ids": ["auth.login"],
            "locale": "pt-BR",
            "generation_mode": "local_build_90",
            "project_requirements": {
                "project_goal": "Deliver a governed service.",
                "business_context": "Commercial service operation.",
                "target_users": ["operators"],
                "business_rules": ["Authorized users manage records."],
                "entities": ["User"],
                "workflows": ["Operator handles requests."],
                "constraints": ["Protect personal data."],
                "delivery_target": "github",
            },
        },
    )
    assert response.status_code == 200
    blueprint = response.json()
    prompt_master = _build_prompt_master(client, blueprint)

    response = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    capability_check = next(check for check in payload["checks"] if check["id"] == "capability_dependency_check")
    assert capability_check["status"] == "failed"
    assert any("observability" in blocker.lower() for blocker in payload["blockers"])


def test_gatekeeper_trace_does_not_contain_secrets(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)

    response = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["trace"]["contains_secrets"] is False
    serialized = str(payload["trace"]).lower()
    assert "password=" not in serialized
    assert "token=" not in serialized
    assert "secret=" not in serialized
