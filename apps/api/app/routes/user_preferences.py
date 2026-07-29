from __future__ import annotations

import json

from typing import Literal

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.schemas.user_preferences import UserPreferencesBlob
from app.services.user_preferences_service import user_preferences_service
from app.services.activity_feed_service import activity_feed_service

router = APIRouter(tags=["user-preferences"])

# Generous cap for a client preference blob (dozens of scalar fields) --
# large enough for real usage, small enough to block abuse of an
# unauthenticated-content-type-free JSON field.
_MAX_BLOB_BYTES = 65_536


def _check_size(data: dict | None) -> None:
    if data is not None and len(json.dumps(data)) > _MAX_BLOB_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Preferences payload too large.",
        )


@router.get("/users/me/preferences/interface", response_model=UserPreferencesBlob)
def get_interface_preferences(user: CurrentUser) -> UserPreferencesBlob:
    return UserPreferencesBlob(data=user_preferences_service.get_interface(user["user_id"]))


@router.put("/users/me/preferences/interface", response_model=UserPreferencesBlob)
def put_interface_preferences(payload: UserPreferencesBlob, user: CurrentUser) -> UserPreferencesBlob:
    _check_size(payload.data)
    if payload.data is None:
        return UserPreferencesBlob(data=user_preferences_service.get_interface(user["user_id"]))
    result = user_preferences_service.set_interface(user["user_id"], payload.data)
    activity_feed_service.record(user_id=user["user_id"], category="preferences", action="interface_updated", status="success", metadata={"category": "interface"})
    return UserPreferencesBlob(data=result)


@router.get("/users/me/preferences/ai", response_model=UserPreferencesBlob)
def get_ai_preferences(user: CurrentUser) -> UserPreferencesBlob:
    return UserPreferencesBlob(data=user_preferences_service.get_ai(user["user_id"]))


@router.put("/users/me/preferences/ai", response_model=UserPreferencesBlob)
def put_ai_preferences(payload: UserPreferencesBlob, user: CurrentUser) -> UserPreferencesBlob:
    _check_size(payload.data)
    if payload.data is None:
        return UserPreferencesBlob(data=user_preferences_service.get_ai(user["user_id"]))
    result = user_preferences_service.set_ai(user["user_id"], payload.data)
    activity_feed_service.record(user_id=user["user_id"], category="preferences", action="ai_updated", status="success", metadata={"category": "ai"})
    return UserPreferencesBlob(data=result)


PreferenceCategory = Literal['personal', 'git', 'advanced', 'locale']

@router.get('/users/me/preferences/{category}', response_model=UserPreferencesBlob)
def get_preference_category(category: PreferenceCategory, user: CurrentUser) -> UserPreferencesBlob:
    return UserPreferencesBlob(data=getattr(user_preferences_service, 'get_' + category)(user['user_id']))

@router.put('/users/me/preferences/{category}', response_model=UserPreferencesBlob)
def put_preference_category(category: PreferenceCategory, payload: UserPreferencesBlob, user: CurrentUser) -> UserPreferencesBlob:
    _check_size(payload.data)
    getter = getattr(user_preferences_service, 'get_' + category)
    if payload.data is None:
        return UserPreferencesBlob(data=getter(user['user_id']))
    return UserPreferencesBlob(data=getattr(user_preferences_service, 'set_' + category)(user['user_id'], payload.data))
