from __future__ import annotations

import json
import queue
import threading
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from app.core.deps import CurrentUser
from app.engines.llm.base import LLMError
from app.schemas.project_room import (
    AcknowledgePreviewRequest,
    CreateRoomRequest,
    ImportPromptMasterRequest,
    LlmActionRequest,
    MarkGeneratedRequest,
    PostMessageRequest,
    ProjectRoom,
    ProjectRoomSummary,
    RevisePromptRequest,
    StackApprovalRequest,
)
from app.services.project_room_service import (
    ProjectRoomError,
    ProjectRoomImportError,
    ProjectRoomService,
)
from app.services.llm_settings_service import llm_provider_resolver
from app.repositories.tenant_repository import TenantAccessError, TenantRepository, WORKSPACE_WRITE_ROLES

router = APIRouter(tags=["project-rooms"])
service = ProjectRoomService()


def _resolve_api_key(
    user: dict,
    *,
    use_user_key: bool,
    user_model_choice: str | None,
    capability: str = "project_room",
    mode: str = "llm",
    provider_override: str | None = None,
    require_llm: bool = False,
    workspace_id: str | None = None,
) -> str | None:
    context = llm_provider_resolver.resolve(
        workspace_id=workspace_id,
        user_id=user["user_id"],
        requested_capability=capability,
        optional_override_provider=provider_override,
        requested_model=user_model_choice,
        deterministic=mode == "deterministic",
    )
    if context.resolution.mode == "llm":
        return context.api_key
    if use_user_key or require_llm:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{context.resolution.reason} API key não disponível.",
        )
    return None


def _writable_workspace(user: dict, requested_workspace_id: str | None) -> dict:
    repository = TenantRepository()
    if requested_workspace_id:
        try:
            return repository.require_workspace(
                requested_workspace_id,
                user["user_id"],
                WORKSPACE_WRITE_ROLES,
            )
        except TenantAccessError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found or insufficient permission.",
            ) from exc
    workspace = repository.personal_workspace(user["user_id"])
    return workspace or repository.ensure_personal_workspace(user["user_id"], user["full_name"])

def _to_model(room: dict[str, Any]) -> ProjectRoom:
    open_questions = (room.get("spec") or {}).get("open_questions") or []
    return ProjectRoom.model_validate({**room, "open_questions": open_questions})


def _to_summary(room: dict[str, Any]) -> ProjectRoomSummary:
    return ProjectRoomSummary.model_validate(
        {**room, "has_prompt_master": bool(room.get("prompt_master_md"))}
    )


def _require(room: dict[str, Any] | None) -> dict[str, Any]:
    # 404 (not 403) for a foreign/unknown room: never leak that it exists.
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sala nÃƒÆ’Ã‚Â£o encontrada.")
    return room


@router.get("/project-rooms", response_model=list[ProjectRoomSummary])
def list_project_rooms(user: CurrentUser) -> list[ProjectRoomSummary]:
    return [_to_summary(room) for room in service.list_rooms(user["user_id"])]


@router.post("/project-rooms", response_model=ProjectRoom, status_code=status.HTTP_201_CREATED)
def create_project_room(payload: CreateRoomRequest, user: CurrentUser) -> ProjectRoom:
    workspace = _writable_workspace(user, payload.workspace_id)
    api_key = _resolve_api_key(
        user,
        use_user_key=payload.use_user_key,
        user_model_choice=payload.user_model_choice,
        workspace_id=workspace["workspace_id"],
    )
    try:
        room = service.create_room(
            owner_user_id=user["user_id"],
            title=payload.title,
            raw_intent=payload.raw_intent,
            locale=payload.locale,
            api_key=api_key,
            user_model_choice=payload.user_model_choice,
            workspace_id=workspace["workspace_id"],
            delivery_type=payload.delivery_type,
            preferred_language=payload.preferred_language,
        )
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return _to_model(room)


