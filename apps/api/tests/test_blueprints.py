from __future__ import annotations


def test_preview_blueprint_valid_payload(client):
    response = client.post(
        "/api/blueprints/preview",
        json={
            "project_name": "ldcn-enterprise-app",
            "language_id": "typescript",
            "runtime_id": "nodejs",
            "framework_id": "nextjs",
            "architecture_id": "modular_monolith",
            "archetype_id": "saas_dashboard",
            "capability_ids": ["authentication", "rbac", "analytics"],
            "business_module_ids": ["users", "subscriptions", "reports"],
            "endpoint_ids": ["auth.login", "auth.register", "auth.me", "analytics.overview"],
            "locale": "pt-BR",
            "generation_mode": "local_build_90",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["project_name"] == "ldcn-enterprise-app"
    assert payload["validation"]["valid"] is True
    assert payload["technology_graph"]["framework"]["id"] == "nextjs"
    assert payload["complexity_profile"]["overall_score"] > 0
    assert payload["dependency_graph_snapshot"]["nodes"]


def test_preview_blueprint_invalid_payload_returns_422(client):
    response = client.post(
        "/api/blueprints/preview",
        json={
            "language_id": "typescript",
            "runtime_id": "nodejs",
            "framework_id": "nextjs",
            "architecture_id": "modular_monolith",
            "archetype_id": "saas_dashboard",
            "capability_ids": [],
            "business_module_ids": [],
            "endpoint_ids": [],
            "locale": "pt-BR",
            "generation_mode": "local_build_90",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_preview_blueprint_incompatible_framework_returns_valid_false(client):
    response = client.post(
        "/api/blueprints/preview",
        json={
            "project_name": "ldcn-incompatible",
            "language_id": "python",
            "runtime_id": "python_runtime",
            "framework_id": "spring_boot",
            "architecture_id": "clean_architecture",
            "archetype_id": "rest_api",
            "capability_ids": ["api_docs"],
            "business_module_ids": ["users"],
            "endpoint_ids": [],
            "locale": "pt-BR",
            "generation_mode": "local_build_90",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["validation"]["valid"] is False
    assert any(item["code"] == "framework_language_incompatible" for item in payload["validation"]["errors"])


def test_preview_blueprint_endpoint_without_capability_returns_error(client):
    response = client.post(
        "/api/blueprints/preview",
        json={
            "project_name": "ldcn-ai-gap",
            "language_id": "typescript",
            "runtime_id": "nodejs",
            "framework_id": "nestjs",
            "architecture_id": "modular_monolith",
            "archetype_id": "ai_saas",
            "capability_ids": ["authentication"],
            "business_module_ids": ["users", "notifications"],
            "endpoint_ids": ["auth.login", "ai.chat"],
            "locale": "pt-BR",
            "generation_mode": "local_build_90",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["validation"]["valid"] is False
    assert any(item["code"] == "endpoint_capabilities_missing" for item in payload["validation"]["errors"])


def test_preview_blueprint_microservices_generates_recommendations(client):
    response = client.post(
        "/api/blueprints/preview",
        json={
            "project_name": "ldcn-microservices",
            "language_id": "java",
            "runtime_id": "jvm",
            "framework_id": "spring_boot",
            "architecture_id": "microservices",
            "archetype_id": "microservice_api",
            "capability_ids": ["docker"],
            "business_module_ids": ["users"],
            "endpoint_ids": [],
            "locale": "pt-BR",
            "generation_mode": "local_build_90",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    recommendation_ids = {item["related_item_id"] for item in payload["recommendations"]}
    assert "observability" in recommendation_ids
    assert "queue" in recommendation_ids


def test_preview_blueprint_reflects_selected_infrastructure(client):
    response = client.post(
        "/api/blueprints/preview",
        json={
            "project_name": "ldcn-infra-preview",
            "language_id": "java",
            "runtime_id": "jvm",
            "framework_id": "spring_boot",
            "architecture_id": "microservices",
            "archetype_id": "microservice_api",
            "capability_ids": ["authentication", "observability", "queue"],
            "business_module_ids": ["users"],
            "endpoint_ids": [],
            "infrastructure_component_ids": ["postgresql", "redis", "docker_compose"],
            "locale": "pt-BR",
            "generation_mode": "local_build_90",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["infrastructure_profile"]["selected_component_ids"] == [
        "postgresql",
        "redis",
        "docker_compose",
    ]
    assert payload["infrastructure_profile"]["recommended_component_ids"]


def test_preview_blueprint_ai_chat_generates_recommendations(client):
    response = client.post(
        "/api/blueprints/preview",
        json={
            "project_name": "ldcn-ai-saas",
            "language_id": "typescript",
            "runtime_id": "nodejs",
            "framework_id": "nestjs",
            "architecture_id": "modular_monolith",
            "archetype_id": "ai_saas",
            "capability_ids": ["authentication", "ai_chat", "analytics"],
            "business_module_ids": ["users", "notifications", "subscriptions"],
            "endpoint_ids": ["auth.login", "ai.chat"],
            "locale": "pt-BR",
            "generation_mode": "local_build_90",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    recommendation_ids = {item["related_item_id"] for item in payload["recommendations"]}
    assert "rate_limiting" in recommendation_ids
    assert "observability" in recommendation_ids


def test_preview_blueprint_complexity_increases_with_more_capabilities_and_endpoints(client):
    base_payload = {
        "project_name": "ldcn-dashboard",
        "language_id": "typescript",
        "runtime_id": "nodejs",
        "framework_id": "nextjs",
        "architecture_id": "modular_monolith",
        "archetype_id": "saas_dashboard",
        "locale": "pt-BR",
        "generation_mode": "local_build_90",
    }

    lean_response = client.post(
        "/api/blueprints/preview",
        json={
            **base_payload,
            "capability_ids": ["authentication"],
            "business_module_ids": ["users"],
            "endpoint_ids": ["auth.login"],
        },
    )
    heavy_response = client.post(
        "/api/blueprints/preview",
        json={
            **base_payload,
            "capability_ids": ["authentication", "rbac", "analytics", "search", "i18n"],
            "business_module_ids": ["users", "subscriptions", "reports", "settings"],
            "endpoint_ids": ["auth.login", "auth.register", "auth.me", "analytics.overview", "admin.settings"],
        },
    )

    assert lean_response.status_code == 200
    assert heavy_response.status_code == 200
    assert (
        heavy_response.json()["complexity_profile"]["overall_score"]
        > lean_response.json()["complexity_profile"]["overall_score"]
    )
