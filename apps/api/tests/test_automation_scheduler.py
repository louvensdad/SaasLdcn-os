from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.core.config import get_settings
from app.engines import automation_engine
from app.repositories.automation_repository import AutomationRepository
from app.services.automation_scheduler import AutomationScheduler, compute_next_run_at


def _repo() -> AutomationRepository:
    return AutomationRepository(get_settings().sqlite_path)


def test_compute_next_run_at_is_real_cron_math_not_a_guess():
    base = datetime(2026, 7, 20, 10, 0, tzinfo=timezone.utc)
    next_run = compute_next_run_at("0 * * * *", "UTC", base=base)  # every hour on the hour
    assert next_run == "2026-07-20T11:00:00+00:00"


def test_compute_next_run_at_respects_timezone():
    base = datetime(2026, 7, 20, 10, 0, tzinfo=timezone.utc)
    # 9am in America/Sao_Paulo (UTC-3) is 12:00 UTC.
    next_run = compute_next_run_at("0 9 * * *", "America/Sao_Paulo", base=base)
    assert next_run == "2026-07-20T12:00:00+00:00"


def test_poll_once_runs_a_due_automation_and_reschedules_it(client, monkeypatch):
    monkeypatch.setattr(automation_engine, "_send_request", lambda *a, **k: SimpleNamespace(status_code=200, text="ok"))
    repo = _repo()
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).replace(microsecond=0).isoformat()
    automation = repo.create(
        owner_user_id="user-1", title="Ping", trigger_type="scheduled",
        trigger_config={"cron": "*/5 * * * *", "timezone": "UTC"}, action_config={"method": "GET", "url": "https://1.1.1.1"},
    )
    repo.set_status(automation["id"], "user-1", "active")
    repo.set_next_run_at(automation["id"], past)

    scheduler = AutomationScheduler(repository=repo)
    scheduler._poll_once()

    runs = repo.list_runs(automation["id"], "user-1")
    assert len(runs) == 1
    assert runs[0]["trigger_source"] == "scheduled"
    assert runs[0]["status"] == "succeeded"

    refreshed = repo.get_for_owner(automation["id"], "user-1")
    assert refreshed["next_run_at"] is not None
    assert refreshed["next_run_at"] > past


def test_poll_once_ignores_paused_and_manual_automations(client, monkeypatch):
    monkeypatch.setattr(automation_engine, "_send_request", lambda *a, **k: SimpleNamespace(status_code=200, text="ok"))
    repo = _repo()
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).replace(microsecond=0).isoformat()

    paused = repo.create(owner_user_id="user-1", title="Paused", trigger_type="scheduled", trigger_config={"cron": "* * * * *"}, action_config={"method": "GET", "url": "https://1.1.1.1"})
    repo.set_next_run_at(paused["id"], past)  # never activated -- stays "draft"

    manual = repo.create(owner_user_id="user-1", title="Manual", trigger_type="manual", action_config={"method": "GET", "url": "https://1.1.1.1"})
    repo.set_status(manual["id"], "user-1", "active")

    scheduler = AutomationScheduler(repository=repo)
    scheduler._poll_once()

    assert repo.list_runs(paused["id"], "user-1") == []
    assert repo.list_runs(manual["id"], "user-1") == []


def test_start_and_stop_are_idempotent_and_fast(client):
    scheduler = AutomationScheduler(repository=_repo())
    scheduler.start()
    scheduler.start()  # no-op, must not spawn a second thread
    scheduler.stop()
    scheduler.stop()  # no-op, must not raise
