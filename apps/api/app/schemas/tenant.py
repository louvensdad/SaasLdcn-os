from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


OrganizationRole = Literal["owner", "admin", "member"]
WorkspaceRole = Literal["owner", "admin", "member", "viewer"]


class Organization(ApiModel):
    organization_id: str
    name: str
    slug: str
    role: OrganizationRole
    created_at: str
    updated_at: str


class CreateOrganizationRequest(ApiModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, min_length=2, max_length=80)


class Workspace(ApiModel):
    workspace_id: str
    organization_id: str
    name: str
    slug: str
    is_personal: bool = False
    role: WorkspaceRole
    created_at: str
    updated_at: str


class CreateWorkspaceRequest(ApiModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, min_length=2, max_length=80)


class WorkspaceMember(ApiModel):
    workspace_id: str
    user_id: str
    email: str
    full_name: str
    role: WorkspaceRole
    created_at: str


class SetWorkspaceMemberRequest(ApiModel):
    role: WorkspaceRole
