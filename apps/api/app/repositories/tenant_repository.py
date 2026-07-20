from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.database import database_url_for, session_factory
from app.models.tenant import (
    Organization,
    OrganizationMembership,
    Workspace,
    WorkspaceMembership,
)
from app.models.user import User


ORG_ADMIN_ROLES = frozenset({"owner", "admin"})
# "member" kept for back-compat (see app/schemas/tenant.py's WorkspaceRole comment);
# "developer" is its 5-role-model successor -- both grant the same write access here.
WORKSPACE_WRITE_ROLES = frozenset({"owner", "admin", "member", "developer"})
WORKSPACE_ROLES = frozenset({"owner", "admin", "member", "developer", "reviewer", "viewer"})


class TenantAccessError(RuntimeError):
    pass


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return normalized[:80] or "workspace"


class TenantRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def ensure_personal_workspace(self, user_id: str, full_name: str) -> dict[str, Any]:
        organization_id = f"org_personal_{user_id}"
        workspace_id = f"ws_personal_{user_id}"
        now = _now()
        with self._sessions.begin() as session:
            organization = session.get(Organization, organization_id)
            if organization is None:
                organization = Organization(
                    organization_id=organization_id,
                    name=f"{full_name.strip() or 'User'} Personal",
                    slug=f"personal-{user_id}",
                    created_by_user_id=user_id,
                    created_at=now,
                    updated_at=now,
                )
                session.add(organization)
            if session.get(OrganizationMembership, (organization_id, user_id)) is None:
                session.add(OrganizationMembership(
                    organization_id=organization_id,
                    user_id=user_id,
                    role="owner",
                    created_at=now,
                ))
            workspace = session.get(Workspace, workspace_id)
            if workspace is None:
                workspace = Workspace(
                    workspace_id=workspace_id,
                    organization_id=organization_id,
                    name="Personal Workspace",
                    slug="personal",
                    is_personal=True,
                    created_by_user_id=user_id,
                    created_at=now,
                    updated_at=now,
                )
                session.add(workspace)
            if session.get(WorkspaceMembership, (workspace_id, user_id)) is None:
                session.add(WorkspaceMembership(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    role="owner",
                    created_at=now,
                ))
            session.flush()
            return self._workspace(workspace, role="owner")

    def create_organization(self, user_id: str, name: str, slug: str | None = None) -> dict[str, Any]:
        now = _now()
        organization_id = f"org_{uuid4().hex[:12]}"
        normalized_slug = _slug(slug or name)
        with self._sessions.begin() as session:
            organization = Organization(
                organization_id=organization_id,
                name=name.strip(),
                slug=normalized_slug,
                created_by_user_id=user_id,
                created_at=now,
                updated_at=now,
            )
            session.add(organization)
            session.add(OrganizationMembership(
                organization_id=organization_id,
                user_id=user_id,
                role="owner",
                created_at=now,
            ))
            try:
                session.flush()
            except IntegrityError as exc:
                raise ValueError("Organization slug is already in use.") from exc
            return self._organization(organization, role="owner")

    def list_organizations(self, user_id: str) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.execute(
                select(Organization, OrganizationMembership.role)
                .join(
                    OrganizationMembership,
                    OrganizationMembership.organization_id == Organization.organization_id,
                )
                .where(OrganizationMembership.user_id == user_id)
                .order_by(Organization.created_at)
            ).all()
            return [self._organization(item, role=role) for item, role in rows]

    def create_workspace(
        self,
        user_id: str,
        organization_id: str,
        name: str,
        slug: str | None = None,
    ) -> dict[str, Any]:
        now = _now()
        workspace_id = f"ws_{uuid4().hex[:12]}"
        with self._sessions.begin() as session:
            membership = session.get(OrganizationMembership, (organization_id, user_id))
            if membership is None or membership.role not in ORG_ADMIN_ROLES:
                raise TenantAccessError("Organization not found or insufficient permission.")
            workspace = Workspace(
                workspace_id=workspace_id,
                organization_id=organization_id,
                name=name.strip(),
                slug=_slug(slug or name),
                is_personal=False,
                created_by_user_id=user_id,
                created_at=now,
                updated_at=now,
            )
            session.add(workspace)
            session.add(WorkspaceMembership(
                workspace_id=workspace_id,
                user_id=user_id,
                role="owner",
                created_at=now,
            ))
            try:
                session.flush()
            except IntegrityError as exc:
                raise ValueError("Workspace slug is already in use in this organization.") from exc
            return self._workspace(workspace, role="owner")

    def list_workspaces(self, user_id: str, organization_id: str | None = None) -> list[dict[str, Any]]:
        statement = (
            select(Workspace, WorkspaceMembership.role)
            .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.workspace_id)
            .where(WorkspaceMembership.user_id == user_id)
            .order_by(Workspace.created_at)
        )
        if organization_id:
            statement = statement.where(Workspace.organization_id == organization_id)
        with self._sessions() as session:
            return [
                self._workspace(workspace, role=role)
                for workspace, role in session.execute(statement).all()
            ]

    def personal_workspace(self, user_id: str) -> dict[str, Any] | None:
        workspace_id = f"ws_personal_{user_id}"
        return self.get_workspace_for_user(workspace_id, user_id)

    def get_workspace_for_user(self, workspace_id: str, user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.execute(
                select(Workspace, WorkspaceMembership.role)
                .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.workspace_id)
                .where(
                    Workspace.workspace_id == workspace_id,
                    WorkspaceMembership.user_id == user_id,
                )
            ).first()
            return self._workspace(row[0], role=row[1]) if row else None

    def require_workspace(
        self,
        workspace_id: str,
        user_id: str,
        allowed_roles: frozenset[str] = WORKSPACE_ROLES,
    ) -> dict[str, Any]:
        workspace = self.get_workspace_for_user(workspace_id, user_id)
        if workspace is None or workspace["role"] not in allowed_roles:
            raise TenantAccessError("Workspace not found or insufficient permission.")
        return workspace

    def list_members(self, workspace_id: str, actor_user_id: str) -> list[dict[str, Any]]:
        self.require_workspace(workspace_id, actor_user_id)
        with self._sessions() as session:
            rows = session.execute(
                select(WorkspaceMembership, User)
                .join(User, User.user_id == WorkspaceMembership.user_id)
                .where(WorkspaceMembership.workspace_id == workspace_id)
                .order_by(WorkspaceMembership.created_at)
            ).all()
            return [
                {
                    "workspace_id": membership.workspace_id,
                    "user_id": user.user_id,
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": membership.role,
                    "created_at": membership.created_at,
                }
                for membership, user in rows
            ]

    def set_member(
        self,
        workspace_id: str,
        actor_user_id: str,
        target_user_id: str,
        role: str,
    ) -> dict[str, Any]:
        if role not in WORKSPACE_ROLES:
            raise ValueError("Invalid workspace role.")
        workspace = self.require_workspace(workspace_id, actor_user_id, ORG_ADMIN_ROLES)
        actor_role = workspace["role"]
        if role == "owner" and actor_role != "owner":
            raise TenantAccessError("Only a workspace owner can assign another owner.")
        now = _now()
        with self._sessions.begin() as session:
            target = session.get(User, target_user_id)
            if target is None or not target.is_active:
                raise ValueError("Target user was not found.")
            membership = session.get(WorkspaceMembership, (workspace_id, target_user_id))
            if membership is None:
                membership = WorkspaceMembership(
                    workspace_id=workspace_id,
                    user_id=target_user_id,
                    role=role,
                    created_at=now,
                )
                session.add(membership)
            else:
                membership.role = role
            org_membership = session.get(
                OrganizationMembership,
                (workspace["organization_id"], target_user_id),
            )
            if org_membership is None:
                session.add(OrganizationMembership(
                    organization_id=workspace["organization_id"],
                    user_id=target_user_id,
                    role="member",
                    created_at=now,
                ))
            session.flush()
            return {
                "workspace_id": workspace_id,
                "user_id": target.user_id,
                "email": target.email,
                "full_name": target.full_name,
                "role": membership.role,
                "created_at": membership.created_at,
            }

    @staticmethod
    def _organization(model: Organization, *, role: str) -> dict[str, Any]:
        return {
            "organization_id": model.organization_id,
            "name": model.name,
            "slug": model.slug,
            "role": role,
            "created_at": model.created_at,
            "updated_at": model.updated_at,
        }

    @staticmethod
    def _workspace(model: Workspace, *, role: str) -> dict[str, Any]:
        return {
            "workspace_id": model.workspace_id,
            "organization_id": model.organization_id,
            "name": model.name,
            "slug": model.slug,
            "is_personal": bool(model.is_personal),
            "role": role,
            "created_at": model.created_at,
            "updated_at": model.updated_at,
        }
