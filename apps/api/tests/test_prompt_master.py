from __future__ import annotations


def _build_blueprint(client, *, valid: bool = True):
    payload = {
        "project_name": "ldcn-enterprise-app" if valid else "ldcn-invalid-app",
        "language_id": "typescript",
        "runtime_id": "nodejs",
        "framework_id": "nestjs",
        "architecture_id": "modular_monolith",
        "archetype_id": "ai_saas",
        "capability_ids": ["authentication", "rbac", "ai_chat", "analytics"] if valid else ["authentication"],
        "business_module_ids": ["users", "notifications", "reports", "subscriptions"] if valid else ["users", "notifications"],
        "endpoint_ids": ["auth.login", "auth.register", "auth.me", "ai.chat", "analytics.overview"] if valid else ["auth.login", "ai.chat"],
        "locale": "pt-BR",
        "generation_mode": "local_build_90",
    }
    response = client.post("/api/blueprints/preview", json=payload)
    assert response.status_code == 200
    return response.json()


def test_prompt_master_preview_valid(client):
    blueprint = _build_blueprint(client)

    response = client.post("/api/prompt-master/preview", json={"blueprint": blueprint})

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_blueprint_valid"] is True
    assert payload["validation"]["valid"] is True
    assert payload["project_name"] == blueprint["project_name"]
    assert "Product Intent" in payload["compiled_prompt"]


def test_prompt_master_preview_invalid_blueprint_returns_valid_false(client):
    blueprint = _build_blueprint(client, valid=False)

    response = client.post("/api/prompt-master/preview", json={"blueprint": blueprint})

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_blueprint_valid"] is False
    assert payload["validation"]["valid"] is False
    assert any(item["code"] == "source_blueprint_invalid" for item in payload["validation"]["errors"])


def test_prompt_master_contains_all_mandatory_sections(client):
    blueprint = _build_blueprint(client)

    response = client.post("/api/prompt-master/preview", json={"blueprint": blueprint})

    assert response.status_code == 200
    section_titles = [item["title"] for item in response.json()["sections"]]
    assert section_titles == [
        "Product Intent",
        "Technology Graph",
        "Architecture Profile",
        "Business Modules",
        "Endpoint Plan",
        "Capability Plan",
        "Security Requirements",
        "Data Model Hints",
        "Testing Requirements",
        "Documentation Requirements",
        "Quality Gates",
        "Forbidden Decisions",
        "Generation Constraints",
        "Locale / Language Rules",
        "Trace",
    ]


def test_prompt_master_trace_does_not_contain_secrets(client):
    blueprint = _build_blueprint(client)

    response = client.post("/api/prompt-master/preview", json={"blueprint": blueprint})

    assert response.status_code == 200
    payload = response.json()
    trace = payload["trace"]
    assert trace["contains_secrets"] is False
    serialized_trace = str(trace["source_selection_ids"]).lower()
    assert "secret" not in serialized_trace
    assert "token" not in serialized_trace
    assert "password" not in serialized_trace


def test_prompt_master_preview_payload_without_blueprint_returns_422(client):
    response = client.post("/api/prompt-master/preview", json={})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
