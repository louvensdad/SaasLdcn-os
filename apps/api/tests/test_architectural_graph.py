from __future__ import annotations


def _graph(client, **overrides):
    payload = {
        "language_id": "java",
        "framework_id": "spring_boot",
        "architecture_id": "microservices",
        "capability_ids": ["authentication", "rbac", "payments", "observability", "queue"],
        "business_module_ids": ["users", "payments", "notifications"],
        "infrastructure_ids": ["postgresql", "redis", "kafka", "kubernetes", "prometheus"],
    }
    payload.update(overrides)
    response = client.post("/api/architectural-graph/preview", json=payload)
    assert response.status_code == 200
    return response.json()


def test_monolith_graph_has_app_and_db(client):
    graph = _graph(client, architecture_id="monolith", capability_ids=["authentication"], business_module_ids=[], infrastructure_ids=["postgresql"])
    assert any(node["id"] == "app" for node in graph["nodes"])
    assert any(node["type"] == "database" for node in graph["nodes"])


def test_microservices_graph_has_gateway_and_services(client):
    graph = _graph(client)
    assert any(node["type"] == "gateway" for node in graph["nodes"])
    assert len([node for node in graph["nodes"] if node["type"] == "service"]) >= 2


def test_event_driven_graph_has_event_bus(client):
    graph = _graph(client, architecture_id="event_driven", capability_ids=["queue"], business_module_ids=[], infrastructure_ids=["postgresql"])
    assert any(node["type"] == "event_bus" for node in graph["nodes"])
    assert any(edge["type"] == "event" for edge in graph["edges"])


def test_payments_graph_has_external_provider(client):
    graph = _graph(client, architecture_id="monolith", business_module_ids=["payments"], infrastructure_ids=["postgresql"])
    assert any(node["id"] == "payment_provider" and node["type"] == "external_provider" for node in graph["nodes"])
    assert any(edge.get("warning") == "Payment edge requires audit trail." for edge in graph["edges"])


def test_kafka_node_high_burden(client):
    graph = _graph(client)
    kafka = next(node for node in graph["nodes"] if node["id"] == "kafka")
    assert kafka["type"] == "event_bus"
    assert kafka["burden_score"] == "high"


def test_kubernetes_node_requires_sre(client):
    graph = _graph(client)
    kubernetes = next(node for node in graph["nodes"] if node["id"] == "kubernetes")
    assert kubernetes["burden_score"] == "enterprise"
    assert kubernetes["ownership_role"] == "devops/sre"
    assert any("SRE" in warning for warning in kubernetes["warnings"])


def test_unsupported_architecture_safe_fallback(client):
    graph = _graph(client, architecture_id="unsupported_shape", capability_ids=[], business_module_ids=[], infrastructure_ids=["postgresql"])
    app = next(node for node in graph["nodes"] if node["id"] == "app")
    assert app["warnings"]
    assert graph["edges"]