@router.post("/project-rooms/import", response_model=ProjectRoom, status_code=status.HTTP_201_CREATED)
def import_project_room(payload: ImportPromptMasterRequest, user: CurrentUser) -> ProjectRoom:
    """Fluxo 2: import an existing PromptMaster (.md / text / JSON) -> status PROMPT_APPROVED."""
    workspace = _writable_workspace(user, payload.workspace_id)
    api_key = _resolve_api_key(
        user,
        use_user_key=payload.use_user_key,
        user_model_choice=payload.user_model_choice,
        workspace_id=workspace["workspace_id"],
    )
    try:
        room = service.import_prompt_master(
            owner_user_id=user["user_id"],
            fmt=payload.format,
            content=payload.content,
            title=payload.title,
            locale=payload.locale,
            api_key=api_key,
            user_model_choice=payload.user_model_choice,
            workspace_id=workspace["workspace_id"],
        )
    except ProjectRoomImportError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return _to_model(room)


@router.get("/project-rooms/{room_id}", response_model=ProjectRoom)
def get_project_room(room_id: str, user: CurrentUser) -> ProjectRoom:
    return _to_model(_require(service.get_room(room_id, user["user_id"])))


@router.post("/project-rooms/{room_id}/message", response_model=ProjectRoom)
def post_project_room_message(room_id: str, payload: PostMessageRequest, user: CurrentUser) -> ProjectRoom:
    api_key = _resolve_api_key(
        user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice
    )
    try:
        room = service.post_message(
            room_id,
            user["user_id"],
            payload.content,
            api_key=api_key,
            user_model_choice=payload.user_model_choice,
        )
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/generate-prompt", response_model=ProjectRoom)
def generate_project_room_prompt(
    room_id: str, user: CurrentUser, payload: LlmActionRequest | None = None
) -> ProjectRoom:
    payload = payload or LlmActionRequest()
    api_key = _resolve_api_key(
        user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice
    )
    try:
        room = service.generate_prompt(
            room_id, user["user_id"], api_key=api_key, user_model_choice=payload.user_model_choice
        )
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/blueprint", response_model=ProjectRoom)
def generate_project_room_blueprint(
    room_id: str, user: CurrentUser, payload: LlmActionRequest | None = None
) -> ProjectRoom:
    """Architect Engine: PromptMaster aprovado ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Blueprint arquitetural justificado."""
    explicit_mode = payload is not None
    payload = payload or LlmActionRequest()
    api_key = _resolve_api_key(
        user,
        use_user_key=payload.use_user_key,
        user_model_choice=payload.user_model_choice,
        capability="architecture_blueprint",
        mode=payload.mode,
        provider_override=payload.provider_override,
        require_llm=explicit_mode and payload.mode == "llm",
    )
    try:
        room = service.generate_blueprint(
            room_id, user["user_id"], api_key=api_key, user_model_choice=payload.user_model_choice
        )
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/blueprint/stream")
def stream_project_room_blueprint(
    room_id: str, payload: LlmActionRequest, user: CurrentUser
) -> StreamingResponse:
    """Stream Architect progress and keep the server-side run alive on refresh."""
    api_key = _resolve_api_key(
        user,
        use_user_key=payload.use_user_key,
        user_model_choice=payload.user_model_choice,
        capability="architecture_blueprint",
        mode=payload.mode,
        provider_override=payload.provider_override,
        require_llm=payload.mode == "llm",
    )
    events: queue.Queue[tuple[str, Any]] = queue.Queue()

    def run() -> None:
        try:
            room = service.generate_blueprint(
                room_id, user["user_id"], api_key=api_key,
                user_model_choice=payload.user_model_choice,
            )
            events.put(("complete", room))
        except Exception as exc:
            events.put(("error", str(exc)))

    def event_stream():
        def emit(event: str, data: Any) -> str:
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        yield emit("progress", {"stage": "provider", "label": "Provider detectado", "progress": 8})
        yield emit("progress", {"stage": "prompt", "label": "Prompt enviado", "progress": 18})
        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        elapsed = 0
        while True:
            try:
                kind, value = events.get(timeout=1)
            except queue.Empty:
                elapsed += 1
                yield emit("heartbeat", {"stage": "generation", "label": "Recebendo resposta", "elapsed": elapsed, "progress": min(66, 22 + elapsed)})
                continue
            if kind == "error":
                yield emit("error", {"message": value, "retryable": True})
                break
            room = value
            blueprint = room.get("architecture_blueprint") or {}
            decisions = blueprint.get("decisions") or []
            for index, decision in enumerate(decisions):
                progress = 68 + round(((index + 1) / max(1, len(decisions))) * 22)
                yield emit("decision", {"index": index, "decision": decision, "progress": progress})
            yield emit("progress", {"stage": "validation", "label": "Validando seguranca e trade-offs", "progress": 94})
            yield emit("complete", {"room": room, "progress": 100})
            break

    return StreamingResponse(
        event_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/project-rooms/{room_id}/blueprints/{version}/restore", response_model=ProjectRoom)
def restore_blueprint_version(room_id: str, version: int, user: CurrentUser) -> ProjectRoom:
    try:
        room = service.restore_blueprint_version(room_id, user["user_id"], version)
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/blueprint/cancel", response_model=ProjectRoom)
def cancel_blueprint_generation(room_id: str, user: CurrentUser) -> ProjectRoom:
    return _to_model(_require(service.cancel_blueprint_generation(room_id, user["user_id"])))


@router.post("/project-rooms/{room_id}/blueprints/{version}/duplicate", response_model=ProjectRoom)
def duplicate_blueprint_version(room_id: str, version: int, user: CurrentUser) -> ProjectRoom:
    try:
        room = service.duplicate_blueprint_version(room_id, user["user_id"], version)
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(room))


