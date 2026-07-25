from __future__ import annotations

from dataclasses import dataclass

from app.services.activity_feed_service import activity_feed_service

# Named Platform Events (vault 43 - Eventos/Catálogo de eventos da plataforma.md).
# The vault's own note (dated 2026-07-19) found this gap and posed two ways to
# close it: introduce named events as a semantic layer over the existing
# generic ActivityEvent{category,action,status}, or formalize category/action
# as the official taxonomy. User confirmed the semantic-layer path 2026-07-20.
#
# Scope: NOT every event below gets a brand-new emission point wired in this
# pass -- three (marked wired=True) have no existing tracking at all and are
# wired for real (ProjectCreated, BlueprintGenerated, PreviewStarted/Stopped).
# The rest are documented as MAPPED to infrastructure that already covers
# them honestly (llm_decision_traces for PromptExecuted, AutomationRun for
# AutomationExecuted, generation_job_engine's existing "generation"/"stage_finished"
# records for BuildStarted/BuildFinished, etc.) -- adding a second, redundant
# ActivityEvent for something already tracked in more detail elsewhere would
# be noise, not a real improvement. `wired=False` events are catalog-only:
# real documentation of producer/consumers/payload version, not yet emitted.


@dataclass(frozen=True)
class NamedEvent:
    category: str
    action: str
    payload_version: int
    producer: str  # file:function that emits (or should emit) this event
    consumers: tuple[str, ...]
    wired: bool  # True: real ActivityEvent emission exists today (this pass or earlier)


