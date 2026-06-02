from __future__ import annotations

from fastapi import APIRouter

from app.schemas.framework_specialist import (
    FrameworkArchitectureGuidance,
    FrameworkCapabilityGuidance,
    FrameworkEndpointGuidance,
    FrameworkReadinessProfile,
    FrameworkSpecialistProfile,
)
from app.services.framework_specialist_service import FrameworkSpecialistService


router = APIRouter(tags=["framework-specialists"])
service = FrameworkSpecialistService()


@router.get("/frameworks/{framework_id}/specialist-profile", response_model=FrameworkSpecialistProfile)
def get_framework_specialist_profile(framework_id: str) -> FrameworkSpecialistProfile:
    return FrameworkSpecialistProfile.model_validate(service.get_specialist_profile(framework_id))


@router.get("/frameworks/{framework_id}/recommended-architectures", response_model=list[FrameworkArchitectureGuidance])
def get_framework_recommended_architectures(framework_id: str) -> list[FrameworkArchitectureGuidance]:
    return [
        FrameworkArchitectureGuidance.model_validate(item)
        for item in service.get_recommended_architectures(framework_id)
    ]


@router.get("/frameworks/{framework_id}/recommended-capabilities", response_model=list[FrameworkCapabilityGuidance])
def get_framework_recommended_capabilities(framework_id: str) -> list[FrameworkCapabilityGuidance]:
    return [
        FrameworkCapabilityGuidance.model_validate(item)
        for item in service.get_recommended_capabilities(framework_id)
    ]


@router.get("/frameworks/{framework_id}/recommended-endpoints", response_model=list[FrameworkEndpointGuidance])
def get_framework_recommended_endpoints(framework_id: str) -> list[FrameworkEndpointGuidance]:
    return [
        FrameworkEndpointGuidance.model_validate(item)
        for item in service.get_recommended_endpoints(framework_id)
    ]


@router.get("/frameworks/{framework_id}/readiness", response_model=FrameworkReadinessProfile)
def get_framework_readiness(framework_id: str) -> FrameworkReadinessProfile:
    return FrameworkReadinessProfile.model_validate(service.get_readiness(framework_id))
