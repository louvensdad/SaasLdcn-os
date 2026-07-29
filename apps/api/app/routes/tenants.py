from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser
from app.repositories.tenant_repository import ORG_ADMIN_ROLES, TenantAccessError, TenantRepository
from app.schemas.tenant import (
    CreateOrganizationRequest,
    CreateWorkspaceRequest,
    Organization,
    SetWorkspaceMemberRequest,
    Workspace,
    WorkspaceMember,
)
from app.services.plan_access_engine import PlanAccessDeniedError, PlanAccessEngine


router = APIRouter(tags=["tenants"])


def _repository() -> TenantRepository:
    return TenantRepository()


def _not_found(exc: TenantAccessError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/organizations", response_model=list[Organization])
def list_organizations(user: CurrentUser) -> list[Organization]:
    return [Organization.model_validate(item) for item in _repository().list_organizations(user["user_id"])]


@router.post("/organizations", response_model=Organization, status_code=status.HTTP_201_CREATED)
def create_organization(payload: CreateOrganizationRequest, user: CurrentUser) -> Organization:
    try:
        item = _repository().create_organization(user["user_id"], payload.name, payload.slug)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return Organization.model_validate(item)


@router.get("/workspaces", response_model=list[Workspace])
def list_workspaces(user: CurrentUser, organization_id: str | None = Query(default=None)) -> list[Workspace]:
    return [
        Workspace.model_validate(item)
        for item in _repository().list_workspaces(user["user_id"], organization_id)
    ]


@router.get("/workspaces/default", response_model=Workspace)
def default_workspace(user: CurrentUser) -> Workspace:
    repository = _repository()
    item = repository.personal_workspace(user["user_id"])
    if item is None:
        item = repository.ensure_personal_workspace(user["user_id"], user["full_name"])
    return Workspace.model_validate(item)


@router.post("/organizations/{organization_id}/workspaces", response_model=Workspace, status_code=status.HTTP_201_CREATED)
def create_workspace(organization_id: str, payload: CreateWorkspaceRequest, user: CurrentUser) -> Workspace:
    repository = _repository()
    # Permission is checked before the plan check so a non-member can't learn
    # anything about an organization's subscription state (repository.create_workspace
    # re-checks the same permission internally as its own atomic guarantee).
    role = repository.organization_role(organization_id, user["user_id"])
    if role is None or role not in ORG_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found or insufficient permission.")
    try:
        PlanAccessEngine().check_workspace_create(user_id=user["user_id"], organization_id=organization_id)
    except PlanAccessDeniedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=exc.to_detail()) from exc
    try:
        item = repository.create_workspace(user["user_id"], organization_id, payload.name, payload.slug)
    except TenantAccessError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return Workspace.model_validate(item)


@router.get("/workspaces/{workspace_id}", response_model=Workspace)
def get_workspace(workspace_id: str, user: CurrentUser) -> Workspace:
    try:
        item = _repository().require_workspace(workspace_id, user["user_id"])
    except TenantAccessError as exc:
        raise _not_found(exc) from exc
    return Workspace.model_validate(item)


@router.get("/workspaces/{workspace_id}/members", response_model=list[WorkspaceMember])
def list_workspace_members(workspace_id: str, user: CurrentUser) -> list[WorkspaceMember]:
    try:
        items = _repository().list_members(workspace_id, user["user_id"])
    except TenantAccessError as exc:
        raise _not_found(exc) from exc
    return [WorkspaceMember.model_validate(item) for item in items]


@router.put("/workspaces/{workspace_id}/members/{user_id}", response_model=WorkspaceMember)
def set_workspace_member(workspace_id: str, user_id: str, payload: SetWorkspaceMemberRequest, user: CurrentUser) -> WorkspaceMember:
    try:
        item = _repository().set_member(workspace_id, user["user_id"], user_id, payload.role)
    except TenantAccessError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return WorkspaceMember.model_validate(item)