# Reprocessing an identical event must never duplicate effects (vault rule) --
# activity_feed_service.record() already generates a fresh correlation_id per
# call and this catalog does not introduce idempotency keys of its own; a
# caller needing replay-safety supplies its own stable origin as metadata
# (same pattern already used by llm_decision_traces/metering_records' `origin`).
EVENT_CATALOG: dict[str, NamedEvent] = {
    "ProjectCreated": NamedEvent(
        category="project", action="created", payload_version=1,
        producer="project_room_service.py:ProjectRoomService.create_room",
        consumers=("activity feed", "Evolution Engine (indirectly, via generation outcomes)"),
        wired=True,
    ),
    "ProjectUpdated": NamedEvent(
        category="project", action="updated", payload_version=1,
        producer="project_room_service.py:ProjectRoomService._orchestrator_turn",
        consumers=("activity feed",),
        wired=False,  # every conversation turn would be high-volume; not wired this pass
    ),
    "BlueprintGenerated": NamedEvent(
        category="project", action="blueprint_generated", payload_version=1,
        producer="project_room_service.py:ProjectRoomService.generate_blueprint",
        consumers=("activity feed",),
        wired=True,
    ),
    "BuildStarted": NamedEvent(
        category="generation", action="build_started", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._execute_step (action=='build')",
        consumers=("activity feed",),
        wired=False,  # mapped: generation_job_engine already records a "generation"/stage_finished ActivityEvent per stage, including build
    ),
    "BuildFinished": NamedEvent(
        category="generation", action="build_finished", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._finalize_pipeline",
        consumers=("activity feed", "Evolution Engine", "Metering"),
        wired=False,  # mapped: same "generation" category events + evolution_signals + metering_records already cover this outcome
    ),
    "AgentFinished": NamedEvent(
        category="generation", action="agent_finished", payload_version=1,
        producer="factory_pipeline.py:iter_single_agent (SSE event, not persisted)",
        consumers=("frontend live console",),
        wired=False,  # real SSE event exists; no persisted ActivityEvent -- would be very high-volume (one per agent per stage)
    ),
    "AgentFailed": NamedEvent(
        category="generation", action="agent_failed", payload_version=1,
        producer="factory_pipeline.py:iter_single_agent (SSE event, not persisted)",
        consumers=("frontend live console",),
        wired=False,
    ),
    "PreviewStarted": NamedEvent(
        category="preview", action="started", payload_version=1,
        producer="live_preview_service.py:LivePreviewService.start",
        consumers=("activity feed",),
        wired=True,
    ),
    "PreviewStopped": NamedEvent(
        category="preview", action="stopped", payload_version=1,
        producer="live_preview_service.py:LivePreviewService.stop / idle reap",
        consumers=("activity feed",),
        wired=True,
    ),
    "DeployStarted": NamedEvent(
        category="staging", action="deploy_started", payload_version=1,
        producer="staging_service.py:StagingService.deploy",
        consumers=("activity feed",),
        wired=False,  # "Produção gerenciada" doesn't exist (see staging_service.py); mapped conceptually to Staging, not wired this pass
    ),
    "DeployFinished": NamedEvent(
        category="staging", action="deploy_finished", payload_version=1,
        producer="staging_service.py:StagingService.deploy",
        consumers=("activity feed", "Metering"),
        wired=False,  # mapped: metering_records already tracks every real staging deploy outcome
    ),
    "PromptExecuted": NamedEvent(
        category="llm", action="prompt_executed", payload_version=1,
        producer="app/engines/llm/router.py:LLMRouter.route",
        consumers=("AI decision-observability", "Metering"),
        wired=False,  # mapped: llm_decision_traces already records every router call in more detail than a generic event would
    ),
    "MemoryUpdated": NamedEvent(
        category="memory", action="updated", payload_version=1,
        producer="memory_engine.py:record_memories",
        consumers=("activity feed",),
        wired=False,  # mapped: memories table itself is the real, richer record (created_at/updated_at/status transitions)
    ),
    "AutomationExecuted": NamedEvent(
        category="automation", action="executed", payload_version=1,
        producer="automation_engine.py:run_automation",
        consumers=("activity feed", "Metering"),
        wired=False,  # mapped: automation_runs + metering_records already cover every execution in more detail
    ),
    "MarketplaceItemPublished": NamedEvent(
        category="marketplace", action="item_published", payload_version=1,
        producer="marketplace_service.py:MarketplaceService.publish / .republish",
        consumers=("activity feed",),
        wired=True,
    ),
    "MarketplaceItemInstalled": NamedEvent(
        category="marketplace", action="item_installed", payload_version=1,
        producer="marketplace_service.py:MarketplaceService.install",
        consumers=("activity feed",),
        wired=True,
    ),
    "TrialStarted": NamedEvent(
        category="billing", action="trial_started", payload_version=1,
        producer="billing_service.py:BillingService.start_trial",
        consumers=("activity feed",),
        wired=True,
    ),
    "TrialExpired": NamedEvent(
        category="billing", action="trial_expired", payload_version=1,
        producer="billing_service.py:BillingService.get_trial / plan_access_engine.py:PlanAccessEngine.check",
        consumers=("activity feed",),
        wired=True,
    ),
    "SubscriptionCreated": NamedEvent(
        category="billing", action="subscription_created", payload_version=1,
        producer="billing_service.py:BillingService.subscribe",
        consumers=("activity feed",),
        wired=True,
    ),
    "SubscriptionChanged": NamedEvent(
        category="billing", action="subscription_changed", payload_version=1,
        producer="billing_service.py:BillingService.subscribe",
        consumers=("activity feed",),
        wired=True,
    ),
    "SubscriptionCancelled": NamedEvent(
        category="billing", action="subscription_cancelled", payload_version=1,
        producer="billing_service.py:BillingService.cancel",
        consumers=("activity feed",),
        wired=True,
    ),
    "PlanLimitReached": NamedEvent(
        category="billing", action="plan_limit_reached", payload_version=1,
        producer="plan_access_engine.py:PlanAccessEngine.check",
        consumers=("activity feed",),
        wired=True,
    ),
    "PlanFeatureBlocked": NamedEvent(
        category="billing", action="plan_feature_blocked", payload_version=1,
        producer="plan_access_engine.py:PlanAccessEngine.check",
        consumers=("activity feed",),
        wired=True,
    ),
    "TrialConverted": NamedEvent(
        category="billing", action="trial_converted", payload_version=1,
        producer="billing_service.py:BillingService.subscribe / billing_repository.py:BillingRepository.convert_trial",
        consumers=("activity feed",),
        wired=True,  # real ACTIVE->CONVERTED transition when a user subscribes during an active trial
    ),
    "SubscriptionActivated": NamedEvent(
        category="billing", action="subscription_activated", payload_version=1,
        producer="billing_repository.py:BillingRepository.subscribe",
        consumers=("activity feed",),
        wired=False,  # mapped: a new subscription is created directly as ACTIVE -- SubscriptionCreated already covers it, no separate activation step exists
    ),
    "SubscriptionRenewed": NamedEvent(
        category="billing", action="subscription_renewed", payload_version=1,
        producer="(none)",
        consumers=("activity feed",),
        wired=False,  # no billing-cycle renewal exists -- would require real payment processing to know a renewal succeeded, not fabricated
    ),
    "SubscriptionExpired": NamedEvent(
        category="billing", action="subscription_expired", payload_version=1,
        producer="(none)",
        consumers=("activity feed",),
        wired=False,  # same reason as SubscriptionRenewed -- current_period_end is stored but nothing lazily auto-cancels on it (would fabricate a payment-failure policy)
    ),
    "UsageRecorded": NamedEvent(
        category="billing", action="usage_recorded", payload_version=1,
        producer="metering_engine.py:record_consumption",
        consumers=("activity feed", "Billing"),
        wired=False,  # mapped: metering_records already records every real consumption event in more detail
    ),
    "TrialExpirationWarningIssued": NamedEvent(
        category="billing", action="trial_expiration_warning_issued", payload_version=1,
        producer="(none)",
        consumers=("activity feed", "frontend trial banner"),
        wired=False,  # deferred (confirmed with the user 2026-07-21): no scheduled-notification infrastructure exists to fire a 24h/6h/1h warning
    ),
    "StudentVerificationRequested": NamedEvent(
        category="billing", action="student_verification_requested", payload_version=1,
        producer="student_eligibility_service.py:StudentEligibilityService.submit",
        consumers=("activity feed",),
        wired=True,
    ),
    "StudentVerificationApproved": NamedEvent(
        category="billing", action="student_verification_approved", payload_version=1,
        producer="student_repository.py:StudentRepository.approve",
        consumers=("activity feed",),
        wired=False,  # real state transition exists but has no HTTP route -- no platform staff/admin role exists yet to gate approving ANOTHER user's document (confirmed scope 2026-07-21)
    ),
    "StudentVerificationRejected": NamedEvent(
        category="billing", action="student_verification_rejected", payload_version=1,
        producer="student_repository.py:StudentRepository.reject",
        consumers=("activity feed",),
        wired=False,  # same reason as StudentVerificationApproved
    ),
    "StudentVerificationExpired": NamedEvent(
        category="billing", action="student_verification_expired", payload_version=1,
        producer="student_repository.py:StudentRepository.latest",
        consumers=("activity feed",),
        wired=True,  # real lazy transition, same pattern as TrialExpired
    ),
    "StudentRevalidationRequested": NamedEvent(
        category="billing", action="student_revalidation_requested", payload_version=1,
        producer="student_repository.py:StudentRepository.latest",
        consumers=("activity feed",),
        wired=True,  # real lazy transition, same pattern as TrialExpired
    ),
    "StudentPlanActivated": NamedEvent(
        category="billing", action="student_plan_activated", payload_version=1,
        producer="(none)",
        consumers=("activity feed",),
        wired=False,  # mapped: subscribing to plan_code=STUDENT already goes through SubscriptionCreated/Changed -- no automatic link from an approved verification to a subscription exists yet
    ),
    "StudentPlanCancelled": NamedEvent(
        category="billing", action="student_plan_cancelled", payload_version=1,
        producer="(none)",
        consumers=("activity feed",),
        wired=False,  # would fire once verification-expiry <-> subscription-downgrade is wired; real gap, not built this pass
    ),

    # LDCN Multi-Agent Runtime, Phase 1 (Event Bus unification): the 11
    # GenerationNotificationType values are the already-deduplicated,
    # meaningful-lifecycle-transition layer for a GenerationJob (see
    # generation_notification_repository.py) -- unlike the BuildStarted/
    # BuildFinished entries above, these are NOT already covered elsewhere,
    # because generation_notifications did not exist when those were
    # written. Deliberately NOT wiring GenerationJobEngine._emit()'s raw
    # per-command/per-stage console events here too -- that stream is
    # throttled to every 400ms and would be exactly the high-volume noise
    # AgentFinished/AgentFailed above were kept unwired to avoid.
    "GenerationTaskQueued": NamedEvent(
        category="generation", action="task_queued", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (TASK_QUEUED)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
    "GenerationTaskStarted": NamedEvent(
        category="generation", action="task_started", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (TASK_STARTED)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
    "GenerationStageStarted": NamedEvent(
        category="generation", action="stage_started", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (STAGE_STARTED)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
    "GenerationStageCompleted": NamedEvent(
        category="generation", action="stage_completed", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (STAGE_COMPLETED)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
    "GenerationTaskWaitingUser": NamedEvent(
        category="generation", action="task_waiting_user", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (TASK_WAITING_USER)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
    "GenerationTaskRetrying": NamedEvent(
        category="generation", action="task_retrying", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (TASK_RETRYING)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
    "GenerationTaskStalled": NamedEvent(
        category="generation", action="task_stalled", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (TASK_STALLED)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
    "GenerationTaskFailed": NamedEvent(
        category="generation", action="task_failed", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (TASK_FAILED)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
    "GenerationTaskPaused": NamedEvent(
        category="generation", action="task_paused", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (TASK_PAUSED)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
    "GenerationTaskCompleted": NamedEvent(
        category="generation", action="task_completed", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (TASK_COMPLETED)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
    "GenerationBuildCompleted": NamedEvent(
        category="generation", action="build_completed", payload_version=1,
        producer="generation_job_engine.py:GenerationJobEngine._notify (BUILD_COMPLETED)",
        consumers=("activity feed", "Notification Center"), wired=True,
    ),
}

# GenerationNotificationType (generation_notification_repository.py) -> the
# catalog entry it publishes through. Centralized here, not in
# generation_job_engine.py, so the mapping can never drift from the catalog
# it maps into -- test_event_catalog.py checks every key resolves.
_GENERATION_NOTIFICATION_EVENT_NAMES: dict[str, str] = {
    "TASK_QUEUED": "GenerationTaskQueued",
    "TASK_STARTED": "GenerationTaskStarted",
    "STAGE_STARTED": "GenerationStageStarted",
    "STAGE_COMPLETED": "GenerationStageCompleted",
    "TASK_WAITING_USER": "GenerationTaskWaitingUser",
    "TASK_RETRYING": "GenerationTaskRetrying",
    "TASK_STALLED": "GenerationTaskStalled",
    "TASK_FAILED": "GenerationTaskFailed",
    "TASK_PAUSED": "GenerationTaskPaused",
    "TASK_COMPLETED": "GenerationTaskCompleted",
    "BUILD_COMPLETED": "GenerationBuildCompleted",
}


def named_event_for_generation_notification(notification_type: str) -> str | None:
    """Maps a GenerationNotificationType to its catalog entry name, so
    `_notify()` never hand-rolls category/action for the activity feed.
    Returns None for a type this catalog doesn't (yet) know about -- callers
    must treat that as "skip," never raise."""
    return _GENERATION_NOTIFICATION_EVENT_NAMES.get(notification_type)


def emit_named_event(event_name: str, user_id: str, *, workspace_id: str | None = None, project_id: str | None = None, metadata: dict | None = None) -> None:
    """Real emission for a catalog entry -- looks up category/action so a
    caller never hand-writes them (and drifts from the catalog). Fault-isolated
    the same way activity_feed_service.record() already is."""
    event = EVENT_CATALOG.get(event_name)
    if event is None:
        raise ValueError(f"'{event_name}' is not a cataloged platform event.")
    activity_feed_service.record(
        user_id=user_id, category=event.category, action=event.action, status="success",
        metadata={"payload_version": event.payload_version, **(metadata or {})},
        workspace_id=workspace_id, project_id=project_id, source="event_catalog",
    )
