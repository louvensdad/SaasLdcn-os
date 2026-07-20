from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.engines import metering_engine
from app.repositories.metering_repository import MeteringRepository, current_period_start


def _repo() -> MeteringRepository:
    return MeteringRepository(get_settings().sqlite_path)


# ------------------------------------------------------------------- recording

def test_record_consumption_is_real_and_queryable(client):
    metering_engine.record_consumption(owner_user_id="user-1", resource_type="llm_tokens", quantity=1500, unit="tokens", origin="test")
    used = _repo().sum_for_owner("user-1", "llm_tokens", since=current_period_start())
    assert used == 1500


def test_record_consumption_skips_zero_or_negative_quantity(client):
    metering_engine.record_consumption(owner_user_id="user-1", resource_type="generation_run", quantity=0, unit="count", origin="test")
    metering_engine.record_consumption(owner_user_id="user-1", resource_type="generation_run", quantity=-1, unit="count", origin="test")
    assert _repo().sum_for_owner("user-1", "generation_run", since=current_period_start()) == 0


def test_record_consumption_never_raises_on_a_backend_failure(client, monkeypatch):
    def _boom(*a, **k):
        raise RuntimeError("db exploded")

    monkeypatch.setattr(MeteringRepository, "record", _boom)
    metering_engine.record_consumption(owner_user_id="user-1", resource_type="llm_tokens", quantity=10, unit="tokens", origin="test")  # must not raise


def test_consumption_is_owner_scoped(client):
    metering_engine.record_consumption(owner_user_id="user-a", resource_type="generation_run", quantity=1, unit="count", origin="test")
    metering_engine.record_consumption(owner_user_id="user-b", resource_type="generation_run", quantity=1, unit="count", origin="test")
    assert _repo().sum_for_owner("user-a", "generation_run", since=current_period_start()) == 1
    assert _repo().sum_for_owner("user-b", "generation_run", since=current_period_start()) == 1


def test_consumption_only_counts_within_the_current_period(client):
    repo = _repo()
    repo.record(owner_user_id="user-1", resource_type="generation_run", quantity=1, unit="count", origin="old")
    with repo._sessions.begin() as session:
        from app.models.metering import MeteringRecord

        old_time = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
        session.query(MeteringRecord).filter_by(owner_user_id="user-1").update({"occurred_at": old_time})

    assert repo.sum_for_owner("user-1", "generation_run", since=current_period_start()) == 0


# ------------------------------------------------------------------------ summary

def test_usage_summary_groups_by_resource_type(client):
    metering_engine.record_consumption(owner_user_id="user-1", resource_type="llm_tokens", quantity=100, unit="tokens", origin="a")
    metering_engine.record_consumption(owner_user_id="user-1", resource_type="llm_tokens", quantity=50, unit="tokens", origin="b")
    metering_engine.record_consumption(owner_user_id="user-1", resource_type="generation_run", quantity=1, unit="count", origin="c")

    summary = {item["resource_type"]: item["quantity"] for item in metering_engine.usage_summary("user-1")}
    assert summary["llm_tokens"] == 150
    assert summary["generation_run"] == 1


# -------------------------------------------------------------------- entitlements

def test_entitlement_is_unlimited_by_default_never_a_fabricated_number(client):
    check = metering_engine.check_entitlement("user-1", "llm_tokens")
    assert check.monthly_limit is None
    assert check.allowed is True
    assert check.used == 0


def test_entitlement_respects_a_real_configured_limit(client):
    _repo().set_limit("user-1", "generation_run", 5, updated_by_user_id="user-1")
    for _ in range(4):
        metering_engine.record_consumption(owner_user_id="user-1", resource_type="generation_run", quantity=1, unit="count", origin="x")

    check = metering_engine.check_entitlement("user-1", "generation_run")
    assert check.monthly_limit == 5
    assert check.used == 4
    assert check.allowed is True

    metering_engine.record_consumption(owner_user_id="user-1", resource_type="generation_run", quantity=1, unit="count", origin="x")
    check = metering_engine.check_entitlement("user-1", "generation_run")
    assert check.used == 5
    assert check.allowed is False  # used >= limit


def test_entitlement_limit_is_owner_scoped(client):
    _repo().set_limit("user-a", "generation_run", 1, updated_by_user_id="user-a")
    assert metering_engine.check_entitlement("user-b", "generation_run").monthly_limit is None
