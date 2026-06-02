from __future__ import annotations

from fastapi import APIRouter

from app.engines.engineering_readiness_engine import (
    calculate_engineering_readiness,
    calculate_team_requirements,
    estimate_delivery_complexity,
    estimate_operational_burden,
)
from app.schemas.engineering_readiness import (
    DeliveryEstimate,
    EngineeringReadinessProfile,
    EngineeringReadinessRequest,
    OperationalBurden,
    TeamRecommendation,
)


router = APIRouter(tags=["engineering-readiness"])


@router.post("/engineering/readiness", response_model=EngineeringReadinessProfile)
def preview_engineering_readiness(payload: EngineeringReadinessRequest) -> EngineeringReadinessProfile:
    return EngineeringReadinessProfile.model_validate(calculate_engineering_readiness(payload.model_dump()))


@router.post("/engineering/team-profile", response_model=TeamRecommendation)
def preview_team_profile(payload: EngineeringReadinessRequest) -> TeamRecommendation:
    return TeamRecommendation.model_validate(calculate_team_requirements(payload.model_dump()))


@router.post("/engineering/delivery-estimate", response_model=DeliveryEstimate)
def preview_delivery_estimate(payload: EngineeringReadinessRequest) -> DeliveryEstimate:
    return DeliveryEstimate.model_validate(estimate_delivery_complexity(payload.model_dump()))


@router.post("/engineering/operational-burden", response_model=OperationalBurden)
def preview_operational_burden(payload: EngineeringReadinessRequest) -> OperationalBurden:
    return OperationalBurden.model_validate(estimate_operational_burden(payload.model_dump()))
