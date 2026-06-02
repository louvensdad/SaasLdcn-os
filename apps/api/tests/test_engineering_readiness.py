from __future__ import annotations


def _engineering(client, endpoint: str, payload: dict[str, object]):
    response = client.post(f"/api/engineering/{endpoint}", json=payload)
    assert response.status_code == 200
    return response.json()


def _selection(**overrides):
    payload = {
        "language_id": "java",
        "framework_id": "spring_boot",
        "architecture_id": "modular_monolith",
        "capability_ids": ["auth", "payments", "observability"],
        "infrastructure_ids": ["postgresql", "redis"],
    }
    payload.update(overrides)
    return payload


def test_microservices_increase_operational_burden(client):
    modular = _engineering(client, "operational-burden", _selection())
    microservices = _engineering(
        client,
        "operational-burden",
        _selection(architecture_id="microservices", infrastructure_ids=["postgresql", "redis", "rabbitmq", "docker"]),
    )

    assert microservices["score"] > modular["score"]
    assert any("platform maturity" in signal.lower() for signal in microservices["signals"])


def test_kubernetes_increases_operational_complexity(client):
    docker = _engineering(client, "readiness", _selection(infrastructure_ids=["postgresql", "docker"]))
    kubernetes = _engineering(client, "readiness", _selection(infrastructure_ids=["postgresql", "docker", "kubernetes"]))

    assert kubernetes["operational_burden"]["deployment_burden"] > docker["operational_burden"]["deployment_burden"]
    assert any(role["title"] == "SRE" for role in kubernetes["recommended_roles"])


def test_spring_boot_enterprise_recommends_backend_senior(client):
    team = _engineering(client, "team-profile", _selection())
    backend = next(role for role in team["roles"] if role["title"] == "Backend Engineer")

    assert backend["recommended_level"] == "senior_plus"
    assert any(skill["label"] == "Architecture discipline" for skill in team["required_expertise"])


def test_fastapi_rag_recommends_ai_infra_knowledge(client):
    team = _engineering(
        client,
        "team-profile",
        _selection(
            language_id="python",
            framework_id="fastapi",
            architecture_id="clean_architecture",
            capability_ids=["rag", "observability"],
            infrastructure_ids=["postgresql", "pgvector"],
        ),
    )

    assert any(skill["label"] == "AI infra knowledge" for skill in team["required_expertise"])
    assert any(skill["label"] == "Vector database understanding" for skill in team["required_expertise"])


def test_delivery_estimate_changes_with_architecture(client):
    modular = _engineering(client, "delivery-estimate", _selection())
    microservices = _engineering(
        client,
        "delivery-estimate",
        _selection(architecture_id="microservices", infrastructure_ids=["postgresql", "redis", "rabbitmq", "docker"]),
    )

    assert microservices["estimated_weeks"] > modular["estimated_weeks"]
    assert microservices["complexity"]["score"] > modular["complexity"]["score"]
