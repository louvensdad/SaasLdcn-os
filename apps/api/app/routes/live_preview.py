from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import CurrentUser
from app.repositories.project_repository import ProjectRepository
from app.repositories.tenant_repository import TenantRepository
from app.schemas.live_preview import ConsoleLogEntry, LivePreviewSession, NavigateRequest, StartLivePreviewRequest
from app.services.live_preview_service import LivePreviewAccessError, live_preview_service
from app.services.plan_access_engine import PlanAccessDeniedError, PlanAccessEngine
from app.services.preview_inspector import PreviewInspectorError

router = APIRouter(tags=["live-preview"])

_NOT_FOUND_DETAIL = "Live preview session não encontrada, não está em execução, ou o navegador de inspeção não está disponível."


def _check_preview_plan_access(user: dict, project_id: str) -> None:
    # Best-effort: a project_id that doesn't resolve to a tracked workspace
    # (ad-hoc/API usage, same posture meta_factory.py already takes for an
    # unresolvable projectId) is not gated here -- there is no organization to
    # check a plan against.
    project = ProjectRepository().get_project(project_id, user["user_id"])
    if project is None or not project.get("workspace_id"):
        return
    workspace = TenantRepository().get_workspace_for_user(project["workspace_id"], user["user_id"])
    if workspace is None:
        return
    try:
        PlanAccessEngine().check_preview_create(user_id=user["user_id"], organization_id=workspace["organization_id"], project_id=project_id)
    except PlanAccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=exc.to_detail()) from exc


@router.post("/live-preview/start", response_model=LivePreviewSession)
def start_live_preview(payload: StartLivePreviewRequest, user: CurrentUser) -> LivePreviewSession:
    _check_preview_plan_access(user, payload.project_id)
    try:
        return live_preview_service.start(payload.project_id, user["user_id"])
    except LivePreviewAccessError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/live-preview/{session_id}", response_model=LivePreviewSession)
def get_live_preview(session_id: str, user: CurrentUser) -> LivePreviewSession:
    session = live_preview_service.get(session_id, user["user_id"])
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live preview session não encontrada.")
    return session


@router.post("/live-preview/{session_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
def stop_live_preview(session_id: str, user: CurrentUser) -> Response:
    if not live_preview_service.stop(session_id, user["user_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live preview session não encontrada.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/live-preview/{session_id}/console", response_model=list[ConsoleLogEntry])
def get_live_preview_console(session_id: str, user: CurrentUser) -> list[ConsoleLogEntry]:
    entries = live_preview_service.console_log(session_id, user["user_id"])
    if entries is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)
    return [ConsoleLogEntry.model_validate(entry) for entry in entries]


@router.post("/live-preview/{session_id}/screenshot")
def capture_live_preview_screenshot(session_id: str, user: CurrentUser) -> Response:
    try:
        image = live_preview_service.screenshot(session_id, user["user_id"])
    except PreviewInspectorError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)
    return Response(content=image, media_type="image/png")


@router.post("/live-preview/{session_id}/navigate", status_code=status.HTTP_204_NO_CONTENT)
def navigate_live_preview(session_id: str, payload: NavigateRequest, user: CurrentUser) -> Response:
    try:
        found = live_preview_service.navigate(session_id, user["user_id"], payload.path)
    except PreviewInspectorError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/live-preview/{session_id}/reload", status_code=status.HTTP_204_NO_CONTENT)
def reload_live_preview(session_id: str, user: CurrentUser) -> Response:
    try:
        found = live_preview_service.reload(session_id, user["user_id"])
    except PreviewInspectorError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
