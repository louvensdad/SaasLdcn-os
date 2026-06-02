from __future__ import annotations


def test_skill_catalog_exposes_foundation_skills(client):
    response = client.get("/api/skills")

    assert response.status_code == 200
    payload = response.json()
    skill_ids = {item["id"] for item in payload["skills"]}
    assert "review_blueprint" in skill_ids
    assert "prepare_download" in skill_ids
    assert "architecture" in payload["categories"]


def test_skill_detail_is_read_only_and_governed(client):
    response = client.get("/api/skills/review_blueprint")

    assert response.status_code == 200
    payload = response.json()
    assert payload["metadata"]["no_ai"] is True
    assert payload["metadata"]["no_agents"] is True
    assert payload["metadata"]["no_external_integrations"] is True
    assert payload["metadata"]["execution_mode"] == "read_only"


def test_skill_categories(client):
    response = client.get("/api/skills/categories")

    assert response.status_code == 200
    assert response.json() == ["architecture", "planning", "generation", "support"]


def test_skill_recommendations_unlock_project_context(client):
    response = client.get(
        "/api/skills/recommended",
        params={
            "project_id": "project_1",
            "framework_id": "nextjs",
            "architecture_id": "modular_monolith",
            "has_generated_project": "true",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert any(item["skill_id"] == "prepare_download" and item["unlocked"] for item in payload)
    assert payload[0]["score"] >= payload[-1]["score"]


def test_skill_preview_never_enables_execution(client):
    response = client.post("/api/skills/preview", json={"skill_id": "inspect_templates"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["skill_id"] == "inspect_templates"
    assert payload["execution_enabled"] is False
    assert any("No agents" in note for note in payload["safety_notes"])


def test_system_status_exposes_active_skills(client):
    response = client.get("/api/system-status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["backend_status"]["status"] == "healthy"
    assert "review_blueprint" in payload["active_skills"]
    assert payload["active_templates"]
    assert payload["active_engines"]


def test_roadmap_groups_platform_items(client):
    response = client.get("/api/roadmap")

    assert response.status_code == 200
    payload = response.json()
    assert "IMPLEMENTED" in payload["statuses"]
    assert any(item["id"] == "skill_registry" and item["status"] == "IMPLEMENTED" for item in payload["items"])
