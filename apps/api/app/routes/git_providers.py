from __future__ import annotations

from typing import Literal

from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.schemas.git_provider import GitProviderConnectRequest, GitProviderConnection, RepositoryCreateRequest, RepositoryDelivery
from app.services.git_provider_service import git_provider_service

# Git connections are now per-user (each user owns an isolated GitHub/GitLab
# credential), so these endpoints require authentication but NOT the admin role.
router = APIRouter(tags=["git-providers"])


@router.get("/integrations/git/{provider}", response_model=GitProviderConnection)
def get_connection(provider: Literal["github", "gitlab"], user: CurrentUser) -> GitProviderConnection:
    return GitProviderConnection.model_validate(git_provider_service.status(user["user_id"], provider))


@router.post("/integrations/git/{provider}/connect", response_model=GitProviderConnection)
def connect(provider: Literal["github", "gitlab"], payload: GitProviderConnectRequest, user: CurrentUser) -> GitProviderConnection:
    return GitProviderConnection.model_validate(
        git_provider_service.connect(user["user_id"], provider, payload.token, payload.ttl_seconds)
    )


@router.post("/integrations/git/{provider}/validate", response_model=GitProviderConnection)
def validate(provider: Literal["github", "gitlab"], user: CurrentUser) -> GitProviderConnection:
    return GitProviderConnection.model_validate(git_provider_service.validate(user["user_id"], provider))


@router.delete("/integrations/git/{provider}", response_model=GitProviderConnection)
def disconnect(provider: Literal["github", "gitlab"], user: CurrentUser) -> GitProviderConnection:
    return GitProviderConnection.model_validate(git_provider_service.disconnect(user["user_id"], provider))


@router.post("/repositories", response_model=RepositoryDelivery)
def create_repository(payload: RepositoryCreateRequest, user: CurrentUser) -> RepositoryDelivery:
    return RepositoryDelivery.model_validate(git_provider_service.create_repository(user["user_id"], **payload.model_dump()))
