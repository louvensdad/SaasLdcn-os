from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser
from app.repositories.tenant_repository import TenantAccessError, TenantRepository
from app.schemas.git_provider import GitProviderConnectRequest, GitProviderConnection, RepositoryCommitResponse, RepositoryCreateRequest, RepositoryDelivery, RepositoryInitialCommitRequest, RepositoryListResponse
from app.services.activity_feed_service import activity_feed_service
from app.services.git_provider_service import git_provider_service

router = APIRouter(tags=["git-providers"])


def _workspace(user: dict, requested: str | None) -> str:
    repository = TenantRepository()
    try:
        if requested: return repository.require_workspace(requested, user["user_id"])["workspace_id"]
        current = repository.personal_workspace(user["user_id"])
        if current is None: current = repository.ensure_personal_workspace(user["user_id"], user["full_name"])
        return current["workspace_id"]
    except TenantAccessError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found or inaccessible.") from exc


@router.get("/integrations/git/{provider}", response_model=GitProviderConnection)
def get_connection(provider: Literal["github", "gitlab"], user: CurrentUser, workspace_id: str | None = Query(default=None)) -> GitProviderConnection:
    workspace = _workspace(user, workspace_id)
    return GitProviderConnection.model_validate(git_provider_service.status(user["user_id"], provider, workspace))


@router.post("/integrations/git/{provider}/connect", response_model=GitProviderConnection)
def connect(provider: Literal["github", "gitlab"], payload: GitProviderConnectRequest, user: CurrentUser, workspace_id: str | None = Query(default=None)) -> GitProviderConnection:
    workspace = _workspace(user, workspace_id)
    result = GitProviderConnection.model_validate(git_provider_service.connect(user["user_id"], provider, payload.token, ttl_seconds=payload.ttl_seconds, workspace_id=workspace))
    activity_feed_service.record(user_id=user["user_id"], workspace_id=workspace, category="git", action="provider_connected", status="success", severity="SUCCESS", importance="NORMAL", metadata={"provider": provider})
    return result


@router.post("/integrations/git/{provider}/validate", response_model=GitProviderConnection)
def validate(provider: Literal["github", "gitlab"], user: CurrentUser, workspace_id: str | None = Query(default=None)) -> GitProviderConnection:
    workspace = _workspace(user, workspace_id)
    return GitProviderConnection.model_validate(git_provider_service.validate(user["user_id"], provider, workspace))


@router.delete("/integrations/git/{provider}", response_model=GitProviderConnection)
def disconnect(provider: Literal["github", "gitlab"], user: CurrentUser, workspace_id: str | None = Query(default=None)) -> GitProviderConnection:
    workspace = _workspace(user, workspace_id)
    result = GitProviderConnection.model_validate(git_provider_service.disconnect(user["user_id"], provider, workspace))
    activity_feed_service.record(user_id=user["user_id"], workspace_id=workspace, category="git", action="provider_disconnected", status="success", severity="INFO", importance="NORMAL", metadata={"provider": provider})
    return result


@router.post("/repositories", response_model=RepositoryDelivery)
def create_repository(payload: RepositoryCreateRequest, user: CurrentUser, workspace_id: str | None = Query(default=None)) -> RepositoryDelivery:
    workspace = _workspace(user, workspace_id)
    result = RepositoryDelivery.model_validate(git_provider_service.create_repository(user["user_id"], **payload.model_dump(), workspace_id=workspace))
    activity_feed_service.record(user_id=user["user_id"], workspace_id=workspace, category="git", action="repository_created", status="success", severity="SUCCESS", importance="NORMAL", metadata={"provider": payload.provider, "visibility": payload.visibility})
    return result


@router.get("/repositories", response_model=RepositoryListResponse)
def list_repositories(provider: Literal["github", "gitlab"], user: CurrentUser, workspace_id: str | None = Query(default=None), page: int = 1, per_page: int = 25) -> RepositoryListResponse:
    workspace = _workspace(user, workspace_id)
    return RepositoryListResponse.model_validate(git_provider_service.list_repositories(user["user_id"], provider, page=page, per_page=per_page, workspace_id=workspace))


@router.post("/repositories/initial-commit", response_model=RepositoryCommitResponse)
def initial_commit(payload: RepositoryInitialCommitRequest, user: CurrentUser, workspace_id: str | None = Query(default=None)) -> RepositoryCommitResponse:
    workspace = _workspace(user, workspace_id); data = payload.model_dump(); data["files"] = [{**item, "content": item["content"].encode("utf-8")} for item in data["files"]]
    result = git_provider_service.initial_commit(user["user_id"], **data, workspace_id=workspace)
    activity_feed_service.record(user_id=user["user_id"], workspace_id=workspace, category="git", action="initial_commit_pushed", status="success", severity="SUCCESS", importance="HIGH", metadata={"provider": payload.provider, "namespace": payload.namespace, "repo_name": payload.repo_name, "branch": payload.branch})
    return RepositoryCommitResponse.model_validate(result)


@router.get("/repositories/last-commit", response_model=RepositoryCommitResponse)
def last_commit(provider: Literal["github", "gitlab"], namespace: str, repo_name: str, branch: str, user: CurrentUser, workspace_id: str | None = Query(default=None)) -> RepositoryCommitResponse:
    workspace = _workspace(user, workspace_id)
    return RepositoryCommitResponse.model_validate(git_provider_service.last_commit(user["user_id"], provider, namespace=namespace, repo_name=repo_name, branch=branch, workspace_id=workspace))