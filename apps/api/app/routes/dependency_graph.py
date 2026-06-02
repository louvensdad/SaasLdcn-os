from __future__ import annotations

from fastapi import APIRouter

from app.engines.dependency_graph_engine import (
    build_dependency_graph,
    calculate_impact,
    calculate_readiness,
    calculate_risks,
)
from app.schemas.dependency_graph import (
    DependencyGraphRequest,
    DependencyGraphSnapshot,
    ImpactProfile,
    ReadinessProfile,
    RiskProfile,
)


router = APIRouter(tags=["dependency-graph"])


@router.post("/dependency-graph/preview", response_model=DependencyGraphSnapshot)
def preview_dependency_graph(payload: DependencyGraphRequest) -> DependencyGraphSnapshot:
    return DependencyGraphSnapshot.model_validate(build_dependency_graph(payload.model_dump()))


@router.post("/dependency-graph/impact", response_model=ImpactProfile)
def preview_impact(payload: DependencyGraphRequest) -> ImpactProfile:
    return ImpactProfile.model_validate(calculate_impact(payload.model_dump()))


@router.post("/dependency-graph/readiness", response_model=ReadinessProfile)
def preview_readiness(payload: DependencyGraphRequest) -> ReadinessProfile:
    return ReadinessProfile.model_validate(calculate_readiness(payload.model_dump()))


@router.post("/dependency-graph/risks", response_model=RiskProfile)
def preview_risks(payload: DependencyGraphRequest) -> RiskProfile:
    return RiskProfile.model_validate(calculate_risks(payload.model_dump()))
