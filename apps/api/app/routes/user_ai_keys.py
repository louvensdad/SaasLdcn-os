from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUser
from app.schemas.user_ai_key import (
    KeySessionStatus,
    KeySessionStatusResponse,
    UpsertKeyRequest,
)
from app.services.user_key_session_service import user_key_session

router = APIRouter(tags=["user-ai-keys"])


def _status(user_id: str) -> KeySessionStatusResponse:
    return KeySessionStatusResponse(
        sessions=[
            KeySessionStatus(provider=provider, masked=masked)
            for provider, masked in user_key_session.status(user_id)
        ]
    )


@router.get("/user-ai-keys/status", response_model=KeySessionStatusResponse)
def get_user_ai_key_status(user: CurrentUser) -> KeySessionStatusResponse:
    """List the user's active (in-memory) key sessions, masked. Never the raw key."""
    return _status(user["user_id"])


@router.post("/user-ai-keys/session", response_model=KeySessionStatusResponse)
def upsert_user_ai_key(payload: UpsertKeyRequest, user: CurrentUser) -> KeySessionStatusResponse:
    """Store a user-owned LLM key in the ephemeral RAM vault for this user.

    The key is encrypted in memory and never persisted/logged/echoed. The response
    returns only the masked status of the user's sessions.
    """
    user_key_session.set(user["user_id"], payload.provider, payload.api_key)
    return _status(user["user_id"])


@router.delete("/user-ai-keys/session", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_ai_key(
    user: CurrentUser,
    provider: str | None = Query(default=None),
) -> Response:
    """Purge one provider's key (or all of the user's keys when provider is omitted)."""
    user_key_session.clear(user["user_id"], provider)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
