from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
import shutil
import tempfile

import pytest

from app.core.database import Base, database_url_for, get_engine, session_factory
from app.engines.engineering_presence_engine import EngineeringPresenceEngine
from app.models.activity_event import ActivityEvent


def event(*, user: str, workspace: str, event_id: str, severity: str, importance: str, status: str = "failed", resolved_at: str | None = None, project: str | None = None) -> ActivityEvent:
    return ActivityEvent(id=event_id, user_id=user, workspace_id=workspace, project_id=project, category="security", action="critical_detected", status=status, metadata_json='{"token":"must-not-leak","summary":"safe summary"}', occurred_at=datetime.now(UTC).isoformat(), source="security_report", correlation_id=f"corr-{event_id}", severity=severity, importance=importance, evidence_ref="security.report.json", resolved_at=resolved_at)


@pytest.fixture
def engine():
    temp_root = Path(__file__).resolve().parents[1] / ".tmp-presence"
    temp_root.mkdir(parents=True, exist_ok=True)
    root = Path(tempfile.mkdtemp(dir=temp_root))
    database = root / "presence.db"
    url = database_url_for(database)
    Base.metadata.create_all(bind=get_engine(url))
    yield EngineeringPresenceEngine(database), database
    get_engine(url).dispose()
    shutil.rmtree(root, ignore_errors=True)


def test_critical_unresolved_event_dominates_and_resolved_event_does_not(engine):
    engine, database = engine
    with session_factory(database_url_for(database))() as session:
        session.add(event(user="u", workspace="a", event_id="critical", severity="CRITICAL", importance="BLOCKING"))
        session.add(event(user="u", workspace="a", event_id="resolved", severity="CRITICAL", importance="BLOCKING", resolved_at=datetime.now(UTC).isoformat(), status="success"))
        session.commit()
    assert engine.collect("u", "a")["status"] == "BLOCKED"
    assert engine.decisions("u", "a")["items"][0]["id"] == "critical"


def test_workspace_isolation_and_redaction(engine):
    engine, database = engine
    with session_factory(database_url_for(database))() as session:
        session.add(event(user="u", workspace="a", event_id="a-event", severity="WARNING", importance="HIGH"))
        session.add(event(user="u", workspace="b", event_id="b-event", severity="CRITICAL", importance="BLOCKING"))
        session.commit()
    result = engine.decisions("u", "a")
    assert [item["id"] for item in result["items"]] == ["a-event"]
    assert "must-not-leak" not in str(result)
    assert result["items"][0]["evidenceRef"] == "security.report.json"
