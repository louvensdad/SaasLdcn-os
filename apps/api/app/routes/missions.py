from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import CurrentUser
from app.engines.llm.base import LLMError
from app.registry.missions_registry import MissionSummary, list_mission_summaries
from app.repositories.tenant_repository import TenantAccessError, TenantRepository, WORKSPACE_WRITE_ROLES
from app.schemas.mission import (
    ArtifactDraft,
    AutosaveMissionRequest,
    ConfirmArtifactsRequest,
    CreateMissionRequest,
    ExecuteFieldActionRequest,
    FieldActionResult,
    GenerateArtifactsPreviewResponse,
    GenerateArtifactsRequest,
    MissionInstance,
    MissionInstanceSummary,
    RecordDecisionRequest,
)
from app.services.llm_settings_service import llm_provider_resolver
from app.services.mission_service import MissionError, MissionService

router = APIRouter(tags=["missions"])
service = MissionService()


def _resolve_api_key(user: dict, *, use_user_key: bool, user_model_choice: str | None, capability: str = "mission", workspace_id: str | None = None) -> str | None:
    if not use_user_key:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Mission Workspace requires a validated user API key.")
    context = llm_provider_resolver.resolve(
        workspace_id=workspace_id, user_id=user["user_id"], requested_capability=capability,
        requested_model=user_model_choice, deterministic=False,
    )
    if context.resolution.mode == "llm":
        return context.api_key
    if use_user_key:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{context.resolution.reason} API key não disponível.")
    return None


def _writable_workspace(user: dict, requested_workspace_id: str | None) -> dict:
    repository = TenantRepository()
    if requested_workspace_id:
        try:
            return repository.require_workspace(requested_workspace_id, user["user_id"], WORKSPACE_WRITE_ROLES)
        except TenantAccessError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found or insufficient permission.") from exc
    workspace = repository.personal_workspace(user["user_id"])
    return workspace or repository.ensure_personal_workspace(user["user_id"], user["full_name"])


def _to_model(mission: dict[str, Any]) -> MissionInstance:
    return MissionInstance.model_validate(mission)


def _to_summary(mission: dict[str, Any]) -> MissionInstanceSummary:
    return MissionInstanceSummary.model_validate({**mission, "progress": (mission.get("journey") or {}).get("progress", 0)})


def _require(mission: dict[str, Any] | None) -> dict[str, Any]:
    if mission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Missão não encontrada.")
    return mission


@router.get("/missions/registry", response_model=list[MissionSummary])
def get_missions_registry() -> list[MissionSummary]:
    return list_mission_summaries()


@router.get("/missions", response_model=list[MissionInstanceSummary])
def list_missions(user: CurrentUser) -> list[MissionInstanceSummary]:
    return [_to_summary(mission) for mission in service.list_missions(user["user_id"])]


@router.post("/missions", response_model=MissionInstance, status_code=status.HTTP_201_CREATED)
def create_mission(payload: CreateMissionRequest, user: CurrentUser) -> MissionInstance:
    workspace = _writable_workspace(user, payload.workspace_id)
    try:
        mission = service.create_mission(
            owner_user_id=user["user_id"], mission_type=payload.mission_type, title=payload.title,
            mode=payload.mode, experience_level=payload.experience_level, workspace_id=workspace["workspace_id"],
        )
    except MissionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(mission)


@router.get("/missions/{mission_id}", response_model=MissionInstance)
def get_mission(mission_id: str, user: CurrentUser) -> MissionInstance:
    return _to_model(_require(service.get_mission(mission_id, user["user_id"])))


@router.patch("/missions/{mission_id}", response_model=MissionInstance)
def autosave_mission(mission_id: str, payload: AutosaveMissionRequest, user: CurrentUser) -> MissionInstance:
    changes = payload.model_dump(exclude_unset=True, mode="json")
    mission = service.autosave(mission_id, user["user_id"], changes)
    return _to_model(_require(mission))


@router.post("/missions/{mission_id}/decisions", response_model=MissionInstance)
def record_mission_decision(mission_id: str, payload: RecordDecisionRequest, user: CurrentUser) -> MissionInstance:
    mission = service.record_decision(
        mission_id, user["user_id"], step_id=payload.step_id, field_id=payload.field_id,
        value=payload.value, source=payload.source, reason=payload.reason,
    )
    return _to_model(_require(mission))


@router.post("/missions/{mission_id}/ai-action", response_model=FieldActionResult)
def execute_mission_field_action(mission_id: str, payload: ExecuteFieldActionRequest, user: CurrentUser) -> FieldActionResult:
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice, capability="mission_field_action")
    try:
        result = service.execute_field_action(
            mission_id, user["user_id"], step_id=payload.step_id, field_id=payload.field_id, action_id=payload.action_id,
            specialist=payload.specialist, interpolated_prompt=payload.interpolated_prompt, insert_mode=payload.insert_mode,
            api_key=api_key, user_model_choice=payload.user_model_choice,
        )
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Missão não encontrada.")
    return FieldActionResult.model_validate(result)


@router.post("/missions/{mission_id}/artifacts/preview", response_model=GenerateArtifactsPreviewResponse)
def preview_mission_artifacts(mission_id: str, payload: GenerateArtifactsRequest, user: CurrentUser) -> GenerateArtifactsPreviewResponse:
    _require(service.get_mission(mission_id, user["user_id"]))
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice, capability="mission_artifact")
    try:
        result = service.draft_artifacts(
            mission_id, user["user_id"],
            artifact_definitions=[d.model_dump(mode="json") for d in payload.artifact_definitions],
            step_titles=payload.step_titles,
            api_key=api_key, user_model_choice=payload.user_model_choice,
        )
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Missão não encontrada.")
    drafts, degraded = result
    return GenerateArtifactsPreviewResponse(drafts=[ArtifactDraft.model_validate(d) for d in drafts], degraded=degraded)


@router.post("/missions/{mission_id}/artifacts/confirm", response_model=MissionInstance)
def confirm_mission_artifacts(mission_id: str, payload: ConfirmArtifactsRequest, user: CurrentUser) -> MissionInstance:
    _require(service.get_mission(mission_id, user["user_id"]))
    updated = service.confirm_artifacts(mission_id, user["user_id"], artifacts=[a.model_dump(mode="json") for a in payload.artifacts])
    return _to_model(_require(updated))


@router.post("/missions/{mission_id}/archive", response_model=MissionInstance)
def archive_mission(mission_id: str, user: CurrentUser) -> MissionInstance:
    return _to_model(_require(service.archive(mission_id, user["user_id"])))


@router.delete("/missions/{mission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mission(mission_id: str, user: CurrentUser) -> Response:
    if not service.delete(mission_id, user["user_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Missão não encontrada.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
