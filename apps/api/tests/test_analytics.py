"""Analytics Center V1 backend tests.

Covers the 10 acceptance scenarios: 200, structure, real Project Room metrics,
redaction, empty-with-reason sections, collector fault isolation, filters
accepted, real technology trends, no API keys, frontend-compatible shape.
"""

from __future__ import annotations

import pytest

from app.services.analytics_service import AnalyticsFilters, AnalyticsService

SECRET_KEY = "sk-analytics-should-never-appear-1234567890"


def _create_room(client, title: str = "Sala Analytics") -> str:
    response = client.post("/api/project-rooms", json={"title": title, "raw_intent": "Construir um app"})
    assert response.status_code in (200, 201), response.text
    return response.json()["room_id"]


# 1. 200
def test_overview_returns_200(client):
    response = client.get("/api/analytics/overview")
    assert response.status_code == 200


# 2. Expected structure
def test_overview_has_expected_structure(client):
    body = client.get("/api/analytics/overview").json()
    assert "generated_at" in body
    assert isinstance(body["metrics"], list)
    assert isinstance(body["sections"], list)
    assert "filters" in body
    section_ids = {s["id"] for s in body["sections"]}
    assert {"project_rooms", "llm", "meta_factory", "technology_trends", "laboratory"} <= section_ids


# 3. Real Project Room metrics
def test_includes_real_project_room_metrics(client):
    _create_room(client, "Sala Real 1")
    _create_room(client, "Sala Real 2")
    body = client.get("/api/analytics/overview").json()
    rooms_section = next(s for s in body["sections"] if s["id"] == "project_rooms")
    total = next(m for m in rooms_section["metrics"] if m["id"] == "project_rooms_total")
    assert total["value"] == 2
    assert rooms_section["status"] == "available"
    assert len(rooms_section["records"]) == 2


# 4. Redacts secrets in records
def test_redacts_secrets_in_records(client):
    _create_room(client, f"Projeto api_key={SECRET_KEY}")
    body = client.get("/api/analytics/overview").json()
    assert SECRET_KEY not in client.get("/api/analytics/overview").text
    rooms_section = next(s for s in body["sections"] if s["id"] == "project_rooms")
    names = " ".join(str(r.get("name", "")) for r in rooms_section["records"])
    assert SECRET_KEY not in names


# 5. Empty section carries an explicit reason
def test_empty_section_has_reason(client):
    body = client.get("/api/analytics/overview").json()
    lab = next(s for s in body["sections"] if s["id"] == "laboratory")
    assert lab["status"] == "empty"
    assert lab["reason"] == "no_data_source"
    assert lab["metrics"] == []


# 6. A failing collector does not break the whole endpoint
def test_failing_collector_is_isolated(monkeypatch, client):
    import app.services.analytics_service as svc

    def boom(_ctx):
        raise RuntimeError("synthetic collector failure")

    monkeypatch.setitem(svc._COLLECTORS, "llm", boom)
    response = client.get("/api/analytics/overview")
    assert response.status_code == 200
    body = response.json()
    llm = next(s for s in body["sections"] if s["id"] == "llm")
    assert llm["status"] == "error"
    assert llm["reason"] == "collector_error"
    # Other sections still resolve.
    assert any(s["id"] == "project_rooms" for s in body["sections"])


# 7. Filters are accepted
@pytest.mark.parametrize(
    "query",
    [
        "period=30d",
        "status=DRAFT",
        "module=project_rooms",
        "provider=anthropic&language=python&framework=fastapi&severity=warning&agent=backend",
    ],
)
def test_filters_are_accepted(client, query: str):
    response = client.get(f"/api/analytics/overview?{query}")
    assert response.status_code == 200


def test_module_filter_narrows_sections(client):
    body = client.get("/api/analytics/overview?module=project_rooms").json()
    assert {s["id"] for s in body["sections"]} == {"project_rooms"}


# 8. Technology trends use real data
def test_technology_trends_real_or_empty(client):
    body = client.get("/api/analytics/overview").json()
    tech = next(s for s in body["sections"] if s["id"] == "technology_trends")
    # With no generated projects in a fresh test DB, it must be an honest empty.
    assert tech["status"] in {"available", "empty"}
    if tech["status"] == "empty":
        assert tech["reason"] == "no_data_source"


# 9. Never returns API keys
def test_never_returns_api_keys(client):
    client.post("/api/user-ai-keys", json={"provider": "anthropic", "nome": "Minha chave", "api_key": SECRET_KEY})
    text = client.get("/api/analytics/overview").text
    assert SECRET_KEY not in text
    assert "api_key" not in text
    assert "apiKey" not in text


