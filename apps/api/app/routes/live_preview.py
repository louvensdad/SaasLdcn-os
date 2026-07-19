from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import CurrentUser
from app.schemas.live_preview import LivePreviewSession, StartLivePreviewRequest
from app.services.live_preview_service import LivePreviewAccessError, live_preview_service

router = APIRouter(tags=["live-preview"])


@router.post("/live-preview/start", response_model=LivePreviewSession)
def start_live_preview(payload: StartLivePreviewRequest, user: CurrentUser) -> LivePreviewSession:
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
