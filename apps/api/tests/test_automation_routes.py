from __future__ import annotations

from types import SimpleNamespace

from app.engines import automation_engine


def _create(client, **overrides):
    body = {"title": "Ping API", "action_config": {"method": "GET", "url": "https://example.com"}}
    body.update(overrides)
    return client.post("/api/automations", json=body)


def test_create_list_get_delete(client):
    created = _create(client)
    assert created.status_code == 201
    automation = created.json()
    assert automation["status"] == "draft"

    listed = client.get("/api/automations")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    fetched = client.get(f"/api/automations/{automation['id']}")
    assert fetched.status_code == 200

    deleted = client.delete(f"/api/automations/{automation['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/automations/{automation['id']}").status_code == 404


def test_manual_automation_activates_without_a_cron(client):
    automation = _create(client).json()
    response = client.post(f"/api/automations/{automation['id']}/activate")
    assert response.status_code == 200
    assert response.json()["status"] == "active"


def test_scheduled_automation_requires_a_valid_cron_to_create(client):
    response = _create(client, trigger_type="scheduled", trigger_config={"cron": "not a cron", "timezone": "UTC"})
    assert response.status_code == 422


def test_scheduled_automation_computes_next_run_at_on_activation(client):
    automation = _create(client, trigger_type="scheduled", trigger_config={"cron": "0 0 * * *", "timezone": "UTC"}).json()
    assert automation["next_run_at"] is None

    activated = client.post(f"/api/automations/{automation['id']}/activate")
    assert activated.status_code == 200
    assert activated.json()["next_run_at"] is not None


def test_pause_and_archive(client):
    automation = _create(client).json()
    client.post(f"/api/automations/{automation['id']}/activate")

    paused = client.post(f"/api/automations/{automation['id']}/pause")
    assert paused.json()["status"] == "paused"

    archived = client.post(f"/api/automations/{automation['id']}/archive")
    assert archived.json()["status"] == "archived"


def test_credentials_are_never_returned_by_any_endpoint(client):
    automation = _create(client).json()
    set_response = client.put(f"/api/automations/{automation['id']}/credentials", json={"name": "token", "value": "sk-super-secret"})
    assert set_response.status_code == 200
    assert "sk-super-secret" not in set_response.text
    assert "value" not in set_response.json()

    listed = client.get(f"/api/automations/{automation['id']}/credentials")
    assert listed.status_code == 200
    assert listed.json() == [{"id": listed.json()[0]["id"], "name": "token", "created_at": listed.json()[0]["created_at"], "updated_at": listed.json()[0]["updated_at"]}]
    assert "sk-super-secret" not in listed.text


def test_delete_credential(client):
    automation = _create(client).json()
    client.put(f"/api/automations/{automation['id']}/credentials", json={"name": "token", "value": "x"})

    deleted = client.delete(f"/api/automations/{automation['id']}/credentials/token")
    assert deleted.status_code == 204

    missing = client.delete(f"/api/automations/{automation['id']}/credentials/token")
    assert missing.status_code == 404


def test_run_now_executes_for_real_and_records_history(client, monkeypatch):
    monkeypatch.setattr(automation_engine.httpx, "request", lambda *a, **k: SimpleNamespace(status_code=200, text="pong"))
    automation = _create(client).json()

    response = client.post(f"/api/automations/{automation['id']}/run")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["trigger_source"] == "manual"

    runs = client.get(f"/api/automations/{automation['id']}/runs")
    assert runs.status_code == 200
    assert len(runs.json()) == 1


def test_automation_is_owner_scoped(client):
    from uuid import uuid4

    automation = _create(client).json()

    register = client.post(
        "/api/auth/register",
        json={"email": f"other_{uuid4().hex}@example.com", "password": "TestPassword123!", "full_name": "Other", "privacy_policy_accepted": True},
    )
    other_token = register.json()["tokens"]["access_token"]

    response = client.get(f"/api/automations/{automation['id']}", headers={"Authorization": f"Bearer {other_token}"})
    assert response.status_code == 404
