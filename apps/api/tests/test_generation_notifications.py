from __future__ import annotations

import tempfile
from pathlib import Path
from uuid import uuid4

import pytest

from app.engines.generation_job_engine import GenerationJobEngine
from app.repositories.generation_job_repository import GenerationJobRepository
from app.repositories.generation_notification_repository import generation_notification_repository
from app.schemas.orchestrator import ProjectSpec
from app.services.activity_feed_service import activity_feed_service
from app.services.file_protocol import EmittedFile, ParsedAgentOutput


@pytest.fixture
def client_scoped_engine(client):
    """Mirrors test_generation_job_pipeline.py's fixture of the same name: a
    GenerationJobEngine whose repository shares the *same* database as the
    `client` fixture's app, so workspace/auth rows created via the real HTTP
    flow are visible to it."""
    import shutil

    from app.core.config import get_settings

    checkpoint_root = Path(tempfile.mkdtemp(prefix="ldcn-generation-notif-checkpoints-"))
    repository = GenerationJobRepository(get_settings().sqlite_path)
    engine = GenerationJobEngine(repository, checkpoint_root)
    try:
        yield engine
    finally:
        shutil.rmtree(checkpoint_root, ignore_errors=True)


def _spec() -> ProjectSpec:
    return ProjectSpec(
        raw_intent="Sistema enterprise de pedidos",
        product_summary="Operacao de pedidos auditavel",
        entities=["Order", "Customer"],
        business_rules=["Somente operadores aprovam pedidos"],
        core_workflows=["Criar e aprovar pedido"],
    )


def _owner_id(client) -> str:
    return client.get("/api/auth/me").json()["user_id"]


def _register_second_user(client) -> str:
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"other_{uuid4().hex}@example.com",
            "password": "OtherPassword123!",
            "full_name": "Other User",
            "privacy_policy_accepted": True,
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["tokens"]["access_token"]


def _create(engine, owner_user_id: str, project_id: str = "room-notif") -> dict:
    return engine.create_job(
        owner_user_id=owner_user_id, project_id=project_id, workspace_id=None,
        project_name="Orders", spec=_spec(), blueprint={"decisions": []},
        blueprint_version=1, provider="anthropic", provider_label="Claude",
        model="claude-sonnet-4",
    )


def _notifications_for_job(client, job_id: str) -> list[dict]:
    response = client.get("/api/notifications", params={"limit": 100})
    assert response.status_code == 200, response.text
    return [item for item in response.json()["items"] if item["job_id"] == job_id]


@pytest.fixture
def emission_order(monkeypatch):
    """Records (type, stage) in the exact order `_notify` calls fire, since
    storage-layer ordering (created_at truncated to whole seconds, id is a
    random hex) can't reliably reconstruct creation order for several
    notifications emitted within the same second, as an in-process pipeline
    run does."""
    order: list[tuple[str, str | None]] = []
    original = generation_notification_repository.create_or_get_idempotent

    def _recording(owner, entity_type, entity_id, idem_key, build_data):  # noqa: ANN001
        notif, created = original(owner, entity_type, entity_id, idem_key, build_data)
        if created:
            order.append((notif["type"], notif["stage"]))
        return notif, created

    monkeypatch.setattr(generation_notification_repository, "create_or_get_idempotent", _recording)
    return order


def test_create_job_emits_task_queued(client, client_scoped_engine):
    owner = _owner_id(client)
    job = _create(client_scoped_engine, owner)

    notifications = _notifications_for_job(client, job["id"])
    assert [n["type"] for n in notifications] == ["TASK_QUEUED"]
    assert notifications[0]["severity"] == "INFO"
    assert notifications[0]["read"] is False


