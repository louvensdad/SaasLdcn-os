from __future__ import annotations

import pytest

from app.core.event_catalog import EVENT_CATALOG, emit_named_event, named_event_for_generation_notification
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
        "ExternalPreviewOpened", "FrontendRestarted", "BackendRestarted",
        "MarketplaceItemPublished", "MarketplaceItemInstalled",
        "TrialStarted", "TrialExpired", "TrialConverted", "SubscriptionCreated", "SubscriptionChanged",
        "SubscriptionCancelled", "PlanLimitReached", "PlanFeatureBlocked",
        "StudentVerificationRequested", "StudentVerificationExpired", "StudentRevalidationRequested",
        # LDCN Multi-Agent Runtime, Phase 1: the unified Event Bus dual-write
        # from GenerationJobEngine._notify() -- see event_catalog.py's
        # named_event_for_generation_notification().
        "GenerationTaskQueued", "GenerationTaskStarted", "GenerationStageStarted", "GenerationStageCompleted",
        "GenerationTaskWaitingUser", "GenerationTaskRetrying", "GenerationTaskStalled", "GenerationTaskFailed",
        "GenerationTaskPaused", "GenerationTaskCompleted", "GenerationBuildCompleted",
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


@pytest.mark.parametrize("notification_type", [
    "TASK_QUEUED", "TASK_STARTED", "STAGE_STARTED", "STAGE_COMPLETED", "TASK_WAITING_USER",
    "TASK_RETRYING", "TASK_STALLED", "TASK_FAILED", "TASK_PAUSED", "TASK_COMPLETED", "BUILD_COMPLETED",
])
def test_every_generation_notification_type_maps_to_a_wired_catalog_entry(notification_type: str):
    event_name = named_event_for_generation_notification(notification_type)
    assert event_name is not None
    assert event_name in EVENT_CATALOG
    assert EVENT_CATALOG[event_name].wired is True
    assert EVENT_CATALOG[event_name].category == "generation"


def test_named_event_for_generation_notification_returns_none_for_an_unmapped_type():
    assert named_event_for_generation_notification("NOT_A_REAL_TYPE") is None
