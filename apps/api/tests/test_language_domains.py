from __future__ import annotations


def test_java_language_profile_endpoint(client):
    response = client.get("/api/languages/java/profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["language_id"] == "java"
    assert payload["name"] == "Java"
    assert payload["enterprise_score"] == 10
    assert payload["framework_count"] >= 3
    assert payload["architecture_count"] >= 3
    assert payload["capability_count"] >= 1


def test_java_language_frameworks_include_spring_boot(client):
    response = client.get("/api/languages/java/frameworks")

    assert response.status_code == 200
    payload = response.json()
    ids = {item["id"] for item in payload}
    assert "spring_boot" in ids
    assert "quarkus" in ids
    assert "micronaut" in ids


def test_typescript_language_frameworks_include_enterprise_and_frontend_choices(client):
    response = client.get("/api/languages/typescript/frameworks")

    assert response.status_code == 200
    payload = response.json()
    ids = {item["id"] for item in payload}
    assert {"nestjs", "nextjs", "react", "angular"} <= ids


def test_python_language_frameworks_include_fastapi_django_and_flask(client):
    response = client.get("/api/languages/python/frameworks")

    assert response.status_code == 200
    payload = response.json()
    ids = {item["id"] for item in payload}
    assert {"fastapi", "django", "flask"} <= ids


def test_unsupported_language_returns_clear_404(client):
    response = client.get("/api/languages/ruby/profile")

    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Language 'ruby' was not found."


def test_java_language_recommendations_return_list(client):
    response = client.get("/api/languages/java/recommendations")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 3
    assert any(item["title"] == "Use Spring Boot for enterprise APIs" for item in payload)


def test_language_capabilities_are_filtered_by_language(client):
    response = client.get("/api/languages/java/capabilities")

    assert response.status_code == 200
    payload = response.json()
    ids = {item["id"] for item in payload}
    assert "authentication" in ids
    assert "observability" in ids
    assert all("spring_boot" in item["supported_frameworks"] or "quarkus" in item["supported_frameworks"] or "micronaut" in item["supported_frameworks"] for item in payload)
