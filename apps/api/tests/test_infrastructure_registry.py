from __future__ import annotations


def test_list_infrastructure_components(client):
    response = client.get("/api/infrastructure/components")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["id"] == "sqlite" for item in payload)
    assert any(item["id"] == "postgresql" for item in payload)
    assert any(item["category"] == "vector_database" for item in payload)


def test_get_infrastructure_component_by_id(client):
    response = client.get("/api/infrastructure/components/redis")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "redis"
    assert payload["category"] == "cache"
    assert payload["provider"] == "redis"


def test_get_infrastructure_component_not_found_returns_404(client):
    response = client.get("/api/infrastructure/components/not-real")

    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Infrastructure component 'not-real' was not found."


def test_infrastructure_recommendations_spring_boot_microservices(client):
    response = client.post(
        "/api/infrastructure/recommendations",
        json={
            "language_id": "java",
            "framework_id": "spring_boot",
            "architecture_id": "microservices",
            "archetype_id": "microservice_api",
            "capability_ids": ["authentication", "rbac", "observability", "queue"],
            "architecture_level": "level_3_enterprise",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "postgresql" in payload["required"] or "postgresql" in payload["recommended"]
    assert "redis" in payload["required"] or "redis" in payload["recommended"]
    assert "docker_compose" in payload["required"] or "docker_compose" in payload["recommended"]
    assert "prometheus" in payload["recommended"]
    assert "grafana" in payload["recommended"]
    assert payload["warnings"]


def test_infrastructure_recommendations_nextjs(client):
    response = client.post(
        "/api/infrastructure/recommendations",
        json={
            "language_id": "typescript",
            "framework_id": "nextjs",
            "architecture_id": "modular_monolith",
            "archetype_id": "saas_dashboard",
            "capability_ids": ["authentication"],
            "architecture_level": "level_2_team",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "vercel" in payload["required"]
    assert "postgresql" in payload["required"]
    assert "nextauth" in payload["recommended"] or "clerk" in payload["recommended"]


def test_infrastructure_recommendations_fastapi_rag(client):
    response = client.post(
        "/api/infrastructure/recommendations",
        json={
            "language_id": "python",
            "framework_id": "fastapi",
            "architecture_id": "clean_architecture",
            "archetype_id": "ai_saas",
            "capability_ids": ["ai_chat", "rag", "observability"],
            "architecture_level": "level_3_enterprise",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert "postgresql" in payload["required"]
    assert "redis" in payload["required"]
    assert any(item in payload["recommended"] for item in ["pgvector", "qdrant", "pinecone"])
    assert "opentelemetry" in payload["required"]

