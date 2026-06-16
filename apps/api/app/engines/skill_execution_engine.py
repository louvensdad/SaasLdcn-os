from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.data.foundation import CONTRACT_VERSION
from app.engines.architectural_graph_engine import generate_graph_snapshot
from app.engines.engineering_readiness_engine import calculate_engineering_readiness
from app.engines.generation_handoff_engine import build_generation_handoff_package
from app.engines.skill_registry_engine import SkillRegistryEngine
from app.services.generated_project_service import GeneratedProjectService
from app.services.project_service import ProjectService

EXECUTABLE_SKILLS = {
    "review_blueprint",
    "inspect_architecture",
    "inspect_architecture_graph",
    "analyze_readiness",
    "inspect_graph",
    "prepare_handoff",
    "generate_local_project",
    "prepare_download",
}


class SkillExecutionEngine:
    def __init__(
        self,
        project_service: ProjectService | None = None,
        generated_project_service: GeneratedProjectService | None = None,
    ) -> None:
        self.project_service = project_service or ProjectService()
        self.generated_project_service = generated_project_service or GeneratedProjectService()
        self.registry = SkillRegistryEngine()

    def execute(self, skill_id: str, project_id: str | None, context: dict[str, Any]) -> dict[str, Any]:
        normalized_skill_id = self._normalize_skill(skill_id)
        if normalized_skill_id not in EXECUTABLE_SKILLS:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Skill '{skill_id}' is not executable in V1.")
        project = self.project_service.get_project(project_id) if project_id else None
        if project is None and normalized_skill_id not in {"generate_local_project"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="project_id is required for this skill execution.")

        result = self._run(normalized_skill_id, project, context)
        return {
            "contractVersion": CONTRACT_VERSION,
            "execution_id": f"skillrun_{uuid4().hex[:12]}",
            "skill_id": normalized_skill_id,
            "project_id": project_id,
            "status": result["status"],
            "summary": result["summary"],
            "outputs": result.get("outputs") or {},
            "trace": [
                {
                    "contractVersion": CONTRACT_VERSION,
                    "timestamp": datetime.now(UTC).replace(microsecond=0).isoformat(),
                    "step": "deterministic_execution",
                    "status": result["status"],
                    "message": result["summary"],
                }
            ],
            "safety": {
                "no_ai": True,
                "no_llm": True,
                "no_agents": True,
                "no_shell": True,
                "no_external_access": True,
            },
        }

    def _run(self, skill_id: str, project: dict[str, Any] | None, context: dict[str, Any]) -> dict[str, Any]:
        if skill_id == "review_blueprint":
            blueprint = (project or {})["blueprint_snapshot"]
            return {
                "status": "completed",
                "summary": "Blueprint snapshot reviewed deterministically.",
                "outputs": {
                    "valid": blueprint["validation"]["valid"],
                    "errors": blueprint["validation"]["errors"],
                    "warnings": blueprint["validation"]["warnings"],
                    "capability_count": len(blueprint["capabilities"]),
                    "endpoint_count": len(blueprint["endpoints"]),
                },
            }
        if skill_id in {"inspect_architecture", "inspect_graph", "inspect_architecture_graph"}:
            graph = (project or {}).get("architectural_graph_snapshot")
            if graph is None and project is not None:
                graph = generate_graph_snapshot(
                    {
                        "language_id": project["technology_graph"]["language"]["id"],
                        "framework_id": project["technology_graph"]["framework"]["id"],
                        "architecture_id": project["architecture_id"],
                        "capability_ids": project["selected_capabilities"],
                        "business_module_ids": project["selected_business_modules"],
                        "infrastructure_ids": project["blueprint_snapshot"].get("infrastructure_profile", {}).get("selected_component_ids", []),
                    }
                )
            nodes = ((graph or {}).get("graph") or {}).get("nodes") or []
            edges = ((graph or {}).get("graph") or {}).get("edges") or []
            return {
                "status": "completed",
                "summary": "Architectural graph inspected deterministically.",
                "outputs": {"node_count": len(nodes), "edge_count": len(edges), "graph": graph},
            }
        if skill_id == "analyze_readiness":
            assert project is not None
            readiness = calculate_engineering_readiness(
                {
                    "language_id": project["technology_graph"]["language"]["id"],
                    "framework_id": project["technology_graph"]["framework"]["id"],
                    "architecture_id": project["architecture_id"],
                    "capability_ids": project["selected_capabilities"],
                    "infrastructure_ids": project["blueprint_snapshot"].get("infrastructure_profile", {}).get("selected_component_ids", []),
                }
            )
            return {"status": "completed", "summary": "Engineering readiness analyzed deterministically.", "outputs": readiness}
        if skill_id == "prepare_handoff":
            assert project is not None
            handoff = build_generation_handoff_package(project)
            return {
                "status": "completed",
                "summary": f"Generation handoff is {handoff['handoff_readiness']}.",
                "outputs": handoff,
            }
        if skill_id == "prepare_download":
            assert project is not None
            prepared = self.generated_project_service.prepare_download(project)
            return {"status": "completed", "summary": "Secure ZIP prepared deterministically.", "outputs": prepared}
        if skill_id == "generate_local_project":
            return {
                "status": "blocked",
                "summary": "Use backend-generation/run or generation/local-run with an explicit output path. Skill V1 does not infer filesystem targets.",
                "outputs": {"required_context": ["project_id", "output_path", "target", "profile"]},
            }
        return {"status": "blocked", "summary": "Unsupported deterministic skill.", "outputs": {}}

    def _normalize_skill(self, skill_id: str) -> str:
        if skill_id == "inspect_architecture":
            return "inspect_graph"
        return skill_id
