from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# Vault 57 - Especificações/Matriz de permissões por ação.md: a per-action permission
# matrix across 5 roles (Owner/Admin/Developer/Reviewer/Viewer), plus ABAC's "negação
# prevalece sobre permissão ampla" (denial prevails over broad permission).
#
# Scope decision (2026-07-20, confirmed with the user): the vault lists 6 actions, but
# only 2 of them have a real multi-user (workspace-shared) resource in this codebase
# today -- ProjectRoom and ChangeRequest are strictly owner-scoped (no teammate can
# ever reach another user's room/change-request), and no endpoint returns raw secret
# material at all. Wiring a role check into those would either be dead code (never
# fires against anyone but the resource's own owner) or require first building
# shared-room/shared-change-request access, which is a separate, materially bigger
# feature -- not something to invent silently here. See NOT_WIRED below.

ROLE_ALIASES = {"member": "developer"}


def canonical_role(role: str) -> str:
    return ROLE_ALIASES.get(role, role)


PermissionCell = Literal["allow", "deny", "configurable"]

# Real, currently-wired actions.
PERMISSION_MATRIX: dict[str, dict[str, PermissionCell]] = {
    "execute_build": {
        "owner": "allow", "admin": "allow", "developer": "allow", "reviewer": "deny", "viewer": "deny",
    },
    "publish_production": {
        "owner": "allow", "admin": "configurable", "developer": "configurable", "reviewer": "deny", "viewer": "deny",
    },
}

# Vault rows with no real multi-user resource to gate today -- recorded for
# documentation/traceability, never evaluated by any endpoint.
NOT_WIRED: dict[str, str] = {
    "edit_blueprint": "ProjectRoom access is get_for_owner(room_id, owner_user_id) only -- no teammate ever reaches another user's room.",
    "restore_version": "Same ProjectRoom owner-only access as edit_blueprint.",
    "approve_change": "ChangeRequest access is owner_user_id-scoped only; workspace_id is stored but not used for access control.",
    "view_secrets": "No endpoint returns raw secret material -- git connections and AI keys already return status/masked fields only.",
}

@dataclass(frozen=True)
class AuthzDecision:
    allowed: bool
    policy: str
    reason: str


def evaluate_permission(action: str, role: str, *, override: bool | None) -> AuthzDecision:
    """Pure function: no I/O, no audit side-effect -- the caller (app/core/
    authorization.py's require_permission) is responsible for looking up the
    override and recording the audit trail. Kept separate so the matrix logic
    itself is trivially unit-testable without a database."""
    canon = canonical_role(role)
    cell = PERMISSION_MATRIX.get(action, {}).get(canon)
    if cell is None:
        return AuthzDecision(False, "unknown_action_or_role", f"No matrix entry for action={action!r} role={canon!r}.")
    if cell == "allow":
        return AuthzDecision(True, "matrix_allow", f"O papel '{canon}' tem permissão incondicional para '{action}'.")
    if cell == "deny":
        return AuthzDecision(False, "matrix_deny", f"O papel '{canon}' não tem permissão para '{action}'.")
    # "configurable": defaults to allow when unset (confirmed with the user 2026-07-20)
    # -- preserves pre-existing behavior (these roles had unrestricted access before
    # this permission layer existed) while letting a workspace Owner/Admin tighten it.
    if override is None:
        return AuthzDecision(
            True, "default_allow_unconfigured",
            f"'{action}' é configurável por workspace para o papel '{canon}'; nenhuma configuração explícita "
            "existe, então o padrão (permitir) se aplica.",
        )
    if override:
        return AuthzDecision(True, "override_allow", f"A workspace permite explicitamente '{action}' para o papel '{canon}'.")
    return AuthzDecision(False, "override_deny", f"A workspace restringe explicitamente '{action}' para o papel '{canon}'.")
