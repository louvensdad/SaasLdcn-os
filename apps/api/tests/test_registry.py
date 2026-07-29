from __future__ import annotations


def test_registry_languages_endpoint(client):
    response = client.get("/api/registry/languages")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == "java" for item in payload)
    assert any(item["id"] == "typescript" for item in payload)


def test_registry_runtimes_endpoint(client):
    response = client.get("/api/registry/runtimes")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == "jvm" for item in payload)
    assert any(item["id"] == "nodejs" for item in payload)


def test_registry_frameworks_endpoint(client):
    response = client.get("/api/registry/frameworks")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == "spring_boot" for item in payload)
    assert any(item["id"] == "nestjs" for item in payload)


def test_registry_architectures_endpoint(client):
    response = client.get("/api/registry/architectures")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == "microservices" for item in payload)
    assert any(item["id"] == "clean_architecture" for item in payload)


def test_language_frameworks_endpoint(client):
    response = client.get("/api/registry/languages/java/frameworks")

    assert response.status_code == 200
    payload = response.json()
    assert {item["id"] for item in payload} >= {"spring_boot", "quarkus", "micronaut"}


def test_framework_detail_endpoint(client):
    response = client.get("/api/registry/frameworks/nestjs")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "nestjs"
    assert payload["language_id"] == "typescript"
    assert payload["runtime_id"] == "nodejs"


def test_framework_architectures_endpoint(client):
    response = client.get("/api/registry/frameworks/spring_boot/architectures")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == "microservices" for item in payload)
    assert any(item["id"] == "clean_architecture" for item in payload)


def test_framework_archetypes_endpoint(client):
    response = client.get("/api/registry/frameworks/nextjs/archetypes")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == "landing_page" for item in payload)
    assert any(item["id"] == "saas_dashboard" for item in payload)


def test_registry_capabilities_endpoint(client):
    response = client.get("/api/registry/capabilities")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == "authentication" for item in payload)
    assert any(item["id"] == "observability" for item in payload)


def test_capabilities_remain_available_for_microservices_and_distributed_architectures(client):
    # Regression: architecture_level_minimum is a FLOOR ("at least this much
    # maturity"), so a capability tagged for a lower/mid tier must still be
    # available at every MORE complex tier too. The previous per-tier lookup
    # returned a disjoint list per level, and since "microservices"/
    # "distributed_system" only ever appeared in level_4/5's own list, EVERY
    # capability in the registry (none of which are tagged level_4/5) had zero
    # architecture_ids in common with those two -- selecting either
    # architecture in the wizard produced a completely empty Capabilities step
    # for every language/framework, confirmed live end-to-end.
    payload = client.get("/api/registry/capabilities").json()
    by_id = {item["id"]: item for item in payload}

    # authentication: level_1_mvp -> must be available for literally every architecture.
    assert {"monolith", "microservices", "distributed_system"} <= set(by_id["authentication"]["architecture_ids"])

    # rbac: level_2_professional -> still available for its own original tier...
    assert {"monolith", "modular_monolith", "clean_architecture"} <= set(by_id["rbac"]["architecture_ids"])
    # ...AND now also for microservices/distributed_system (the actual bug).
    assert {"microservices", "distributed_system"} <= set(by_id["rbac"]["architecture_ids"])

    # multi_tenancy: level_3_enterprise -> same fix, one tier up.
    assert {"microservices", "distributed_system"} <= set(by_id["multi_tenancy"]["architecture_ids"])


def test_registry_business_modules_endpoint(client):
    response = client.get("/api/registry/business-modules")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == "users" for item in payload)
    assert any(item["id"] == "subscriptions" for item in payload)


def test_registry_endpoints_endpoint(client):
    response = client.get("/api/registry/endpoints")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == "auth.login" for item in payload)
    assert any(item["id"] == "ai.chat" for item in payload)


def test_registry_archetype_detail_endpoint(client):
    response = client.get("/api/registry/archetypes/ai_saas")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "ai_saas"
    assert "nestjs" in payload["supported_frameworks"]


def test_registry_archetype_not_found_returns_clean_404(client):
    response = client.get("/api/registry/archetypes/not-real")

    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Archetype 'not-real' was not found."


def test_framework_capabilities_via_legacy_stack_alias_endpoint(client):
    response = client.get("/api/registry/stacks/nestjs/capabilities")

    assert response.status_code == 200
    payload = response.json()
    ids = {item["id"] for item in payload}
    assert "authentication" in ids
    assert "queue" in ids


def test_business_module_endpoints_endpoint(client):
    response = client.get("/api/registry/business-modules/users/endpoints")

    assert response.status_code == 200
    payload = response.json()
    assert {item["id"] for item in payload} >= {
        "auth.login",
        "auth.register",
        "auth.me",
        "users.list",
    }


def test_validate_selection_valid_payload(client):
    response = client.post(
        "/api/registry/validate-selection",
        json={
            "language_id": "typescript",
            "runtime_id": "nodejs",
            "framework_id": "nestjs",
            "architecture_id": "modular_monolith",
            "archetype_id": "ai_saas",
            "capability_ids": ["authentication", "rbac", "ai_chat", "observability"],
            "business_module_ids": ["users", "subscriptions", "notifications"],
            "endpoint_ids": ["auth.login", "auth.register", "ai.chat"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is True
    assert payload["errors"] == []
    assert payload["resolved_blueprint_summary"]["technology_graph"]["framework"]["id"] == "nestjs"


def test_validate_selection_invalid_framework_runtime_pair(client):
    response = client.post(
        "/api/registry/validate-selection",
        json={
            "language_id": "python",
            "runtime_id": "python_runtime",
            "framework_id": "spring_boot",
            "architecture_id": "clean_architecture",
            "archetype_id": "rest_api",
            "capability_ids": ["api_docs"],
            "business_module_ids": ["users"],
            "endpoint_ids": [],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    assert any(item["code"] == "framework_language_incompatible" for item in payload["errors"])


def test_validate_selection_react_backend_archetype_returns_error(client):
    response = client.post(
        "/api/registry/validate-selection",
        json={
            "language_id": "typescript",
            "runtime_id": "nodejs",
            "framework_id": "react",
            "architecture_id": "modular_monolith",
            "archetype_id": "rest_api",
            "capability_ids": [],
            "business_module_ids": [],
            "endpoint_ids": [],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    assert any(item["code"] == "react_backend_archetype_blocked" for item in payload["errors"])


def test_validate_selection_microservices_recommends_distributed_capabilities(client):
    response = client.post(
        "/api/registry/validate-selection",
        json={
            "language_id": "java",
            "runtime_id": "jvm",
            "framework_id": "spring_boot",
            "architecture_id": "microservices",
            "archetype_id": "microservice_api",
            "capability_ids": ["docker"],
            "business_module_ids": ["users"],
            "endpoint_ids": ["users.list"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert any(item["code"] == "microservices_capability_recommended" for item in payload["warnings"])


def test_validate_selection_ai_chat_endpoint_without_ai_chat_returns_error(client):
    response = client.post(
        "/api/registry/validate-selection",
        json={
            "language_id": "typescript",
            "runtime_id": "nodejs",
            "framework_id": "nestjs",
            "architecture_id": "modular_monolith",
            "archetype_id": "ai_saas",
            "capability_ids": ["authentication"],
            "business_module_ids": ["users"],
            "endpoint_ids": ["ai.chat"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    assert any(item["code"] == "endpoint_capabilities_missing" for item in payload["errors"])
