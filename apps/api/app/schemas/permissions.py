from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class PermissionExplainResponse(ApiModel):
    action: str
    role: str
    allowed: bool
    policy: str
    reason: str


class PermissionOverride(ApiModel):
    workspace_id: str
    action: str
    role: str
    allowed: bool
    updated_by_user_id: str
    updated_at: str


class SetPermissionOverrideRequest(ApiModel):
    action: str = Field(min_length=1, max_length=80)
    role: str = Field(min_length=1, max_length=40)
    allowed: bool
