from __future__ import annotations


def test_health_endpoint(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_stacks_endpoint(client):
    response = client.get("/api/stacks")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 7
    assert {item["id"] for item in payload} == {
        "static_site",
        "react",
        "angular",
        "fastapi",
        "spring_boot",
        "nestjs",
        "nextjs",
    }
    assert "required_fields" in payload[0]


def test_stack_detail_endpoint(client):
    response = client.get("/api/stacks/fastapi")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "fastapi"
    assert payload["wizard_profile"]["profileId"] == "wizard_fastapi_service"
    assert "project_name" in payload["required_fields"]


def test_stack_not_found_returns_clean_404(client):
    response = client.get("/api/stacks/not-a-real-stack")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "http_404"
    assert response.json()["error"]["message"] == "Stack 'not-a-real-stack' was not found."


def test_templates_endpoint(client):
    response = client.get("/api/templates")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 3
    assert any(item["templateCode"] == "fastapi_service" for item in payload)


def test_projects_endpoint_starts_empty(client):
    initial_response = client.get("/api/projects")

    assert initial_response.status_code == 200
    assert initial_response.json() == []


def test_downloads_endpoint(client):
    response = client.get("/api/downloads")

    assert response.status_code == 200
    assert response.json() == []


def test_clean_404_error(client):
    response = client.get("/api/route-that-does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "http_404"
    assert response.json()["error"]["message"] == "Not Found"
