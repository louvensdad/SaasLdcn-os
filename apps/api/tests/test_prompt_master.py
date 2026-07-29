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
        "project_requirements": {
            "project_goal": "Deliver a governed enterprise application.",
            "business_context": "Commercial SaaS operation.",
            "target_users": ["operators", "customers"],
            "business_rules": ["Authorized users manage records."],
            "entities": ["User", "Subscription"],
            "workflows": ["Customer request is reviewed by an operator."],
            "constraints": ["Protect personal data."],
            "delivery_target": "github",
        },
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
        "Required Files",
        "Capability Plan",
        "Security Requirements",
        "Data Model Hints",
        "Testing Requirements",
        "Documentation Requirements",
        "Quality Gates",
        "Forbidden Decisions",
        "Forbidden Files",
        "Generation Constraints",
        "Locale / Language Rules",
        "Trace",
    ]


def test_prompt_master_declares_required_and_forbidden_files(client):
    blueprint = _build_blueprint(client)

    response = client.post("/api/prompt-master/preview", json={"blueprint": blueprint})

    assert response.status_code == 200
    sections = {item["id"]: item for item in response.json()["sections"]}
    required_files = sections["required_files"]
    forbidden_files = sections["forbidden_files"]
    assert "package.json" in required_files["bullets"]
    assert "src/main.ts" in required_files["bullets"]
    assert any("README.md" in item for item in required_files["bullets"])
    assert any(".env" in item for item in forbidden_files["bullets"])
    assert any("NestJS" in item or "nestjs" in item for item in forbidden_files["bullets"])


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


def test_prompt_master_preview_by_blueprint_id(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_blueprint_prompt_master(client, blueprint)
    gatekeeper = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    ).json()
    saved = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    ).json()

    response = client.post(
        "/api/prompt-master/preview",
        json={"blueprint_id": saved["blueprint_snapshot"]["blueprint_id"]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["blueprint_id"] == blueprint["blueprint_id"]
    assert payload["project_name"] == blueprint["project_name"]


def test_prompt_master_preview_by_unknown_blueprint_id_returns_404(client):
    response = client.post("/api/prompt-master/preview", json={"blueprint_id": "does-not-exist"})

    assert response.status_code == 404


def _build_blueprint_prompt_master(client, blueprint: dict):
    response = client.post("/api/prompt-master/preview", json={"blueprint": blueprint})
    assert response.status_code == 200
    return response.json()