# 10. Response is frontend-compatible (field names match lib/api/analytics.ts)
def test_response_is_frontend_compatible(client):
    _create_room(client)
    body = client.get("/api/analytics/overview").json()
    for metric in body["metrics"]:
        assert {"id", "label", "value", "severity"} <= set(metric)
        assert metric["severity"] in {"neutral", "positive", "warning", "critical"}
    rooms_section = next(s for s in body["sections"] if s["id"] == "project_rooms")
    assert {"id", "title", "metrics", "records", "columns"} <= set(rooms_section)
    filters = body["filters"]
    assert "statuses" in filters and "languages" in filters and "agents" in filters


def test_service_unit_isolation_returns_overview():
    # Direct unit construction with injected empty repos must still produce a
    # well-formed overview (no DB, no crash).
    class _EmptyRooms:
        def list_for_owner(self, _uid):
            return []

    class _EmptyProjects:
        def list_projects(self):
            return []

    class _EmptyAudit:
        def list_for_user(self, _uid):
            return []

    service = AnalyticsService(
        room_repository=_EmptyRooms(),  # type: ignore[arg-type]
        project_service=_EmptyProjects(),  # type: ignore[arg-type]
        audit_repository=_EmptyAudit(),  # type: ignore[arg-type]
    )
    overview = service.overview("u-1", AnalyticsFilters())
    assert overview.generated_at
    assert isinstance(overview.sections, list)


def test_llm_collector_surfaces_measured_token_usage():
    from app.schemas.llm_settings import ActiveLlmSettings
    from app.services.analytics_service import _Context, collect_llm_metrics

    ctx = _Context(
        user_id="u", filters=None, cutoff=None, rooms=[], audit=[], projects=[],
        active_llm=ActiveLlmSettings(reason="x"),
        usage={
            "input_tokens": 100, "output_tokens": 40, "total_tokens": 140, "job_count": 2,
            "by_model": [{"model": "claude-sonnet-4", "input_tokens": 100, "output_tokens": 40, "job_count": 2}],
        },
    )
    section = collect_llm_metrics(ctx)
    values = {m.id: m.value for m in section.metrics}
    assert values["llm_total_tokens"] == 140
    assert values["llm_input_tokens"] == 100
    assert values["llm_generations"] == 2
    assert section.status == "available"  # real token data makes the section non-empty
    assert any(r.get("model") == "claude-sonnet-4" for r in section.records)


def test_llm_collector_empty_without_events_or_usage():
    from app.schemas.llm_settings import ActiveLlmSettings
    from app.services.analytics_service import _Context, collect_llm_metrics

    ctx = _Context(user_id="u", filters=None, cutoff=None, rooms=[], audit=[], projects=[],
                   active_llm=ActiveLlmSettings(reason="x"), usage=None)
    assert collect_llm_metrics(ctx).status == "empty"


def test_laboratory_collector_counts_real_terminal_runs():
    from app.schemas.llm_settings import ActiveLlmSettings
    from app.services.analytics_service import _Context, collect_laboratory_metrics

    ctx = _Context(
        user_id="u", filters=None, cutoff=None, rooms=[], projects=[],
        active_llm=ActiveLlmSettings(reason="x"),
        audit=[
            {"id": "a1", "event_code": "laboratory_terminal_run", "created_at": "2026-07-01T00:00:00+00:00"},
            {"id": "a2", "event_code": "laboratory_terminal_run", "created_at": "2026-07-01T00:00:00+00:00"},
            {"id": "a3", "event_code": "user_login", "created_at": "2026-07-01T00:00:00+00:00"},
        ],
    )
    section = collect_laboratory_metrics(ctx)
    assert section.status == "available"
    values = {m.id: m.value for m in section.metrics}
    assert values["laboratory_terminal_runs"] == 2


def test_laboratory_collector_empty_without_runs():
    from app.schemas.llm_settings import ActiveLlmSettings
    from app.services.analytics_service import _Context, collect_laboratory_metrics

    ctx = _Context(user_id="u", filters=None, cutoff=None, rooms=[], projects=[],
                   active_llm=ActiveLlmSettings(reason="x"),
                   audit=[{"id": "a1", "event_code": "user_login", "created_at": "2026-07-01T00:00:00+00:00"}])
    assert collect_laboratory_metrics(ctx).status == "empty"
