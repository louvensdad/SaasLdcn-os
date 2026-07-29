"""Analytics dirty-data stress test.

Seeds a large, deliberately messy dataset directly at the SQL layer (bypassing
the API's own validation, the way a corrupted migration, a crashed write, or a
hand-edited row could) and asserts the real `/api/analytics/overview` pipeline
survives it: still 200, still well-formed, still redacted, and — critically —
does not let one corrupt row blank out an entire user's legitimate data.

This is not mocked: it drives the real repositories and the real
AnalyticsService against a real (isolated, per-test) SQLite database.
"""

from __future__ import annotations

import json
from uuid import uuid4

import pytest

from app.core.config import get_settings
from app.core.database import connection as database_connection

_HUGE = "x" * 60_000
_SECRET_TITLE = f"Projeto secreto api_key={'sk-' + 'a' * 40}"
_MOJIBAKE = "PromoÃ§Ã£o RelatÃ³rio ImplementaÃ§Ã£o"
_CONTROL_CHARS = "col\x00una\x01com\x02lixo\x1b[31m"
_SCRIPT_INJECTION = "<script>alert(document.cookie)</script>"
_SQLI_LOOKALIKE = "'; DROP TABLE project_rooms; --"


def _seed_dirty_rooms(owner_user_id: str, count: int) -> None:
    now = "2026-07-07T12:00:00+00:00"
    dirty_titles = [
        "",
        _HUGE,
        _SECRET_TITLE,
        _MOJIBAKE,
        _CONTROL_CHARS,
        _SCRIPT_INJECTION,
        _SQLI_LOOKALIKE,
        "🚀" * 500,
        "Título Normal",
    ]
    dirty_statuses = [
        "DRAFT", "", "TOTALLY_UNKNOWN_STATUS", "draft", "READY", "FAILED",
        "'; DROP TABLE users; --", "x" * 300,
    ]
    dirty_created_at = [
        now, "", "not-a-date", "9999-99-99T99:99:99", "0000-01-01T00:00:00",
        "1970-01-01T00:00:00+00:00", "2026-07-07",  # no time component
    ]
    dirty_json_blobs = [
        "[]", "not json at all {{{", "", None, "null", "{\"unterminated\": ",
        json.dumps({"nested": {"api_key": "sk-shouldberedacted1234567890abcdef"}}),
        json.dumps([1, 2, {"a": "b"}]),
    ]
    # Same corpus but never None, for columns with a NOT NULL constraint.
    dirty_json_blobs_nn = [v for v in dirty_json_blobs if v is not None]

    with database_connection(get_settings().sqlite_path) as conn:
        for i in range(count):
            conn.execute(
                """
                INSERT INTO project_rooms (
                    room_id, owner_user_id, workspace_id, title, status, delivery_type,
                    preferred_language, raw_intent, locale, confidence, degraded,
                    spec_json, messages_json, prompt_master_md, prompt_master_versions_json,
                    architecture_blueprint_json, blueprint_versions_json, active_blueprint_version,
                    generation_handoff_json, history_json, operational_log_json, last_failure_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"dirty-room-{uuid4().hex[:10]}",
                    owner_user_id,
                    None,
                    dirty_titles[i % len(dirty_titles)],
                    dirty_statuses[i % len(dirty_statuses)],
                    "web",
                    "",
                    _HUGE if i % 17 == 0 else "raw intent",
                    "pt-BR",
                    [0.0, 1.0, -5.0, 999.0, float("nan")][i % 5]
                    if i % 5 != 4 else 0.0,  # sqlite can't store NaN via this driver cleanly; keep finite
                    i % 2,
                    dirty_json_blobs[i % len(dirty_json_blobs)],
                    dirty_json_blobs_nn[(i + 1) % len(dirty_json_blobs_nn)],
                    None,
                    "[]",
                    dirty_json_blobs[(i + 2) % len(dirty_json_blobs)],
                    "[]",
                    None,
                    dirty_json_blobs[(i + 3) % len(dirty_json_blobs)],
                    "[]",
                    "[]",
                    None,
                    dirty_created_at[i % len(dirty_created_at)],
                    dirty_created_at[(i + 1) % len(dirty_created_at)],
                ),
            )


def _seed_dirty_audit_events(owner_user_id: str, count: int) -> None:
    codes = [
        "quality_gate_run", "quality_gate_failed", "auto_repair_completed",
        "LLM_PROVIDER_CONFIRMED", "LLM_PROVIDER_FAILED", "laboratory_terminal_run",
        "modernize_project_uploaded", "codebase_analysis_completed",
        "totally_unknown_event", "",
    ]
    dirty_created_at = ["2026-07-07T12:00:00+00:00", "", "garbage-date", "9999-12-31"]
    with database_connection(get_settings().sqlite_path) as conn:
        for i in range(count):
            conn.execute(
                "INSERT INTO audit_logs (id, user_id, event_code, created_at) VALUES (?, ?, ?, ?)",
                (
                    f"dirty-audit-{uuid4().hex[:10]}",
                    owner_user_id,
                    codes[i % len(codes)],
                    dirty_created_at[i % len(dirty_created_at)],
                ),
            )


def _seed_dirty_projects(owner_user_id: str, count: int) -> None:
    dirty_graphs = [
        json.dumps({"language": {"id": "python"}, "framework": {"id": "fastapi"}}),
        json.dumps({"language": "python", "framework": "django"}),
        "not json {{{",
        "",
        json.dumps({"language": None, "framework": None}),
        json.dumps({"language": {"id": _SCRIPT_INJECTION}, "framework": {"id": _MOJIBAKE}}),
        json.dumps({"language": 12345, "framework": ["a", "list"]}),
    ]
    with database_connection(get_settings().sqlite_path) as conn:
        for i in range(count):
            pid = f"dirty-project-{uuid4().hex[:10]}"
            conn.execute(
                """
                INSERT INTO projects (
                    project_id, owner_user_id, workspace_id, project_key, project_name, status,
                    locale, generation_mode, technology_graph_json, architecture_id, archetype_id,
                    selected_capabilities_json, selected_business_modules_json, selected_endpoints_json,
                    blueprint_snapshot_json, prompt_master_snapshot_json, gatekeeper_snapshot_json,
                    readiness_status, contract_version, generated_project_path, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pid, owner_user_id, None, pid,
                    dirty_titles_for_projects(i), "generated", "pt-BR", "llm",
                    dirty_graphs[i % len(dirty_graphs)],
                    "monolith", "web-app",
                    "[]", "[]", "[]", "{}", "{}", "{}",
                    "ready", "v1",
                    None if i % 3 else f"/generated-projects/{pid}",
                    "2026-07-07T12:00:00+00:00", "2026-07-07T12:00:00+00:00",
                ),
            )


