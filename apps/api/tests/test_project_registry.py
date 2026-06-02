from __future__ import annotations


def _build_blueprint(client, *, valid: bool = True):
    payload = {
        "project_name": "ldcn-registry-app" if valid else "ldcn-blocked-app",
        "language_id": "typescript",
        "runtime_id": "nodejs",
        "framework_id": "nestjs",
        "architecture_id": "modular_monolith",
        "archetype_id": "ai_saas",
        "capability_ids": ["authentication", "rbac", "ai_chat", "analytics", "rate_limiting", "observability"] if valid else ["authentication"],
        "business_module_ids": ["users", "reports", "subscriptions", "notifications"] if valid else ["users"],
        "endpoint_ids": ["auth.login", "auth.register", "auth.me", "analytics.overview", "ai.chat"] if valid else ["auth.login", "ai.chat"],
        "locale": "pt-BR",
        "generation_mode": "local_build_90",
    }
    response = client.post("/api/blueprints/preview", json=payload)
    assert response.status_code == 200
    return response.json()


def _build_prompt_master(client, blueprint: dict):
    response = client.post("/api/prompt-master/preview", json={"blueprint": blueprint})
    assert response.status_code == 200
    return response.json()


def _build_gatekeeper(client, blueprint: dict, prompt_master: dict):
    response = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    )
    assert response.status_code == 200
    return response.json()


def test_save_approved_project(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)

    response = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "ready_for_generation"
    assert payload["readiness_status"] == "ready"
    assert payload["project_name"] == blueprint["project_name"]
    assert payload["architectural_graph_snapshot"]["graph"]["nodes"]
    assert payload["architectural_graph_snapshot"]["source"] == "preview"


def test_save_blocked_project(client):
    blueprint = _build_blueprint(client, valid=False)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)

    response = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "generation_blocked"
    assert payload["readiness_status"] == "blocked"


def test_get_project_by_id(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    created = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    ).json()

    response = client.get(f"/api/projects/{created['project_id']}")

    assert response.status_code == 200
    assert response.json()["project_id"] == created["project_id"]
    assert response.json()["architectural_graph_snapshot"]["graph"]["architecture_id"] == blueprint["architecture_profile"]["architecture_id"]


def test_patch_project(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    created = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    ).json()

    response = client.patch(
        f"/api/projects/{created['project_id']}",
        json={"project_name": "ldcn-registry-renamed", "status": "generated", "readiness_status": "generated"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["project_name"] == "ldcn-registry-renamed"
    assert payload["status"] == "generated"
    assert payload["readiness_status"] == "generated"


def test_delete_project(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    created = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    ).json()

    delete_response = client.delete(f"/api/projects/{created['project_id']}")
    get_response = client.get(f"/api/projects/{created['project_id']}")

    assert delete_response.status_code == 204
    assert get_response.status_code == 404


def test_save_from_wizard_invalid_payload_returns_422(client):
    response = client.post("/api/projects/save-from-wizard", json={"blueprint": {}})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_saved_snapshots_do_not_contain_secrets(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    created = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    ).json()

    serialized = str(
        {
            "blueprint": created["blueprint_snapshot"],
            "prompt_master": created["prompt_master_snapshot"],
            "gatekeeper": created["gatekeeper_snapshot"],
        }
    ).lower()
    assert "password=" not in serialized
    assert "token=" not in serialized
    assert "secret=" not in serialized
