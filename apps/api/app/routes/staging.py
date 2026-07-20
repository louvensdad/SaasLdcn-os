from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import CurrentUser
from app.schemas.staging import StagingDeployment, StagingHealthCheck
from app.services.staging_service import StagingAccessError, staging_service

router = APIRouter(tags=["staging"])


@router.post("/staging/{project_id}/deploy", response_model=StagingDeployment)
def deploy_staging(project_id: str, user: CurrentUser) -> StagingDeployment:
    try:
        return staging_service.deploy(project_id, user["user_id"])
    except StagingAccessError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/staging/{project_id}", response_model=StagingDeployment)
def get_staging(project_id: str, user: CurrentUser) -> StagingDeployment:
    deployment = staging_service.get(project_id, user["user_id"])
    if deployment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staging deployment não encontrado.")
    return deployment


@router.get("/staging/{project_id}/health", response_model=StagingHealthCheck)
def check_staging_health(project_id: str, user: CurrentUser) -> StagingHealthCheck:
    result = staging_service.health_check(project_id, user["user_id"])
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staging deployment não encontrado.")
    return result


@router.post("/staging/{project_id}/rollback", response_model=StagingDeployment)
def rollback_staging(project_id: str, user: CurrentUser) -> StagingDeployment:
    try:
        deployment = staging_service.rollback(project_id, user["user_id"])
    except StagingAccessError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if deployment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staging deployment não encontrado.")
    return deployment


@router.post("/staging/{project_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
def stop_staging(project_id: str, user: CurrentUser) -> Response:
    if not staging_service.stop(project_id, user["user_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staging deployment não encontrado.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
