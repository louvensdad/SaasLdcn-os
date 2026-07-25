from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser
from app.repositories.generation_notification_repository import generation_notification_repository
from app.schemas.generation_notification import GenerationNotification, GenerationNotificationListResponse, MarkAllReadResponse

router = APIRouter(tags=["generation-notifications"])


def _decode_cursor(cursor: str | None) -> tuple[str, str] | None:
    if not cursor:
        return None
    created_at, _, notif_id = cursor.partition("|")
    if not created_at or not notif_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cursor inválido.")
    return created_at, notif_id


def _encode_cursor(notification: dict) -> str:
    return f"{notification['created_at']}|{notification['id']}"


@router.get("/notifications", response_model=GenerationNotificationListResponse)
def list_notifications(
    user: CurrentUser,
    read: bool | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> GenerationNotificationListResponse:
    items, has_more = generation_notification_repository.list_for_user(
        user["user_id"], read=read, before=_decode_cursor(cursor), limit=limit
    )
    unread_count = generation_notification_repository.unread_count(user["user_id"])
    return GenerationNotificationListResponse(
        items=[GenerationNotification.model_validate(item) for item in items],
        has_more=has_more,
        next_cursor=_encode_cursor(items[-1]) if has_more and items else None,
        unread_count=unread_count,
    )


@router.post("/notifications/{notification_id}/read", response_model=GenerationNotification)
def mark_notification_read(notification_id: str, user: CurrentUser) -> GenerationNotification:
    notification = generation_notification_repository.mark_read(notification_id, user["user_id"])
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificação não encontrada.")
    return GenerationNotification.model_validate(notification)


@router.post("/notifications/read-all", response_model=MarkAllReadResponse)
def mark_all_notifications_read(user: CurrentUser) -> MarkAllReadResponse:
    return MarkAllReadResponse(updated=generation_notification_repository.mark_all_read(user["user_id"]))
