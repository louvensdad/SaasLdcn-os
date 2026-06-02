from __future__ import annotations


def _post(client, endpoint: str, payload: dict[str, object]):
    response = client.post(f"/api/system-design/{endpoint}", json=payload)
    assert response.status_code == 200
    return response.json()


def _selection(**overrides):
    payload = {
        "language_id": "java",
        "framework_id": "spring_boot",
        "architecture_id": "microservices",
        "capability_ids": ["auth", "payments", "observability", "queue"],
        "infrastructure_ids": ["postgresql", "redis", "rabbitmq", "kubernetes", "prometheus"],
    }
    payload.update(overrides)
    return payload


def test_microservices_topology_generated(client):
    topology = _post(client, "architecture-topology", _selection())

    assert topology["architecture_id"] == "microservices"
    assert any(node["type"] == "gateway" for node in topology["nodes"])
    assert any(node["label"] == "Distributed Observability" for node in topology["nodes"])


def test_runtime_flow_generated(client):
    runtime = _post(client, "runtime-flow", _selection())

    assert runtime["mode"] == "distributed"
    assert runtime["steps"][0] == "Client"
    assert any(edge["animated"] for edge in runtime["edges"])


def test_infrastructure_topology_generated(client):
    topology = _post(client, "infrastructure-topology", _selection())

    assert any(node["type"] == "database" for node in topology["nodes"])
    assert any(node["type"] == "cache" for node in topology["nodes"])
    assert any(node["type"] == "queue" for node in topology["nodes"])


def test_risk_zones_generated(client):
    zones = _post(client, "risk-zones", _selection(capability_ids=["auth", "payments", "queue"], infrastructure_ids=["postgresql", "kubernetes"]))

    assert zones
    assert any(zone["severity"] in {"warning", "critical"} for zone in zones)


def test_readiness_zones_generated(client):
    zones = _post(client, "readiness-zones", _selection())

    assert {zone["id"] for zone in zones} == {"mvp", "production", "enterprise", "scalability", "team"}


def test_unsupported_architecture_safe_fallback(client):
    snapshot = _post(client, "snapshot", _selection(architecture_id="unknown_mesh"))

    assert snapshot["architecture_topology"]["nodes"]
    assert any("fallback" in signal.lower() for signal in snapshot["architecture_topology"]["signals"])
