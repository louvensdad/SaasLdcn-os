from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.core.permissions import PERMISSION_MATRIX, canonical_role, evaluate_permission
from app.repositories.tenant_repository import ORG_ADMIN_ROLES, TenantRepository
from app.repositories.workspace_permission_repository import WorkspacePermissionRepository
from app.schemas.permissions import PermissionExplainResponse, PermissionOverride, SetPermissionOverrideRequest

router = APIRouter(tags=["permissions"])


def _require_admin(workspace_id: str, user_id: str) -> dict:
    workspace = TenantRepository().get_workspace_for_user(workspace_id, user_id)
    if workspace is None or workspace["role"] not in ORG_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found or insufficient permission.")
    return workspace


@router.get("/permissions/explain", response_model=PermissionExplainResponse)
def explain_permission(workspace_id: str, action: str, user: CurrentUser) -> PermissionExplainResponse:
    """Self-explain (vault acceptance criterion: "permissões efetivas são
    explicáveis"): what the CALLER's own effective permission is for `action`
    in `workspace_id`, and why."""
    workspace = TenantRepository().get_workspace_for_user(workspace_id, user["user_id"])
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found or insufficient permission.")
    role = workspace["role"]
    override = WorkspacePermissionRepository().get(workspace_id, action, canonical_role(role))
    decision = evaluate_permission(action, role, override=override)
    return PermissionExplainResponse(action=action, role=role, allowed=decision.allowed, policy=decision.policy, reason=decision.reason)


@router.get("/workspaces/{workspace_id}/permission-overrides", response_model=list[PermissionOverride])
def list_permission_overrides(workspace_id: str, user: CurrentUser) -> list[PermissionOverride]:
    _require_admin(workspace_id, user["user_id"])
    rows = WorkspacePermissionRepository().list_for_workspace(workspace_id)
    return [PermissionOverride.model_validate(row) for row in rows]


@router.put("/workspaces/{workspace_id}/permission-overrides", response_model=PermissionOverride)
def set_permission_override(workspace_id: str, payload: SetPermissionOverrideRequest, user: CurrentUser) -> PermissionOverride:
    """Owner/Admin only (same trust tier as set_member's role changes). Only
    the vault matrix's "Configurável" cells can be overridden -- a fixed
    allow/deny cell is not a workspace choice, so attempting to override one
    is rejected rather than silently accepted and ignored."""
    _require_admin(workspace_id, user["user_id"])
    canon = canonical_role(payload.role)
    cell = PERMISSION_MATRIX.get(payload.action, {}).get(canon)
    if cell != "configurable":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"'{payload.action}' for role '{canon}' is not a configurable permission.",
        )
    repo = WorkspacePermissionRepository()
    repo.set(workspace_id, payload.action, canon, payload.allowed, updated_by_user_id=user["user_id"])
    row = next(r for r in repo.list_for_workspace(workspace_id) if r["action"] == payload.action and r["role"] == canon)
    return PermissionOverride.model_validate(row)
