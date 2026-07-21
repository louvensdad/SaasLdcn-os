from __future__ import annotations

import pytest

from app.core.event_catalog import EVENT_CATALOG, emit_named_event
from app.repositories.activity_event_repository import activity_event_repository


def test_catalog_entries_have_consistent_shape():
    assert len(EVENT_CATALOG) > 0
    for name, event in EVENT_CATALOG.items():
        assert name
        assert event.category
        assert event.action
        assert event.payload_version >= 1
        assert event.producer
        assert isinstance(event.consumers, tuple) and len(event.consumers) > 0
        assert isinstance(event.wired, bool)


def test_wired_events_are_the_documented_ones():
    wired = {name for name, event in EVENT_CATALOG.items() if event.wired}
    assert wired == {
        "ProjectCreated", "BlueprintGenerated", "PreviewStarted", "PreviewStopped",
        "MarketplaceItemPublished", "MarketplaceItemInstalled",
        "TrialStarted", "TrialExpired", "TrialConverted", "SubscriptionCreated", "SubscriptionChanged",
        "SubscriptionCancelled", "PlanLimitReached", "PlanFeatureBlocked",
        "StudentVerificationRequested", "StudentVerificationExpired", "StudentRevalidationRequested",
    }


def test_emit_named_event_rejects_unknown_event():
    with pytest.raises(ValueError):
        emit_named_event("NotARealEvent", "user-1")


def test_emit_named_event_records_a_real_activity_event(client):
    user_id = f"user_{id(object())}"
    emit_named_event("ProjectCreated", user_id, project_id="proj-1", metadata={"title": "Test"})
    result = activity_event_repository.list_for_user(user_id, workspace_id=None, limit=10)
    assert len(result) == 1
    event = result[0]
    assert event["category"] == "project"
    assert event["action"] == "created"
    assert event["project_id"] == "proj-1"
    assert event["source"] == "event_catalog"
    metadata = event["metadata_json"]
    assert '"payload_version":1' in metadata
    assert '"title":"Test"' in metadata
