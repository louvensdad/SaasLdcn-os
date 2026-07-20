from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class SandboxPolicyException(ApiModel):
    id: str
    project_id: str
    program: str
    reason: str
    approved_by_user_id: str
    created_at: str
    expires_at: str
    revoked_at: str | None = None


class CreateSandboxPolicyExceptionRequest(ApiModel):
    project_id: str = Field(min_length=1)
    program: str = Field(min_length=1, max_length=60)
    reason: str = Field(min_length=1, max_length=500)
    expires_at: str = Field(min_length=1)