def test_deterministic_run_emits_ordered_stage_notifications_up_to_blocking_failure(client, client_scoped_engine, emission_order):
    """Deterministic mode (no LLM) reaches "backend" and stops there with
    NEEDS_USER_ACTION -- a real, unmocked run that exercises the exact
    ordering this feature promises: one STAGE_STARTED per *logical* stage
    (never per PLANNING/GENERATING/VALIDATING sub-status) and one
    STAGE_COMPLETED only for stages that actually finished."""
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-notif-det")
    engine.execute(job["id"], owner, api_key=None, user_model_choice=None, mode="deterministic")

    result = engine.get(job["id"], owner)
    assert result["status"] == "NEEDS_USER_ACTION"
    assert result["stageStatuses"]["backend"] == "failed"

    types = [notif_type for notif_type, _stage in emission_order]
    assert types[0] == "TASK_QUEUED"
    assert types[1] == "TASK_STARTED"
    # contracts and database each finished (STARTED + COMPLETED pairs);
    # backend only STARTED (it's what failed) -- no COMPLETED for it, and no
    # duplicate STARTED per its 3 granular sub-statuses.
    assert types.count("STAGE_STARTED") == 3
    assert types.count("STAGE_COMPLETED") == 2
    stage_started = [stage for notif_type, stage in emission_order if notif_type == "STAGE_STARTED"]
    assert stage_started == ["contracts", "database", "backend"]
    stage_completed = [stage for notif_type, stage in emission_order if notif_type == "STAGE_COMPLETED"]
    assert stage_completed == ["contracts", "database"]
    assert types[-1] == "TASK_WAITING_USER"

    waiting = next(n for n in _notifications_for_job(client, job["id"]) if n["type"] == "TASK_WAITING_USER")
    can_continue = bool((result.get("error") or {}).get("can_continue_with_warnings"))
    assert waiting["severity"] == ("WARNING" if can_continue else "ACTION_REQUIRED")


def test_full_run_to_ready_emits_task_started_and_task_completed(client, client_scoped_engine, monkeypatch, emission_order):
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-notif-ready")

    def _fake_agent(router, role, context, model, api_key, language=None, framework=None, model_strategy=None, **_kwargs):  # noqa: ANN001
        parsed = ParsedAgentOutput(raw_response="ok")
        if role == "contracts":
            parsed.files.append(EmittedFile("openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: x\n  version: 1.0.0\npaths: {}\n"))
        else:
            parsed.files.append(EmittedFile(f"src/{role}/main.ts", "export const x = 1;"))
        return None, parsed

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", _fake_agent)
    monkeypatch.setattr(engine, "_build", lambda job, owner: None)
    monkeypatch.setattr(engine, "_package", lambda job, owner: None)
    engine.execute(job["id"], owner, api_key="secret", user_model_choice="m")

    result = engine.get(job["id"], owner)
    assert result["status"] == "READY"

    types = [notif_type for notif_type, _stage in emission_order]
    assert types[0] == "TASK_QUEUED"
    assert types[1] == "TASK_STARTED"
    assert types[-1] == "TASK_COMPLETED"
    assert types.count("TASK_STARTED") == 1  # never re-notified per sub-stage


def test_finalize_pipeline_emits_build_completed_only_when_build_actually_passed(client, client_scoped_engine):
    """Unit-level: exercises _finalize_pipeline's outcome branch directly so
    BUILD_COMPLETED's condition (buildStatus == "PASSED") is proven both ways
    without needing to mock a real build subprocess."""
    owner = _owner_id(client)
    engine = client_scoped_engine

    job = _create(engine, owner, project_id="room-build-passed")
    job["buildStatus"] = "PASSED"
    engine._finalize_pipeline(job, owner, outcome="SUCCESS", message="ok")
    types = [n["type"] for n in _notifications_for_job(client, job["id"])]
    assert "TASK_COMPLETED" in types
    assert "BUILD_COMPLETED" in types

    job2 = _create(engine, owner, project_id="room-build-pending")
    job2["buildStatus"] = "PENDING"
    engine._finalize_pipeline(job2, owner, outcome="SUCCESS", message="ok")
    types2 = [n["type"] for n in _notifications_for_job(client, job2["id"])]
    assert "TASK_COMPLETED" in types2
    assert "BUILD_COMPLETED" not in types2


