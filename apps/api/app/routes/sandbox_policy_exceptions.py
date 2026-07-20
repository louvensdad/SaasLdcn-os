from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.repositories.sandbox_policy_exception_repository import SandboxPolicyExceptionRepository
from app.repositories.tenant_repository import ORG_ADMIN_ROLES, TenantRepository
from app.schemas.sandbox_policy import CreateSandboxPolicyExceptionRequest, SandboxPolicyException
from app.services.activity_feed_service import activity_feed_service
from app.services.execution_runtime import _BLOCKED_PROGRAMS
from app.services.project_writer import ProjectWriter

router = APIRouter(tags=["sandbox-policy"])

_MAX_EXCEPTION_DAYS = 30


def _require_project_admin(project_id: str, user_id: str) -> str | None:
    """Owner of the generated project, OR owner/admin of the workspace it's
    shared under -- the same "sensitive action on a shared project" trust tier
    already established for force-release (test_force_release_rbac.py) and the
    RBAC permission-overrides endpoints (gap #4). Returns the workspace_id used
    for the audit record, or None if the project has no workspace."""
    writer = ProjectWriter()
    owner = writer.read_owner(project_id)
    workspace_id = writer.read_workspace(project_id)
    if owner == user_id:
        return workspace_id
    if workspace_id:
        workspace = TenantRepository().get_workspace_for_user(workspace_id, user_id)
        if workspace is not None and workspace["role"] in ORG_ADMIN_ROLES:
            return workspace_id
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project was not found.")


def _audit(action: str, project_id: str, workspace_id: str | None, user_id: str, **metadata: object) -> None:
    activity_feed_service.record(
        user_id=user_id, category="sandbox_policy", action=action, status="success",
        metadata=metadata, workspace_id=workspace_id, project_id=project_id, source="sandbox_policy_exceptions",
    )


@router.post("/execution/policy-exceptions", response_model=SandboxPolicyException, status_code=status.HTTP_201_CREATED)
def create_policy_exception(payload: CreateSandboxPolicyExceptionRequest, user: CurrentUser) -> SandboxPolicyException:
    program = payload.program.strip().lower()
    if program in _BLOCKED_PROGRAMS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"'{program}' is a hard security block, not a configurable exception.",
        )
    try:
        expires_at = datetime.fromisoformat(payload.expires_at)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="expires_at must be an ISO datetime.") from exc
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if expires_at <= now:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="expires_at must be in the future.")
    if expires_at > now + timedelta(days=_MAX_EXCEPTION_DAYS):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"expires_at cannot be more than {_MAX_EXCEPTION_DAYS} days out -- a longer need belongs in the code allowlist, not a time-bound exception.",
        )

    workspace_id = _require_project_admin(payload.project_id, user["user_id"])
    row = SandboxPolicyExceptionRepository().create(
        project_id=payload.project_id, program=program, reason=payload.reason,
        approved_by_user_id=user["user_id"], expires_at=expires_at.isoformat(),
    )
    _audit("exception_granted", payload.project_id, workspace_id, user["user_id"], program=program, expires_at=row["expires_at"])
    return SandboxPolicyException.model_validate(row)


@router.get("/execution/policy-exceptions", response_model=list[SandboxPolicyException])
def list_policy_exceptions(project_id: str, user: CurrentUser) -> list[SandboxPolicyException]:
    _require_project_admin(project_id, user["user_id"])
    rows = SandboxPolicyExceptionRepository().list_for_project(project_id)
    return [SandboxPolicyException.model_validate(row) for row in rows]


@router.delete("/execution/policy-exceptions/{exception_id}", response_model=SandboxPolicyException)
def revoke_policy_exception(exception_id: str, user: CurrentUser) -> SandboxPolicyException:
    repo = SandboxPolicyExceptionRepository()
    existing = repo.get(exception_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exception was not found.")
    workspace_id = _require_project_admin(existing["project_id"], user["user_id"])
    row = repo.revoke(exception_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Exception was already revoked.")
    _audit("exception_revoked", existing["project_id"], workspace_id, user["user_id"], program=existing["program"])
    return SandboxPolicyException.model_validate(row)
