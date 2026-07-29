from __future__ import annotations

from typing import Literal

# Máquina de Estados Global (vault 44 - Estados/Máquina de Estados Global.md).
# The vault's own note (dated 2026-07-19) found this abstract 12-state model
# has zero literal correspondence in the code -- the real system uses two
# separate, more granular enums (ProjectRoomStatus, the pre-generation phase;
# GenerationJob's `currentStage`, ~28 build stages) -- and posed two ways to
# close the gap: keep the abstract model as a conceptual layer over the real
# enums, or retire it. User confirmed the mapping-function path 2026-07-20.
#
# Two real semantic mismatches found while building this mapping (documented
# here rather than silently smoothed over):
#   1. The abstract sequence places "Waiting Approval" AFTER Testing/Deploying
#      -- a release-approval gate. The real system's approval gates (Blueprint
#      approval, Engineering Review) all happen BEFORE generation starts. This
#      mapping reports the real semantic meaning of each state (an approval
#      gate IS "Waiting Approval" wherever it occurs), not the abstract
#      model's assumed chronological position.
#   2. "Executing", "Preview" and "Deploying" have NO representation in either
#      real enum at all -- Live Preview and Staging are entirely separate
#      status tracks (LivePreviewStatus, StagingStatus) that only exist AFTER
#      a room/job reaches READY, not sub-states of ProjectRoomStatus or
#      GenerationJobStatus. This function accepts optional preview/staging
#      status so it can report those three buckets correctly when that
#      context is available -- callers with only a room/job status can never
#      produce them, which is accurate, not a limitation of the mapping.
#   3. Neither "Failed" nor "Paused" exists in the abstract vault model at
#      all (it only describes the happy path). Both map to "Archived" here
#      (vault's closest meaning: "no longer active") rather than inventing a
#      13th bucket the vault doesn't define.

AbstractState = Literal[
    "Idle", "Receiving Request", "Planning", "Generating", "Building",
    "Executing", "Preview", "Testing", "Waiting Approval", "Deploying",
    "Published", "Archived",
]

_ROOM_STATUS_MAP: dict[str, AbstractState] = {
    "DRAFT": "Idle",
    "UNDER_REVIEW": "Receiving Request",
    "PROMPT_READY": "Receiving Request",
    "PROMPT_APPROVED": "Planning",
    "BLUEPRINT_GENERATING": "Planning",
    "BLUEPRINT_READY": "Waiting Approval",
    "ENGINEERING_REVIEW": "Waiting Approval",
    "ENGINEERING_APPROVED": "Waiting Approval",
    "WAITING_META_FACTORY": "Waiting Approval",
    "META_FACTORY_RUNNING": "Generating",
    "GENERATING": "Generating",
    "VALIDATING": "Testing",
    "READY": "Published",
    "FAILED": "Archived",
    "ARCHIVED": "Archived",
}

# GenerationJob's `currentStage` values (generation_pipeline_policy.py's STEPS
# + MOBILE_STEPS), grouped by their real "logical"/"action" meaning.
_JOB_STAGE_MAP: dict[str, AbstractState] = {
    "PREPARING_CONTEXT": "Planning",
    "CONTRACTS_PLANNING": "Planning", "CONTRACTS_GENERATING": "Generating", "CONTRACTS_VALIDATING": "Testing",
    "DATABASE_PLANNING": "Planning", "DATABASE_GENERATING": "Generating", "DATABASE_VALIDATING": "Testing",
    "BACKEND_PLANNING": "Planning", "BACKEND_GENERATING": "Generating", "BACKEND_VALIDATING": "Testing",
    "FRONTEND_PLANNING": "Planning", "FRONTEND_GENERATING": "Generating", "FRONTEND_VALIDATING": "Testing",
    "MOBILE_PLANNING": "Planning", "MOBILE_GENERATING": "Generating", "MOBILE_VALIDATING": "Testing",
    "SECURITY_PLANNING": "Planning", "SECURITY_VALIDATING": "Testing",
    "TESTS_GENERATING": "Generating", "TESTS_RUNNING": "Testing",
    "DOCUMENTATION_GENERATING": "Generating",
    "BUILD_RUNNING": "Building", "PACKAGE_CREATING": "Building",
}

# job["status"] values that override/take precedence over `currentStage` --
# these describe the JOB's overall condition, not which stage is running.
_JOB_STATUS_MAP: dict[str, AbstractState] = {
    "QUEUED": "Idle",
    "READY": "Published",
    "NEEDS_USER_ACTION": "Waiting Approval",
    "STALLED": "Waiting Approval",
    "FAILED": "Archived",
    "PAUSED": "Archived",
}


def abstract_state_for(
    *,
    room_status: str | None = None,
    job_status: str | None = None,
    job_stage: str | None = None,
    live_preview_status: str | None = None,
    staging_status: str | None = None,
) -> AbstractState | None:
    """Pure mapping, no I/O. Precedence when multiple inputs are given: an
    active preview/staging session (the only real source for "Executing"/
    "Preview"/"Deploying") wins over the job, which wins over the room --
    matches how a generated project's real lifecycle actually nests (a room
    can have a finished job that's currently being previewed)."""
    if live_preview_status == "running":
        return "Preview"
    if staging_status == "running":
        return "Deploying"
    if job_status is not None and job_status in _JOB_STATUS_MAP:
        return _JOB_STATUS_MAP[job_status]
    if job_stage is not None and job_stage in _JOB_STAGE_MAP:
        return _JOB_STAGE_MAP[job_stage]
    if room_status is not None:
        return _ROOM_STATUS_MAP.get(room_status)
    return None