def test_finalize_pipeline_waiting_user_severity_splits_on_can_continue_with_warnings(client, client_scoped_engine):
    owner = _owner_id(client)
    engine = client_scoped_engine

    blocked = _create(engine, owner, project_id="room-blocked")
    blocked["error"] = {"can_continue_with_warnings": False}
    engine._finalize_pipeline(blocked, owner, outcome="NEEDS_USER_ACTION", message="blocked")
    notif = next(n for n in _notifications_for_job(client, blocked["id"]) if n["type"] == "TASK_WAITING_USER")
    assert notif["severity"] == "ACTION_REQUIRED"

    soft = _create(engine, owner, project_id="room-soft-block")
    soft["error"] = {"can_continue_with_warnings": True}
    engine._finalize_pipeline(soft, owner, outcome="NEEDS_USER_ACTION", message="soft")
    notif2 = next(n for n in _notifications_for_job(client, soft["id"]) if n["type"] == "TASK_WAITING_USER")
    assert notif2["severity"] == "WARNING"


def test_finalize_pipeline_stalled_and_failed_emit_distinct_types(client, client_scoped_engine):
    owner = _owner_id(client)
    engine = client_scoped_engine

    stalled = _create(engine, owner, project_id="room-stalled")
    stalled["error"] = {"timeout_seconds": 1500}
    engine._finalize_pipeline(stalled, owner, outcome="STALLED", message="stalled")
    stalled_types = {n["type"] for n in _notifications_for_job(client, stalled["id"])}
    assert "TASK_STALLED" in stalled_types
    assert "TASK_FAILED" not in stalled_types

    failed = _create(engine, owner, project_id="room-failed")
    engine._finalize_pipeline(failed, owner, outcome="FAILED", message="crash")
    failed_types = {n["type"] for n in _notifications_for_job(client, failed["id"])}
    assert "TASK_FAILED" in failed_types
    assert "TASK_STALLED" not in failed_types


def test_finalize_pipeline_degraded_continuation_does_not_emit_task_completed(client, client_scoped_engine):
    """Guards a deliberate gap: a build-skipped partial completion is not a
    clean success, and no canonical notification type honestly represents
    it -- it must stay un-notified, not silently mislabeled as COMPLETED."""
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-degraded")
    engine._finalize_pipeline(job, owner, outcome="DEGRADED_CONTINUATION", message="build skipped")
    types = {n["type"] for n in _notifications_for_job(client, job["id"])}
    assert "TASK_COMPLETED" not in types
    assert "BUILD_COMPLETED" not in types


def test_pause_emits_task_paused_not_task_cancelled(client, client_scoped_engine):
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-pause")
    engine.pause(job["id"], owner)

    types = [n["type"] for n in _notifications_for_job(client, job["id"])]
    assert "TASK_PAUSED" in types
    assert "TASK_CANCELLED" not in types


def test_retry_emits_task_retrying_with_a_fresh_key_each_attempt(client, client_scoped_engine, monkeypatch):
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-retry")
    monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)  # don't actually spawn a worker thread

    engine.retry_stage(job["id"], owner, "backend", api_key=None, user_model_choice=None, mode="normal")
    engine.retry_stage(job["id"], owner, "backend", api_key=None, user_model_choice=None, mode="normal")

    retrying = [n for n in _notifications_for_job(client, job["id"]) if n["type"] == "TASK_RETRYING"]
    assert len(retrying) == 2
    assert all(n["stage"] == "backend" for n in retrying)
    assert len({n["id"] for n in retrying}) == 2  # two distinct rows, not deduped


def test_notify_is_idempotent_for_identical_key(client, client_scoped_engine):
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-idem")

    engine._notify(job, owner, "STAGE_STARTED", severity="INFO", stage="contracts")
    engine._notify(job, owner, "STAGE_STARTED", severity="INFO", stage="contracts")

    matching = [n for n in _notifications_for_job(client, job["id"]) if n["type"] == "STAGE_STARTED" and n["stage"] == "contracts"]
    assert len(matching) == 1


def test_notifications_are_owner_scoped_404_not_500_on_cross_owner_read(client, client_scoped_engine):
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-cross-owner")
    notification_id = _notifications_for_job(client, job["id"])[0]["id"]

    other_token = _register_second_user(client)
    response = client.post(f"/api/notifications/{notification_id}/read", headers={"Authorization": f"Bearer {other_token}"})
    assert response.status_code == 404


