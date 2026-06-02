from __future__ import annotations


def test_template_catalog_exposes_marketplace_metadata(client):
    response = client.get("/api/templates/catalog")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["templates"]) >= 4
    landing = next(item for item in payload["templates"] if item["id"] == "landing-page")
    assert landing["version"] == "1.0.0"
    assert landing["category"] == "marketing"
    assert "typescript" in landing["supported_languages"]
    assert "nextjs" in landing["supported_frameworks"]
    assert "landing_page" in landing["supported_archetypes"]
    assert landing["complexity"] in {"low", "medium", "high"}
    assert landing["maturity"] in {"experimental", "stable", "mature"}
    assert landing["changelog"]


def test_template_detail_returns_single_template(client):
    response = client.get("/api/templates/landing-page")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "landing-page"
    assert payload["name"] == "Next.js Static Landing"
    assert "seo" in payload["capabilities"]


def test_template_categories_returns_unique_categories(client):
    response = client.get("/api/templates/categories")

    assert response.status_code == 200
    payload = response.json()
    assert payload == sorted(payload)
    assert "marketing" in payload
    assert "documentation" in payload


def test_template_compatibility_scores_compatible_selection(client):
    response = client.get(
        "/api/templates/landing-page/compatibility",
        params={
            "language_id": "typescript",
            "framework_id": "nextjs",
            "architecture_id": "modular_monolith",
            "archetype_id": "landing_page",
            "capability_ids": ["seo", "analytics"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["template_id"] == "landing-page"
    assert payload["compatible"] is True
    assert payload["score"] >= 90
    assert payload["maturity_verified"] is True


def test_template_compatibility_blocks_incompatible_framework(client):
    response = client.get(
        "/api/templates/landing-page/compatibility",
        params={
            "language_id": "typescript",
            "framework_id": "fastapi",
            "architecture_id": "modular_monolith",
            "archetype_id": "landing_page",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["compatible"] is False
    assert "framework" in payload["missing"]


def test_template_recommendation_returns_best_match(client):
    response = client.get(
        "/api/templates/recommended",
        params={
            "language_id": "typescript",
            "framework_id": "nextjs",
            "architecture_id": "modular_monolith",
            "archetype_id": "landing_page",
            "capability_ids": ["seo", "analytics"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["recommendations"][0]["id"] == "landing-page"
    assert payload["compatibility"][0]["compatible"] is True
