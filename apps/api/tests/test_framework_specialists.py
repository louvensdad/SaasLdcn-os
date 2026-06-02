from __future__ import annotations


def test_spring_boot_specialist_profile_exists(client):
    response = client.get("/api/frameworks/spring_boot/specialist-profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["framework_id"] == "spring_boot"
    assert payload["framework_name"] == "Spring Boot"
    assert payload["best_for"]
    assert payload["recommended_architectures"]
    assert payload["recommended_capabilities"]
    assert payload["readiness_profile"]["label"] == "Enterprise ready"


def test_nestjs_specialist_profile_exists(client):
    response = client.get("/api/frameworks/nestjs/specialist-profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["framework_id"] == "nestjs"
    assert payload["framework_name"] == "NestJS"
    assert any(item["architecture_id"] == "modular_monolith" for item in payload["recommended_architectures"])


def test_nextjs_specialist_profile_exists(client):
    response = client.get("/api/frameworks/nextjs/specialist-profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["framework_id"] == "nextjs"
    assert payload["framework_name"] == "Next.js"
    assert payload["recommended_endpoint_groups"]


def test_unsupported_framework_returns_404(client):
    response = client.get("/api/frameworks/ruby/specialist-profile")

    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Framework 'ruby' was not found."


def test_recommended_architectures_are_not_empty(client):
    response = client.get("/api/frameworks/spring_boot/recommended-architectures")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) > 0
    assert all(item["architecture_name"] for item in payload)


def test_readiness_response_is_valid(client):
    response = client.get("/api/frameworks/fastapi/readiness")

    assert response.status_code == 200
    payload = response.json()
    assert payload["label"] == "API and AI service ready"
    assert payload["score"] >= 0
