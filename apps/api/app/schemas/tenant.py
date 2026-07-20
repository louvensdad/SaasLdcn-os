from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


OrganizationRole = Literal["owner", "admin", "member"]
# "member" is kept as a deprecated alias for "developer" (see app/core/permissions.py
# canonical_role()) -- the vault's official 5-role model (Owner/Admin/Developer/
# Reviewer/Viewer, 57 - Especificações/Matriz de permissões por ação.md) splits the
# old undifferentiated "member" into Developer/Reviewer. Existing stored rows and
# callers using "member" keep working unchanged -- a minor, non-breaking addition
# per the vault's own contract-compatibility policy (old terms kept as aliases).
WorkspaceRole = Literal["owner", "admin", "member", "developer", "reviewer", "viewer"]


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
