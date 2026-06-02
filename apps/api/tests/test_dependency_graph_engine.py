from __future__ import annotations


def _post_dependency_graph(client, payload: dict[str, object]):
    response = client.post("/api/dependency-graph/preview", json=payload)
    assert response.status_code == 200
    return response.json()


def test_dependency_graph_microservices_propagates_observability(client):
    payload = _post_dependency_graph(
        client,
        {
            "language_id": "java",
            "framework_id": "spring_boot",
            "architecture_id": "microservices",
            "capability_ids": ["authentication", "rbac", "observability", "queue", "payments"],
            "infrastructure_ids": ["postgresql", "redis", "rabbitmq"],
            "archetype_id": "microservice_api",
        },
    )

    assert "observability" in payload["propagation"]["required_node_ids"]
    assert "api_gateway" in payload["propagation"]["recommended_node_ids"]
    assert payload["impact_profile"]["deployment_complexity"] in {"high", "enterprise", "hyperscale"}


def test_dependency_graph_ai_chat_mutates_vector_database(client):
    payload = _post_dependency_graph(
        client,
        {
            "language_id": "typescript",
            "framework_id": "nestjs",
            "architecture_id": "modular_monolith",
            "capability_ids": ["ai_chat"],
            "infrastructure_ids": ["postgresql", "redis"],
            "archetype_id": "ai_saas",
        },
    )

    assert "rate_limiting" in payload["propagation"]["required_node_ids"]
    assert any(mutation["related_node_ids"] and "vector_database" in mutation["related_node_ids"] for mutation in payload["mutations"])
    assert any(issue["severity"] == "critical" for issue in payload["risk_profile"]["issues"])


def test_dependency_graph_payments_increases_security_burden(client):
    payload = _post_dependency_graph(
        client,
        {
            "language_id": "typescript",
            "framework_id": "nestjs",
            "architecture_id": "modular_monolith",
            "capability_ids": ["payments"],
            "infrastructure_ids": ["postgresql"],
            "archetype_id": "saas_dashboard",
        },
    )

    assert any(mutation["category"] == "security" for mutation in payload["mutations"])
    assert payload["impact_profile"]["security_surface"] in {"high", "enterprise", "hyperscale"}


def test_dependency_graph_rag_requires_vector_database(client):
    payload = _post_dependency_graph(
        client,
        {
            "language_id": "python",
            "framework_id": "fastapi",
            "architecture_id": "clean_architecture",
            "capability_ids": ["rag"],
            "infrastructure_ids": ["postgresql"],
            "archetype_id": "ai_saas",
        },
    )

    assert "vector_database" in payload["propagation"]["required_node_ids"]
    assert payload["readiness_profile"]["blockers"]


def test_dependency_graph_readiness_score_changes(client):
    without_observability = _post_dependency_graph(
        client,
        {
            "language_id": "java",
            "framework_id": "spring_boot",
            "architecture_id": "microservices",
            "capability_ids": ["authentication", "queue"],
            "infrastructure_ids": ["postgresql", "redis", "rabbitmq"],
            "archetype_id": "microservice_api",
        },
    )
    with_observability = _post_dependency_graph(
        client,
        {
            "language_id": "java",
            "framework_id": "spring_boot",
            "architecture_id": "microservices",
            "capability_ids": ["authentication", "observability", "queue"],
            "infrastructure_ids": ["postgresql", "redis", "rabbitmq"],
            "archetype_id": "microservice_api",
        },
    )

    assert with_observability["readiness_profile"]["score"] > without_observability["readiness_profile"]["score"]


def test_dependency_graph_risk_detects_overengineering(client):
    payload = _post_dependency_graph(
        client,
        {
            "language_id": "java",
            "framework_id": "spring_boot",
            "architecture_id": "microservices",
            "capability_ids": ["authentication"],
            "infrastructure_ids": ["postgresql"],
            "archetype_id": "microservice_api",
        },
    )

    assert any(issue["id"] == "overengineering" for issue in payload["risk_profile"]["issues"])


def test_dependency_graph_conflict_returns_warnings(client):
    payload = _post_dependency_graph(
        client,
        {
            "language_id": "javascript",
            "framework_id": "express",
            "architecture_id": "monolith",
            "capability_ids": ["queue"],
            "infrastructure_ids": ["sqlite"],
            "archetype_id": "simple_api",
        },
    )

    assert payload["propagation"]["conflicting_node_ids"] or payload["propagation"]["warnings"]
    assert any("conflict" in warning.lower() for warning in payload["propagation"]["warnings"])
