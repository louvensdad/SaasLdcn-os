from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends

from app.core.deps import require_role
from app.schemas.git_provider import GitProviderConnectRequest, GitProviderConnection, RepositoryCreateRequest, RepositoryDelivery
from app.services.git_provider_service import git_provider_service

router = APIRouter(
    tags=["git-providers"],
    dependencies=[Depends(require_role("admin"))],
)


@router.get("/integrations/git/{provider}", response_model=GitProviderConnection)
def get_connection(provider: Literal["github", "gitlab"]) -> GitProviderConnection:
    return GitProviderConnection.model_validate(git_provider_service.status(provider))


@router.post("/integrations/git/{provider}/connect", response_model=GitProviderConnection)
def connect(provider: Literal["github", "gitlab"], payload: GitProviderConnectRequest) -> GitProviderConnection:
    return GitProviderConnection.model_validate(git_provider_service.connect(provider, payload.token))


@router.post("/integrations/git/{provider}/validate", response_model=GitProviderConnection)
def validate(provider: Literal["github", "gitlab"]) -> GitProviderConnection:
    return GitProviderConnection.model_validate(git_provider_service.validate(provider))


@router.delete("/integrations/git/{provider}", response_model=GitProviderConnection)
def disconnect(provider: Literal["github", "gitlab"]) -> GitProviderConnection:
    return GitProviderConnection.model_validate(git_provider_service.disconnect(provider))


@router.post("/repositories", response_model=RepositoryDelivery)
def create_repository(payload: RepositoryCreateRequest) -> RepositoryDelivery:
    return RepositoryDelivery.model_validate(git_provider_service.create_repository(**payload.model_dump()))
