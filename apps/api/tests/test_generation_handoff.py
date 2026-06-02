from __future__ import annotations

from app.routes.projects import service as project_service


def _build_blueprint(client, *, valid: bool = True):
    payload = {
        "project_name": "ldcn-handoff-ready" if valid else "ldcn-handoff-blocked",
        "language_id": "typescript",
        "runtime_id": "nodejs",
        "framework_id": "nestjs",
        "architecture_id": "modular_monolith",
        "archetype_id": "ai_saas",
        "capability_ids": ["authentication", "rbac", "ai_chat", "analytics", "rate_limiting", "observability"] if valid else ["authentication"],
        "business_module_ids": ["users", "reports", "subscriptions", "notifications"] if valid else ["users"],
        "endpoint_ids": ["auth.login", "auth.register", "auth.me", "analytics.overview", "ai.chat"] if valid else ["auth.login", "ai.chat"],
        "infrastructure_component_ids": ["postgresql", "redis", "opentelemetry"],
        "locale": "pt-BR",
        "generation_mode": "local_build_90",
    }
    response = client.post("/api/blueprints/preview", json=payload)
    assert response.status_code == 200
    return response.json()


def _create_project(client, *, valid: bool = True):
    blueprint = _build_blueprint(client, valid=valid)
    prompt_master = client.post("/api/prompt-master/preview", json={"blueprint": blueprint}).json()
    gatekeeper = client.post("/api/gatekeeper/preview", json={"blueprint": blueprint, "prompt_master": prompt_master}).json()
    response = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    )
    assert response.status_code == 201
    return response.json()


def test_generation_handoff_project_not_found_returns_404(client):
    response = client.post("/api/generation/handoff-preview", json={"project_id": "missing-project"})

    assert response.status_code == 404
    assert "missing-project" in response.json()["error"]["message"]


def test_generation_handoff_blocked_project_returns_blocked(client):
    project = _create_project(client, valid=False)

    response = client.post("/api/generation/handoff-preview", json={"project_id": project["project_id"]})

    assert response.status_code == 200
    payload = response.json()
    assert payload["handoff_readiness"] == "blocked"
    assert payload["generation_disabled"] is True
    assert any(item["id"] == "gatekeeper_approved" and item["status"] == "failed" for item in payload["checklist"])


def test_generation_handoff_approved_project_returns_ready(client):
    project = _create_project(client)

    response = client.post("/api/generation/handoff-preview", json={"project_id": project["project_id"]})

    assert response.status_code == 200
    payload = response.json()
    assert payload["handoff_readiness"] == "ready"
    assert payload["project_record"]["project_id"] == project["project_id"]
    assert payload["infrastructure_recommendations"]["recommended"]
    assert payload["dependency_impact"]["score"] >= 0
    assert payload["engineering_readiness"]["overall_readiness"] >= 0
    assert all(item["status"] == "passed" for item in payload["checklist"])


def test_generation_handoff_missing_graph_returns_incomplete(client):
    project = _create_project(client)
    with project_service.project_repository.connection() as conn:
        conn.execute(
            "UPDATE projects SET architectural_graph_snapshot_json = NULL WHERE project_id = ?",
            (project["project_id"],),
        )

    response = client.post("/api/generation/handoff-preview", json={"project_id": project["project_id"]})

    assert response.status_code == 200
    payload = response.json()
    assert payload["handoff_readiness"] == "incomplete"
    assert any(item["id"] == "architectural_graph_exists" and item["status"] == "failed" for item in payload["checklist"])


def test_generation_handoff_trace_has_no_secrets(client):
    project = _create_project(client)

    response = client.post("/api/generation/handoff-preview", json={"project_id": project["project_id"]})

    assert response.status_code == 200
    payload = response.json()
    serialized_trace = str(payload["trace"]).lower()
    assert payload["trace"]["contains_secrets"] is False
    assert "password=" not in serialized_trace
    assert "token=" not in serialized_trace
    assert "secret=" not in serialized_trace
