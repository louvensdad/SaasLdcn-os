from __future__ import annotations

from app.engines.global_state_mapping import abstract_state_for


def test_room_status_maps_to_expected_bucket():
    assert abstract_state_for(room_status="DRAFT") == "Idle"
    assert abstract_state_for(room_status="PROMPT_READY") == "Receiving Request"
    assert abstract_state_for(room_status="PROMPT_APPROVED") == "Planning"
    assert abstract_state_for(room_status="BLUEPRINT_READY") == "Waiting Approval"
    assert abstract_state_for(room_status="GENERATING") == "Generating"
    assert abstract_state_for(room_status="VALIDATING") == "Testing"
    assert abstract_state_for(room_status="READY") == "Published"
    assert abstract_state_for(room_status="FAILED") == "Archived"
    assert abstract_state_for(room_status="ARCHIVED") == "Archived"


def test_unknown_room_status_returns_none():
    assert abstract_state_for(room_status="NOT_A_REAL_STATUS") is None


def test_no_input_returns_none():
    assert abstract_state_for() is None


def test_job_stage_maps_to_expected_bucket():
    assert abstract_state_for(job_stage="BACKEND_PLANNING") == "Planning"
    assert abstract_state_for(job_stage="BACKEND_GENERATING") == "Generating"
    assert abstract_state_for(job_stage="BACKEND_VALIDATING") == "Testing"
    assert abstract_state_for(job_stage="BUILD_RUNNING") == "Building"
    assert abstract_state_for(job_stage="PACKAGE_CREATING") == "Building"


def test_job_status_takes_precedence_over_job_stage():
    # NEEDS_USER_ACTION overrides whatever stage the job is nominally sitting on.
    assert abstract_state_for(job_status="NEEDS_USER_ACTION", job_stage="BACKEND_GENERATING") == "Waiting Approval"
    assert abstract_state_for(job_status="FAILED", job_stage="BACKEND_GENERATING") == "Archived"


def test_job_status_and_stage_take_precedence_over_room_status():
    assert abstract_state_for(room_status="DRAFT", job_status="READY") == "Published"
    assert abstract_state_for(room_status="DRAFT", job_stage="BUILD_RUNNING") == "Building"


def test_live_preview_running_wins_over_everything():
    assert abstract_state_for(room_status="READY", job_status="READY", live_preview_status="running") == "Preview"


def test_staging_running_wins_over_room_and_job_but_not_preview():
    assert abstract_state_for(room_status="READY", staging_status="running") == "Deploying"
    assert (
        abstract_state_for(room_status="READY", live_preview_status="running", staging_status="running")
        == "Preview"
    )


def test_non_running_preview_or_staging_status_does_not_override():
    assert abstract_state_for(room_status="READY", live_preview_status="stopped") == "Published"
    assert abstract_state_for(room_status="READY", staging_status="failed") == "Published"