def dirty_titles_for_projects(i: int) -> str:
    options = ["", _HUGE[:2000], _SECRET_TITLE, _MOJIBAKE, "Projeto Normal", _SCRIPT_INJECTION]
    return options[i % len(options)]


def _current_user_id(client) -> str:
    response = client.get("/api/auth/me")
    assert response.status_code == 200, response.text
    return response.json()["id"] if "id" in response.json() else response.json()["user_id"]


DIRTY_VOLUME = 300


def test_analytics_survives_large_dirty_dataset(client):
    user_id = _current_user_id(client)
    _seed_dirty_rooms(user_id, DIRTY_VOLUME)
    _seed_dirty_audit_events(user_id, DIRTY_VOLUME)
    _seed_dirty_projects(user_id, 60)

    response = client.get("/api/analytics/overview")
    assert response.status_code == 200, response.text
    body = response.json()

    assert isinstance(body["metrics"], list)
    assert isinstance(body["sections"], list)
    section_ids = {s["id"] for s in body["sections"]}
    assert {"project_rooms", "llm", "meta_factory", "technology_trends", "laboratory"} <= section_ids

    for section in body["sections"]:
        assert section["status"] in {"available", "empty", "error"}

    # A pile of corrupted rows must not blank out the legitimate ones: the
    # project_rooms section must still report the rooms we just inserted.
    rooms_section = next(s for s in body["sections"] if s["id"] == "project_rooms")
    assert rooms_section["status"] == "available"
    assert rooms_section["metrics"][0]["value"] == DIRTY_VOLUME

    raw_text = response.text
    # The room title with an embedded api_key=sk-... must come back redacted.
    assert _SECRET_TITLE.split("api_key=")[1] not in raw_text
    assert "sk-" + "a" * 40 not in raw_text
    # The SQLi-lookalike title is just inert string data; it must round-trip
    # without ever being interpreted as SQL (no crash = proof of parameterization).


@pytest.mark.parametrize(
    "query",
    [
        "period=30d",
        "period=garbage",
        "status=TOTALLY_UNKNOWN_STATUS",
        "language=<script>alert(1)</script>",
        "module=project_rooms",
        "module=does_not_exist",
    ],
)
def test_analytics_filters_survive_dirty_dataset(client, query: str):
    user_id = _current_user_id(client)
    _seed_dirty_rooms(user_id, 50)
    _seed_dirty_audit_events(user_id, 50)
    _seed_dirty_projects(user_id, 20)

    response = client.get(f"/api/analytics/overview?{query}")
    assert response.status_code == 200, response.text


def test_single_corrupt_room_does_not_blank_out_other_real_rooms(client):
    """A single unparseable JSON row must not zero out the whole rooms section."""
    user_id = _current_user_id(client)

    good = client.post("/api/project-rooms", json={"title": "Sala Boa", "raw_intent": "App real"})
    assert good.status_code in (200, 201), good.text

    with database_connection(get_settings().sqlite_path) as conn:
        conn.execute(
            """
            INSERT INTO project_rooms (
                room_id, owner_user_id, workspace_id, title, status, delivery_type,
                preferred_language, raw_intent, locale, confidence, degraded,
                spec_json, messages_json, prompt_master_md, prompt_master_versions_json,
                architecture_blueprint_json, blueprint_versions_json, active_blueprint_version,
                generation_handoff_json, history_json, operational_log_json, last_failure_json,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "corrupt-room-1", user_id, None, "Sala Corrompida", "DRAFT", "web", "",
                "x", "pt-BR", 0.0, 0,
                "{not json at all", "[]", None, "[]", None, "[]", None, None, "[]", "[]", None,
                "2026-07-07T12:00:00+00:00", "2026-07-07T12:00:00+00:00",
            ),
        )

    response = client.get("/api/analytics/overview")
    assert response.status_code == 200, response.text
    body = response.json()
    rooms_section = next(s for s in body["sections"] if s["id"] == "project_rooms")
    # The good room created via the real API must still show up even though a
    # sibling row is corrupted at the storage layer.
    assert rooms_section["status"] == "available"
    assert rooms_section["metrics"][0]["value"] >= 1
    names = [r.get("name") for r in rooms_section["records"]]
    assert any("Sala Boa" in (n or "") for n in names)