def test_mark_all_read_only_affects_the_calling_user(client, client_scoped_engine):
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-mark-all")
    assert _notifications_for_job(client, job["id"])[0]["read"] is False

    other_token = _register_second_user(client)
    other_headers = {"Authorization": f"Bearer {other_token}"}

    marked = client.post("/api/notifications/read-all", headers=other_headers)
    assert marked.status_code == 200
    assert marked.json()["updated"] == 0  # the other user has no notifications of their own

    assert _notifications_for_job(client, job["id"])[0]["read"] is False  # untouched by the other user's call

    own_mark = client.post("/api/notifications/read-all")
    assert own_mark.json()["updated"] >= 1
    assert _notifications_for_job(client, job["id"])[0]["read"] is True


def test_generation_job_sse_streams_notification_frames_for_open_job(client, client_scoped_engine, monkeypatch):
    from app.routes import meta_factory as route

    owner = _owner_id(client)
    engine = client_scoped_engine
    monkeypatch.setattr(route, "generation_job_engine", engine)
    job = _create(engine, owner, project_id="room-sse-notif")
    engine.pause(job["id"], owner)  # a real terminal status so the stream ends on its own

    with client.stream("GET", f"/api/meta-factory/jobs/{job['id']}/events") as response:
        assert response.status_code == 200
        body = "".join(response.iter_text())

    assert '"type": "notification"' in body or '"type":"notification"' in body
    assert "TASK_QUEUED" in body
    assert "TASK_PAUSED" in body


# --- LDCN Multi-Agent Runtime, Phase 1: unified Event Bus dual-write ---------- #

def _activity_feed_generation_events(client, job_id: str) -> list[dict]:
    # Queries the service directly rather than GET /api/activity-feed: the
    # route always resolves an unspecified workspace_id to the caller's
    # *personal* workspace (see activity_feed.py:_workspace), which would
    # silently exclude these jobs -- _create() intentionally creates them
    # with workspace_id=None (see its own docstring) to bypass the
    # WorkspaceMembership check, matching the rest of this file's tests.
    owner = _owner_id(client)
    result = activity_feed_service.list(owner, workspace_id=None, category="generation", limit=100)
    return [item for item in result["items"] if item["metadata"].get("job_id") == job_id]


def test_create_job_also_publishes_a_named_activity_event(client, client_scoped_engine):
    """The notification and the activity-feed event are two independent
    write paths off the same _notify() call -- this proves the SECOND one
    (Phase 1's addition) actually lands, not just the first."""
    owner = _owner_id(client)
    job = _create(client_scoped_engine, owner, project_id="room-notif-activity")

    events = _activity_feed_generation_events(client, job["id"])
    assert len(events) == 1
    assert events[0]["action"] == "task_queued"
    assert events[0]["source"] == "event_catalog"
    assert events[0]["metadata"]["severity"] == "INFO"


def test_pause_publishes_task_paused_not_task_cancelled_on_the_activity_feed(client, client_scoped_engine):
    """Regression guard for the same honest-deviation decision as the
    notification itself: the activity feed must never call this
    'cancelled' either."""
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-notif-activity-pause")
    engine.pause(job["id"], owner)

    actions = {event["action"] for event in _activity_feed_generation_events(client, job["id"])}
    assert "task_paused" in actions
    assert "task_cancelled" not in actions


def test_deterministic_run_activity_events_match_notification_types(client, client_scoped_engine):
    """The activity feed and the notification center are fed by the SAME
    _notify() call -- their action/type sets must always agree, or the two
    "event bus" layers have silently drifted apart."""
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-notif-activity-det")
    engine.execute(job["id"], owner, api_key=None, user_model_choice=None, mode="deterministic")

    notif_types = {n["type"] for n in _notifications_for_job(client, job["id"])}
    activity_actions = {event["action"] for event in _activity_feed_generation_events(client, job["id"])}
    # snake_case(action) must be the exact lowercase of each TYPE_UPPER_SNAKE.
    assert activity_actions == {t.lower() for t in notif_types}


