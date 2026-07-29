from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.config import get_settings
from app.engines import automation_engine
from app.repositories.automation_repository import AutomationRepository


def _repo() -> AutomationRepository:
    return AutomationRepository(get_settings().sqlite_path)


def _fake_response(status_code: int, text: str = "ok"):
    return SimpleNamespace(status_code=status_code, text=text)


@pytest.fixture(autouse=True)
def _public_test_destination(monkeypatch):
    monkeypatch.setattr(
        automation_engine,
        "resolve_public_http_target",
        lambda url, *, resolve_dns: SimpleNamespace(url=url, hostname="x", port=443, addresses=("93.184.216.34",)),
    )


# --------------------------------------------------------------- placeholder resolution + masking

def test_resolve_action_config_substitutes_credential_placeholders():
    config = {"method": "GET", "url": "https://api.example.com/{{credential:token}}", "headers": {"Authorization": "Bearer {{credential:token}}"}, "body": None}
    resolved = automation_engine.resolve_action_config(config, {"token": "sk-real-secret"})
    assert resolved["url"] == "https://api.example.com/sk-real-secret"
    assert resolved["headers"]["Authorization"] == "Bearer sk-real-secret"


def test_mask_request_never_leaks_the_real_credential_value():
    config = {"method": "GET", "url": "https://api.example.com", "headers": {"Authorization": "Bearer sk-real-secret"}, "body": "token=sk-real-secret"}
    masked = automation_engine.mask_request(config, {"token": "sk-real-secret"})
    assert "sk-real-secret" not in masked["headers"]["Authorization"]
    assert "sk-real-secret" not in masked["body"]
    assert "[REDACTED:token]" in masked["headers"]["Authorization"]


# --------------------------------------------------------------- execute_http_action

def test_execute_http_action_succeeds_on_first_try(monkeypatch):
    monkeypatch.setattr(automation_engine, "_send_request", lambda *a, **k: _fake_response(200, "hello"))
    status_code, text, error, attempts = automation_engine.execute_http_action({"method": "GET", "url": "https://x"}, {})
    assert (status_code, text, error, attempts) == (200, "hello", None, 1)


def test_execute_http_action_retries_on_5xx_then_succeeds(monkeypatch):
    calls = {"n": 0}

    def _flaky(*a, **k):
        calls["n"] += 1
        return _fake_response(500) if calls["n"] < 3 else _fake_response(200, "recovered")

    monkeypatch.setattr(automation_engine, "_send_request", _flaky)
    monkeypatch.setattr(automation_engine.time, "sleep", lambda _: None)
    status_code, text, error, attempts = automation_engine.execute_http_action({"method": "GET", "url": "https://x"}, {})
    assert (status_code, text, attempts) == (200, "recovered", 3)


def test_execute_http_action_gives_up_after_max_attempts(monkeypatch):
    monkeypatch.setattr(automation_engine, "_send_request", lambda *a, **k: _fake_response(503))
    monkeypatch.setattr(automation_engine.time, "sleep", lambda _: None)
    status_code, text, error, attempts = automation_engine.execute_http_action({"method": "GET", "url": "https://x"}, {})
    assert status_code == 503
    assert attempts == automation_engine._MAX_ATTEMPTS


def test_execute_http_action_handles_transport_errors(monkeypatch):
    import httpx as httpx_module

    def _boom(*a, **k):
        raise httpx_module.ConnectError("connection refused")

    monkeypatch.setattr(automation_engine, "_send_request", _boom)
    monkeypatch.setattr(automation_engine.time, "sleep", lambda _: None)
    status_code, text, error, attempts = automation_engine.execute_http_action({"method": "GET", "url": "https://x"}, {})
    assert status_code is None
    assert "connection refused" in error
    assert attempts == automation_engine._MAX_ATTEMPTS


# --------------------------------------------------------------- run_automation orchestration

def test_run_automation_records_a_succeeded_run_and_never_persists_the_real_secret(client, monkeypatch):
    monkeypatch.setattr(automation_engine, "_send_request", lambda *a, **k: _fake_response(200, "pong"))
    repo = _repo()
    automation = repo.create(
        owner_user_id="user-1", title="Ping", action_config={"method": "GET", "url": "https://x/{{credential:token}}"},
    )
    repo.set_credential(automation["id"], "user-1", "token", "sk-secret")

    result = automation_engine.run_automation(automation, trigger_source="manual", repository=repo)
    assert result["status"] == "succeeded"
    assert result["response_status_code"] == 200
    # The PERSISTED request keeps the placeholder syntax, never the resolved
    # secret -- resolution happens only inside execute_http_action(), which
    # never returns or persists the resolved config.
    assert result["masked_request"]["url"] == "https://x/{{credential:token}}"
    assert "sk-secret" not in result["masked_request"]["url"]


def test_run_automation_masks_a_credential_value_echoed_back_in_the_response(client, monkeypatch):
    """The real leak risk: an external API echoing a resolved secret back in
    its response body (e.g. an error message quoting the bad Authorization
    header) -- this is what mask_request/_mask on the response actually
    guards against, unlike the request template (see test above)."""
    monkeypatch.setattr(automation_engine, "_send_request", lambda *a, **k: _fake_response(200, "your token was sk-secret, rejected"))
    repo = _repo()
    automation = repo.create(owner_user_id="user-1", title="Echo", action_config={"method": "GET", "url": "https://x/{{credential:token}}"})
    repo.set_credential(automation["id"], "user-1", "token", "sk-secret")

    result = automation_engine.run_automation(automation, trigger_source="manual", repository=repo)
    assert "sk-secret" not in result["masked_response"]["body"]
    assert "[REDACTED:token]" in result["masked_response"]["body"]


def test_run_automation_records_a_failed_run_on_client_error(client, monkeypatch):
    monkeypatch.setattr(automation_engine, "_send_request", lambda *a, **k: _fake_response(404, "not found"))
    repo = _repo()
    automation = repo.create(owner_user_id="user-1", title="Broken", action_config={"method": "GET", "url": "https://x"})

    result = automation_engine.run_automation(automation, trigger_source="manual", repository=repo)
    assert result["status"] == "failed"
    assert result["response_status_code"] == 404


def test_run_automation_rejects_an_unsupported_action_type(client):
    repo = _repo()
    automation = repo.create(owner_user_id="user-1", title="X", action_type="send_email", action_config={})
    result = automation_engine.run_automation(automation, trigger_source="manual", repository=repo)
    assert result["status"] == "failed"
    assert "Unsupported action_type" in result["error"]
