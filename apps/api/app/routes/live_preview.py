from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse

from app.core.deps import CurrentUser
from app.repositories.project_repository import ProjectRepository
from app.repositories.tenant_repository import TenantRepository
from app.routes.meta_factory_stream_helpers import _sse
from app.schemas.live_preview import ConsoleLogEntry, LivePreviewSession, NavigateRequest, StartLivePreviewRequest
from app.services.execution_runtime import redact
from app.services.live_preview_service import LivePreviewAccessError, live_preview_service
from app.services.plan_access_engine import PlanAccessDeniedError, PlanAccessEngine
from app.services.preview_inspector import PreviewInspectorError

router = APIRouter(tags=["live-preview"])
_LOG_POLL_INTERVAL_SECONDS = 1.0
_LOG_STREAM_MAX_TICKS = 3600  # ~1 hour at the poll interval above; the client reconnects via Last-Event-ID past this.

_NOT_FOUND_DETAIL = "Live preview session não encontrada, não está em execução, ou o navegador de inspeção não está disponível."


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


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


@router.get("/live-preview/by-project/{project_id}", response_model=LivePreviewSession)
def get_live_preview_by_project(project_id: str, user: CurrentUser) -> LivePreviewSession:
    """Lets the frontend recover an already-running session after a page
    refresh -- LivePreviewPanel otherwise has no way to know a session
    exists at all until this call, since its own React state starts at
    null on every mount and the session_id from the previous mount is gone."""
    session = live_preview_service.get_by_project(project_id, user["user_id"])
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma sessão de live preview ativa para este projeto.")
    return session


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


@router.get("/live-preview/{session_id}/logs/{service}")
def stream_live_preview_logs(
    session_id: str, service: Literal["frontend", "backend"], user: CurrentUser,
) -> StreamingResponse:
    """Real stdout+stderr tail of the requested process's log file (the SAME
    file HostExecutionRuntime.start_background already writes for real --
    this streams it, it doesn't invent a second logging path). stdout/stderr
    are not separable on disk (see LivePreviewService.process_log_path), only
    frontend vs. backend is a real, exact filter."""
    path = live_preview_service.process_log_path(session_id, user["user_id"], service)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)

    def event_source():
        offset = 0
        for _ in range(_LOG_STREAM_MAX_TICKS):
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                yield _sse({"type": "error", "detail": "Log file is no longer readable."})
                return
            if len(text) > offset:
                new_text = redact(text[offset:])
                offset = len(text)
                for line in new_text.splitlines():
                    if line:
                        yield _sse({"type": "line", "service": service, "at": _now_iso(), "text": line})
            else:
                yield _sse({"type": "heartbeat"})
            current = live_preview_service.get(session_id, user["user_id"])
            if current is None or current.status not in ("running", "starting"):
                yield _sse({"type": "done", "status": current.status if current else "stopped"})
                return
            time.sleep(_LOG_POLL_INTERVAL_SECONDS)
        yield _sse({"type": "error", "detail": "Log stream expired; reconnect to continue tailing."})

    return StreamingResponse(
        event_source(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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


@router.post("/live-preview/{session_id}/external-open", status_code=status.HTTP_204_NO_CONTENT)
def record_external_open(session_id: str, user: CurrentUser) -> Response:
    """Called by the "Ver frontend no navegador" button on click, so the open
    is durably recorded (ExternalPreviewOpened) rather than only observable
    client-side. Never blocks the actual window.open() -- fire-and-forget."""
    if not live_preview_service.record_external_open(session_id, user["user_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/live-preview/{session_id}/restart-frontend", response_model=LivePreviewSession)
def restart_live_preview_frontend(session_id: str, user: CurrentUser) -> LivePreviewSession:
    result = live_preview_service.restart_frontend(session_id, user["user_id"])
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)
    return result


@router.post("/live-preview/{session_id}/restart-backend", response_model=LivePreviewSession)
def restart_live_preview_backend(session_id: str, user: CurrentUser) -> LivePreviewSession:
    result = live_preview_service.restart_backend(session_id, user["user_id"])
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND_DETAIL)
    return result
