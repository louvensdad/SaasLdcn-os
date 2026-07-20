from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.schemas.feature import CreateFeatureRequest, Feature, TransitionFeatureStatusRequest
from app.services.feature_service import FeatureTransitionError, feature_service

router = APIRouter(tags=["features"])


@router.post("/features", response_model=Feature, status_code=status.HTTP_201_CREATED)
def create_feature(payload: CreateFeatureRequest, user: CurrentUser) -> Feature:
    row = feature_service.create(owner_user_id=user["user_id"], **payload.model_dump())
    return Feature.model_validate(row)


@router.get("/features", response_model=list[Feature])
def list_features(project_id: str, user: CurrentUser) -> list[Feature]:
    rows = feature_service.list_for_project(project_id, user["user_id"])
    return [Feature.model_validate(row) for row in rows]


@router.get("/features/{feature_id}", response_model=Feature)
def get_feature(feature_id: str, user: CurrentUser) -> Feature:
    row = feature_service.get(feature_id, user["user_id"])
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature não encontrada.")
    return Feature.model_validate(row)


@router.post("/features/{feature_id}/transition", response_model=Feature)
def transition_feature(feature_id: str, payload: TransitionFeatureStatusRequest, user: CurrentUser) -> Feature:
    try:
        row = feature_service.transition(feature_id, user["user_id"], payload.status)
    except FeatureTransitionError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": str(exc), "current_status": exc.current_status, "allowed": exc.allowed},
        ) from exc
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature não encontrada.")
    return Feature.model_validate(row)


@router.delete("/features/{feature_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feature(feature_id: str, user: CurrentUser) -> None:
    deleted = feature_service.delete(feature_id, user["user_id"])
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature não encontrada.")
