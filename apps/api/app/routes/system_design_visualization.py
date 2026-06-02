from __future__ import annotations

from fastapi import APIRouter

from app.engines.system_design_visualization_engine import (
    generate_architecture_topology,
    generate_dependency_visualization,
    generate_deployment_topology,
    generate_infrastructure_topology,
    generate_readiness_zones,
    generate_risk_zones,
    generate_runtime_flow,
    generate_team_topology,
    generate_visualization_snapshot,
)
from app.schemas.system_design_visualization import (
    ArchitectureTopology,
    DependencyVisualization,
    DeploymentTopology,
    InfrastructureTopology,
    ReadinessZone,
    RiskZone,
    RuntimeFlow,
    TeamTopology,
    VisualizationRequest,
    VisualizationSnapshot,
)

router = APIRouter(tags=["system-design-visualization"])


@router.post("/system-design/architecture-topology", response_model=ArchitectureTopology)
def architecture_topology(payload: VisualizationRequest) -> ArchitectureTopology:
    return ArchitectureTopology.model_validate(generate_architecture_topology(payload.model_dump()))


@router.post("/system-design/infrastructure-topology", response_model=InfrastructureTopology)
def infrastructure_topology(payload: VisualizationRequest) -> InfrastructureTopology:
    return InfrastructureTopology.model_validate(generate_infrastructure_topology(payload.model_dump()))


@router.post("/system-design/runtime-flow", response_model=RuntimeFlow)
def runtime_flow(payload: VisualizationRequest) -> RuntimeFlow:
    return RuntimeFlow.model_validate(generate_runtime_flow(payload.model_dump()))


@router.post("/system-design/dependency-visualization", response_model=DependencyVisualization)
def dependency_visualization(payload: VisualizationRequest) -> DependencyVisualization:
    return DependencyVisualization.model_validate(generate_dependency_visualization(payload.model_dump()))


@router.post("/system-design/risk-zones", response_model=list[RiskZone])
def risk_zones(payload: VisualizationRequest) -> list[RiskZone]:
    return [RiskZone.model_validate(item) for item in generate_risk_zones(payload.model_dump())]


@router.post("/system-design/readiness-zones", response_model=list[ReadinessZone])
def readiness_zones(payload: VisualizationRequest) -> list[ReadinessZone]:
    return [ReadinessZone.model_validate(item) for item in generate_readiness_zones(payload.model_dump())]


@router.post("/system-design/team-topology", response_model=TeamTopology)
def team_topology(payload: VisualizationRequest) -> TeamTopology:
    return TeamTopology.model_validate(generate_team_topology(payload.model_dump()))


@router.post("/system-design/deployment-topology", response_model=DeploymentTopology)
def deployment_topology(payload: VisualizationRequest) -> DeploymentTopology:
    return DeploymentTopology.model_validate(generate_deployment_topology(payload.model_dump()))


@router.post("/system-design/snapshot", response_model=VisualizationSnapshot)
def visualization_snapshot(payload: VisualizationRequest) -> VisualizationSnapshot:
    return VisualizationSnapshot.model_validate(generate_visualization_snapshot(payload.model_dump()))
