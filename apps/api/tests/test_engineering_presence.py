from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.core.database import session_factory
from app.engines.engineering_presence_engine import EngineeringPresenceEngine
from app.models.persistence import GenerationJob
from app.services.activity_feed_service import activity_feed_service


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _insert_job(user_id: str, *, status: str, stage: str | None = None) -> None:
    sessions = session_factory(get_settings().sqlite_path)
    now = _now()
    with sessions.begin() as session:
        session.add(
            GenerationJob(
                id=f"job_{status}_{user_id}", owner_user_id=user_id, project_id="proj-1",
                status=status, stage=stage, data_json="{}", spec_json="{}", blueprint_json="{}",
                created_at=now, updated_at=now,
            )
        )


class TestEngineeringPresenceEngine:
    def test_no_signals_is_healthy(self, client):
        del client
        engine = EngineeringPresenceEngine(get_settings().sqlite_path)
        result = engine.collect("presence-user-empty")
        assert result["status"] == "HEALTHY"

    def test_running_job_is_processing(self, client):
        del client
        _insert_job("presence-user-running", status="CONTRACTS_GENERATING", stage="CONTRACTS_GENERATING")
        engine = EngineeringPresenceEngine(get_settings().sqlite_path)
        result = engine.collect("presence-user-running")
        assert result["status"] == "PROCESSING"
        assert "proj-1" in result["activity"]

    def test_failed_job_is_failed(self, client):
        del client
        _insert_job("presence-user-failed", status="FAILED")
        engine = EngineeringPresenceEngine(get_settings().sqlite_path)
        result = engine.collect("presence-user-failed")
        assert result["status"] == "FAILED"

    def test_blocked_job_is_blocked(self, client):
        del client
        _insert_job("presence-user-blocked", status="NEEDS_USER_ACTION")
        engine = EngineeringPresenceEngine(get_settings().sqlite_path)
        result = engine.collect("presence-user-blocked")
        assert result["status"] == "BLOCKED"

    def test_recent_warning_activity_without_a_job_is_warning(self, client):
        del client
        activity_feed_service.record(
            user_id="presence-user-warning", category="quality_gate", action="validate", status="warning",
        )
        engine = EngineeringPresenceEngine(get_settings().sqlite_path)
        result = engine.collect("presence-user-warning")
        assert result["status"] == "WARNING"

    def test_stale_warning_activity_falls_back_to_healthy(self, client):
        del client
        sessions = session_factory(get_settings().sqlite_path)
        from app.models.activity_event import ActivityEvent

        stale = (datetime.now(timezone.utc) - timedelta(hours=2)).replace(microsecond=0).isoformat()
        with sessions.begin() as session:
            session.add(
                ActivityEvent(
                    id="evt_stale", user_id="presence-user-stale", category="quality_gate", action="validate",
                    status="warning", occurred_at=stale, source="test", correlation_id="corr-stale",
                )
            )
        engine = EngineeringPresenceEngine(get_settings().sqlite_path)
        result = engine.collect("presence-user-stale")
        assert result["status"] == "HEALTHY"


class TestSystemPresenceRoute:
    def test_route_returns_healthy_for_a_fresh_user(self, client):
        response = client.get("/api/system/presence")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "HEALTHY"
        assert "activity" in payload
        assert "updated" in payload

    def test_route_requires_auth(self, client):
        authorization = client.headers.pop("Authorization")
        try:
            response = client.get("/api/system/presence")
        finally:
            client.headers["Authorization"] = authorization
        assert response.status_code == 401
