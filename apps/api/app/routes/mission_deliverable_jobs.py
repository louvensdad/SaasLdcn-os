from __future__ import annotations

import asyncio

from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from app.core.deps import CurrentUser
from app.engines.mission_deliverable_job_engine import MissionDeliverableJobEngine
from app.repositories.generation_notification_repository import generation_notification_repository
from app.routes.meta_factory_stream_helpers import _event_start_index, _sse
from app.routes.missions import _resolve_api_key
from app.schemas.mission import ConfirmArtifactsRequest, MissionInstance
from app.schemas.mission_deliverable_job import (
    CompileDeliverablesRequest,
    MissionDeliverableJob,
    RetryDeliverablesRequest,
)

router = APIRouter(tags=["mission-deliverables"])
engine = MissionDeliverableJobEngine()

TERMINAL_STREAM_STATUSES = {"DRAFTS_READY", "COMPLETED", "FAILED", "CANCELLED"}


def _require_mission(mission_id: str, user: dict) -> dict:
    mission = engine.mission_repository.get_for_owner(mission_id, user["user_id"])
    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Missão não encontrada.")
    return mission


def _require_job(job: dict | None) -> dict:
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job de entregáveis não encontrado.")
    return job


@router.post("/missions/{mission_id}/deliverables/compile", response_model=MissionDeliverableJob, status_code=status.HTTP_202_ACCEPTED)
def compile_mission_deliverables(mission_id: str, payload: CompileDeliverablesRequest, user: CurrentUser, response: Response) -> MissionDeliverableJob:
    mission = _require_mission(mission_id, user)
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice, capability="mission_artifact")
    job, created = engine.compile(
        mission_id, user["user_id"],
        artifact_definitions=[d.model_dump(mode="json") for d in payload.artifact_definitions],
        step_titles=payload.step_titles, api_key=api_key, user_model_choice=payload.user_model_choice,
        idempotency_key=payload.idempotency_key, workspace_id=mission.get("workspace_id"),
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return MissionDeliverableJob.model_validate(job)


@router.get("/missions/{mission_id}/deliverables/jobs/latest", response_model=MissionDeliverableJob | None)
def latest_mission_deliverable_job(mission_id: str, user: CurrentUser) -> MissionDeliverableJob | None:
    _require_mission(mission_id, user)
    job = engine.latest(mission_id, user["user_id"])
    return MissionDeliverableJob.model_validate(job) if job else None


@router.get("/missions/{mission_id}/deliverables/jobs/{job_id}", response_model=MissionDeliverableJob)
def get_mission_deliverable_job(mission_id: str, job_id: str, user: CurrentUser) -> MissionDeliverableJob:
    return MissionDeliverableJob.model_validate(_require_job(engine.get(job_id, user["user_id"])))


@router.get("/missions/{mission_id}/deliverables/jobs/{job_id}/events")
def stream_mission_deliverable_job(
    mission_id: str, job_id: str, request: Request, user: CurrentUser,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
) -> StreamingResponse:
    if engine.get(job_id, user["user_id"]) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job de entregáveis não encontrado.")

    async def events():
        last_revision = ""
        initial = engine.get(job_id, user["user_id"])
        last_event_index = _event_start_index((initial or {}).get("events", []), last_event_id)
        last_notif_created_at: str | None = None
        last_notif_id: str | None = None
        for tick in range(2400):
            if await request.is_disconnected():
                return
            job = engine.get(job_id, user["user_id"])
            if job is None:
                yield _sse({"type": "error", "detail": "Job de entregáveis não encontrado."})
                return
            job_events = job.get("events", [])
            start = min(last_event_index, len(job_events))
            for event in job_events[start:]:
                yield _sse({"type": "mission_deliverable_job_event", "event": event}, event_id=str(event["id"]))
            last_event_index = len(job_events)
            revision = (
                f'{job["status"]}:{len(job_events)}:{len(job["drafts"])}:'
                f'{1 if job.get("error") else 0}'
            )
            if revision != last_revision:
                yield _sse({"type": "mission_deliverable_job", "job": {**job, "events": []}})
                last_revision = revision
            elif tick % 10 == 0:
                yield _sse({"type": "heartbeat", "jobId": job_id, "status": job["status"]})
            # LDCN Multi-Agent Runtime, Phase 5: same live-feed pattern
            # meta_factory.py's stream already uses for GenerationJob, now
            # generalized via list_new_for_entity so a user watching this
            # job's stream sees notifications instantly too.
            new_notifications = generation_notification_repository.list_new_for_entity(
                "mission_deliverable_job", job_id, user["user_id"],
                since_created_at=last_notif_created_at, since_id=last_notif_id,
            )
            for notification in new_notifications:
                yield _sse({"type": "notification", "notification": notification}, event_id=f"notif_{notification['id']}")
                last_notif_created_at, last_notif_id = notification["created_at"], notification["id"]
            if job["status"] in TERMINAL_STREAM_STATUSES:
                return
            await asyncio.sleep(0.75)
        yield _sse({
            "type": "stream_timeout",
            "jobId": job_id,
            "message": "Stream expirou sem estado terminal; atualize manualmente ou reconecte.",
        })

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/missions/{mission_id}/deliverables/jobs/{job_id}/confirm", response_model=MissionInstance)
def confirm_mission_deliverable_job(mission_id: str, job_id: str, user: CurrentUser, payload: ConfirmArtifactsRequest | None = None) -> MissionInstance:
    artifacts = [a.model_dump(mode="json") for a in payload.artifacts] if payload is not None else None
    try:
        _job, mission = engine.confirm(job_id, user["user_id"], artifacts=artifacts)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return MissionInstance.model_validate(mission)


@router.post("/missions/{mission_id}/deliverables/jobs/{job_id}/retry", response_model=MissionDeliverableJob, status_code=status.HTTP_202_ACCEPTED)
def retry_mission_deliverable_job(mission_id: str, job_id: str, payload: RetryDeliverablesRequest, user: CurrentUser) -> MissionDeliverableJob:
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice, capability="mission_artifact")
    try:
        job = engine.retry(job_id, user["user_id"], api_key=api_key, user_model_choice=payload.user_model_choice)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return MissionDeliverableJob.model_validate(job)


@router.post("/missions/{mission_id}/deliverables/jobs/{job_id}/cancel", response_model=MissionDeliverableJob)
def cancel_mission_deliverable_job(mission_id: str, job_id: str, user: CurrentUser) -> MissionDeliverableJob:
    try:
        job = engine.cancel(job_id, user["user_id"])
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return MissionDeliverableJob.model_validate(job)
