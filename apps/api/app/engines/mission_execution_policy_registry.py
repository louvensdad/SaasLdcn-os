from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from app.engines.mission_generation_bridge import (
    REQUIRED_ARTIFACT_TYPES_SOFTWARE_BUILD,
    build_project_spec_from_mission_software_build,
)
from app.schemas.orchestrator import ProjectSpec


@dataclass(frozen=True)
class MissionExecutionPolicy:
    """What MissionExecutionHandoffService needs to know to turn one mission
    genome's confirmed deliverables into a real ProjectRoom. Registering a new
    genome here is the only thing needed to extend the bridge to it -- the
    service itself never branches on mission type."""

    mission_type: str
    required_artifact_types: tuple[str, ...]
    build_project_spec: Callable[[dict[str, Any]], tuple[ProjectSpec, str]]


_POLICIES: dict[str, MissionExecutionPolicy] = {
    "software.build": MissionExecutionPolicy(
        mission_type="software.build",
        required_artifact_types=REQUIRED_ARTIFACT_TYPES_SOFTWARE_BUILD,
        build_project_spec=build_project_spec_from_mission_software_build,
    ),
}


def policy_for(mission_type: str) -> MissionExecutionPolicy | None:
    """None means this mission genome doesn't map to a runnable project
    (e.g. documentation.create, error.diagnose) -- the caller 422s rather than
    guessing at a mapping that doesn't exist."""
    return _POLICIES.get(mission_type)
