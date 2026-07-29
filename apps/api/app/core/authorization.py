from __future__ import annotations

from app.core.permissions import AuthzDecision, canonical_role, evaluate_permission
from app.repositories.tenant_repository import TenantRepository
from app.repositories.workspace_permission_repository import WorkspacePermissionRepository
from app.services.activity_feed_service import activity_feed_service


class PermissionDeniedError(RuntimeError):
    """Raised by require_permission(); route handlers map it to an HTTP error
    the same way TenantAccessError already is (see app/repositories/tenant_repository.py)."""


def require_permission(
    action: str,
    workspace_id: str,
    user_id: str,
    *,
    project_id: str | None = None,
    permission_repo: WorkspacePermissionRepository | None = None,
    tenant_repo: TenantRepository | None = None,
) -> AuthzDecision:
    """Evaluate the vault's per-action permission matrix (57 - Especificações/
    Matriz de permissões por ação.md) for `action` against the caller's real
    role in `workspace_id`, and audit the outcome either way (vault acceptance
    criterion: "Decisão de autorização é auditada").

    Raises PermissionDeniedError on denial -- callers map it to whatever HTTP
    status matches their existing convention (404 for TenantAccessError-style
    "don't reveal existence", 403 elsewhere)."""
    tenant_repo = tenant_repo or TenantRepository()
    workspace = tenant_repo.get_workspace_for_user(workspace_id, user_id)
    if workspace is None:
        decision = AuthzDecision(False, "no_membership", "Caller has no membership in this workspace.")
        _audit(action, workspace_id, user_id, role=None, decision=decision, project_id=project_id)
        raise PermissionDeniedError(decision.reason)

    role = workspace["role"]
    override = (permission_repo or WorkspacePermissionRepository()).get(workspace_id, action, canonical_role(role))
    decision = evaluate_permission(action, role, override=override)
    _audit(action, workspace_id, user_id, role=role, decision=decision, project_id=project_id)
    if not decision.allowed:
        raise PermissionDeniedError(decision.reason)
    return decision


def _audit(
    action: str, workspace_id: str, user_id: str, *, role: str | None, decision: AuthzDecision, project_id: str | None,
) -> None:
    activity_feed_service.record(
        user_id=user_id,
        category="authorization",
        action=action,
        status="allowed" if decision.allowed else "denied",
        metadata={"role": role, "policy": decision.policy, "reason": decision.reason},
        workspace_id=workspace_id,
        project_id=project_id,
        source="authorization_engine",
    )