def test_unmapped_notification_type_never_raises(client, client_scoped_engine):
    """named_event_for_generation_notification() returning None for an
    unmapped type must be a silent no-op, never an exception that could mask
    the real notification write next to it."""
    owner = _owner_id(client)
    engine = client_scoped_engine
    job = _create(engine, owner, project_id="room-notif-unmapped")
    engine._notify(job, owner, "NOT_A_REAL_TYPE", severity="INFO")  # type: ignore[arg-type]

    # The (still-real) notification write must have happened -- checked via
    # the repository directly, since GenerationNotification's schema (by
    # design) strictly validates `type` against the real Literal, and would
    # reject this deliberately-fake row the same way GET /api/notifications
    # correctly rejects any row that doesn't match a real notification type.
    stored, _ = generation_notification_repository.list_for_user(owner, limit=100)
    assert any(n["type"] == "NOT_A_REAL_TYPE" and n["job_id"] == job["id"] for n in stored)
    # ...and no activity event was fabricated for a type the catalog doesn't know.
    assert not any(
        event["metadata"].get("job_id") == job["id"] and event["action"] == "not_a_real_type"
        for event in _activity_feed_generation_events(client, job["id"])
    )


# --- LDCN Multi-Agent Runtime, Phase 2: polymorphic entity_type/entity_id --- #

def test_notification_carries_entity_type_and_id_redundant_with_job_id(client, client_scoped_engine):
    """Every GenerationJob notification sets entity_type/entity_id to the
    same subject job_id already names -- proves the general mechanism is
    live without needing a second producer to exist yet."""
    owner = _owner_id(client)
    job = _create(client_scoped_engine, owner, project_id="room-notif-entity")

    notifications = _notifications_for_job(client, job["id"])
    assert len(notifications) == 1
    assert notifications[0]["entity_type"] == "generation_job"
    assert notifications[0]["entity_id"] == job["id"]
    assert notifications[0]["entity_id"] == notifications[0]["job_id"]


def test_list_notifications_filters_by_entity_type(client, client_scoped_engine):
    owner = _owner_id(client)
    job = _create(client_scoped_engine, owner, project_id="room-notif-entity-filter")

    matching = client.get("/api/notifications", params={"entity_type": "generation_job", "limit": 100})
    assert matching.status_code == 200, matching.text
    assert any(item["job_id"] == job["id"] for item in matching.json()["items"])

    non_matching = client.get("/api/notifications", params={"entity_type": "mission", "limit": 100})
    assert non_matching.status_code == 200, non_matching.text
    assert not any(item["job_id"] == job["id"] for item in non_matching.json()["items"])


def test_omitting_entity_type_returns_every_subject_unchanged(client, client_scoped_engine):
    """The default (no entity_type param) behavior must be pixel-identical
    to before Phase 2 -- this is the whole point of "additive"."""
    owner = _owner_id(client)
    job = _create(client_scoped_engine, owner, project_id="room-notif-entity-default")

    response = client.get("/api/notifications", params={"limit": 100})
    assert response.status_code == 200, response.text
    assert any(item["job_id"] == job["id"] for item in response.json()["items"])


def test_backfilled_rows_from_before_phase_2_are_still_readable(client, client_scoped_engine):
    """A row inserted the OLD way (no entity_type/entity_id in build_data,
    simulating a pre-migration row before the backfill UPDATE ran) must not
    break reads -- the columns are nullable, and the repository/schema must
    tolerate None."""
    owner = _owner_id(client)
    job = _create(client_scoped_engine, owner, project_id="room-notif-legacy-row")
    generation_notification_repository.create_or_get_idempotent(
        owner, "generation_job", job["id"], "LEGACY_TYPE:legacy:0",
        lambda: {
            "id": "gnotif_legacy00000001", "user_id": owner, "workspace_id": None, "project_id": job.get("projectId"),
            "job_id": job["id"], "type": "TASK_STARTED", "severity": "INFO", "stage": None,
            "read": False, "action_url": None, "metadata": {}, "idempotency_key": "LEGACY_TYPE:legacy:0",
            "created_at": generation_notification_repository._now(),
            # entity_type/entity_id deliberately omitted, like a pre-Phase-2 row
        },
    )
    response = client.get("/api/notifications", params={"limit": 100})
    assert response.status_code == 200, response.text
    legacy = next(item for item in response.json()["items"] if item["id"] == "gnotif_legacy00000001")
    assert legacy["entity_type"] is None
    assert legacy["entity_id"] is None