@router.delete("/project-rooms/{room_id}/blueprints/{version}", response_model=ProjectRoom)
def delete_blueprint_version(room_id: str, version: int, user: CurrentUser) -> ProjectRoom:
    try:
        room = service.delete_blueprint_version(room_id, user["user_id"], version)
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/revise-prompt", response_model=ProjectRoom)
def revise_project_room_prompt(room_id: str, payload: RevisePromptRequest, user: CurrentUser) -> ProjectRoom:
    api_key = _resolve_api_key(
        user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice
    )
    try:
        room = service.revise_prompt(
            room_id,
            user["user_id"],
            payload.adjustment,
            api_key=api_key,
            user_model_choice=payload.user_model_choice,
        )
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    except LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/engineering-review", response_model=ProjectRoom)
def start_project_room_engineering_review(room_id: str, user: CurrentUser) -> ProjectRoom:
    try:
        room = service.start_engineering_review(room_id, user["user_id"])
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/engineering-review/validate")
def validate_project_room_engineering_review(room_id: str, user: CurrentUser) -> dict[str, Any]:
    result = service.validate_engineering_review(room_id, user["user_id"])
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sala nao encontrada.")
    return result


@router.post("/project-rooms/{room_id}/acknowledge-preview", response_model=ProjectRoom)
def acknowledge_project_room_preview(
    room_id: str, payload: AcknowledgePreviewRequest, user: CurrentUser
) -> ProjectRoom:
    """Conscious 'continuar com preview': accept a degraded deterministic Blueprint."""
    try:
        room = service.acknowledge_preview(room_id, user["user_id"], payload.confirmation)
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/stack/approve", response_model=ProjectRoom)
def approve_project_room_stack(
    room_id: str, user: CurrentUser, payload: StackApprovalRequest | None = None
) -> ProjectRoom:
    """Stack Approval Gate: explicit user consent for the development stack.
    Empty body approves the recommendation as-is; any provided field is an
    'Alterar stack' override that generation will use instead."""
    payload = payload or StackApprovalRequest()
    try:
        room = service.approve_stack(room_id, user["user_id"], payload.model_dump(exclude_none=True))
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/approve", response_model=ProjectRoom)
def approve_project_room(room_id: str, user: CurrentUser) -> ProjectRoom:
    try:
        room = service.approve(room_id, user["user_id"])
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/send-to-generator", response_model=ProjectRoom)
def send_project_room_to_generator(room_id: str, user: CurrentUser) -> ProjectRoom:
    try:
        room = service.send_to_generator(room_id, user["user_id"])
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/mark-generated", response_model=ProjectRoom)
def mark_project_room_generated(
    room_id: str, payload: MarkGeneratedRequest, user: CurrentUser
) -> ProjectRoom:
    try:
        room = service.mark_generated(room_id, user["user_id"], payload.generated_project_id)
    except ProjectRoomError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(room))


@router.post("/project-rooms/{room_id}/archive", response_model=ProjectRoom)
def archive_project_room(room_id: str, user: CurrentUser) -> ProjectRoom:
    return _to_model(_require(service.archive(room_id, user["user_id"])))


@router.delete("/project-rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_room(room_id: str, user: CurrentUser) -> Response:
    if not service.delete(room_id, user["user_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sala nao encontrada.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
