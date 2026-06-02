from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException, status

from app.data.foundation import CONTRACT_VERSION

SAFE_SKILL_ID = re.compile(r"^[a-z0-9][a-z0-9_]*$")


def _dep(dep_id: str, label: str, kind: str, required: bool = True) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": dep_id,
        "label": label,
        "kind": kind,
        "required": required,
    }


def _skill(
    skill_id: str,
    name: str,
    category: str,
    description: str,
    tags: list[str],
    requirements: list[str],
    examples: list[str],
    dependencies: list[dict[str, Any]],
    *,
    maturity: str = "foundation",
    execution_mode: str = "manual_assist",
) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": skill_id,
        "name": name,
        "description": description,
        "category": category,
        "tags": tags,
        "requirements": requirements,
        "examples": examples,
        "dependencies": dependencies,
        "metadata": {
            "contractVersion": CONTRACT_VERSION,
            "category": category,
            "maturity": maturity,
            "execution_mode": execution_mode,
            "safe": True,
            "no_ai": True,
            "no_agents": True,
            "no_external_integrations": True,
        },
    }


SKILLS: list[dict[str, Any]] = [
    _skill(
        "review_blueprint",
        "Review Blueprint",
        "architecture",
        "Inspect the saved blueprint contract, validation warnings, selected modules and project shape.",
        ["blueprint", "validation", "architecture"],
        ["Project blueprint exists", "No code execution required"],
        ["Review blueprint validation before handoff", "Inspect selected capabilities for missing baselines"],
        [_dep("blueprints.preview", "Blueprint preview endpoint", "endpoint"), _dep("project_record", "Project record", "project", False)],
        maturity="stable",
        execution_mode="read_only",
    ),
    _skill(
        "inspect_architecture_graph",
        "Inspect Architecture Graph",
        "architecture",
        "Read architectural graph nodes, ownership, dependencies and warnings.",
        ["graph", "dependencies", "ownership"],
        ["Architecture selection exists"],
        ["Inspect graph after choosing microservices", "Review node ownership before generation handoff"],
        [_dep("architectural_graph.preview", "Architectural graph preview endpoint", "endpoint")],
        maturity="stable",
        execution_mode="read_only",
    ),
    _skill(
        "analyze_readiness",
        "Analyze Readiness",
        "architecture",
        "Inspect production readiness, team burden and delivery complexity.",
        ["readiness", "team", "delivery"],
        ["Framework and architecture selected"],
        ["Estimate readiness for a Spring Boot service", "Compare modular monolith and microservices burden"],
        [_dep("engineering.readiness", "Engineering readiness endpoint", "endpoint")],
        maturity="stable",
        execution_mode="read_only",
    ),
    _skill(
        "analyze_risks",
        "Analyze Risks",
        "architecture",
        "Inspect risk surfaces from dependency graph and engineering readiness.",
        ["risk", "dependency", "gatekeeper"],
        ["Blueprint or dependency graph selection exists"],
        ["Review operational risk after adding Kubernetes", "Inspect AI monitoring gaps"],
        [_dep("dependency_graph.risks", "Dependency graph risk endpoint", "endpoint"), _dep("gatekeeper.preview", "Gatekeeper preview", "endpoint", False)],
        maturity="foundation",
        execution_mode="read_only",
    ),
    _skill(
        "recommend_framework",
        "Recommend Framework",
        "planning",
        "Use local language and framework profiles to suggest framework direction.",
        ["framework", "planning", "registry"],
        ["Language selected"],
        ["Suggest framework for TypeScript", "Compare FastAPI and Django recommendations"],
        [_dep("language_domains.recommendations", "Language recommendation endpoint", "endpoint")],
        maturity="foundation",
        execution_mode="read_only",
    ),
    _skill(
        "recommend_architecture",
        "Recommend Architecture",
        "planning",
        "Use local registry and specialist profiles to suggest architecture direction.",
        ["architecture", "planning", "registry"],
        ["Language or framework selected"],
        ["Suggest architecture for Next.js landing page", "Review microservices prerequisites"],
        [_dep("registry.architectures", "Architecture registry", "registry")],
        maturity="foundation",
        execution_mode="read_only",
    ),
    _skill(
        "estimate_team",
        "Estimate Team",
        "planning",
        "Estimate team roles, seniority and expertise requirements.",
        ["team", "readiness", "planning"],
        ["Framework and architecture selected"],
        ["Estimate team for Kubernetes", "Inspect AI infra expertise needs"],
        [_dep("engineering.team_profile", "Team profile endpoint", "endpoint")],
        maturity="stable",
        execution_mode="read_only",
    ),
    _skill(
        "prepare_handoff",
        "Prepare Handoff",
        "generation",
        "Prepare the existing generation handoff package without generating new code.",
        ["handoff", "generation", "safe"],
        ["Project record exists", "Blueprint, Prompt Master and Gatekeeper snapshots exist"],
        ["Prepare handoff before local generation", "Inspect handoff blockers"],
        [_dep("generation.handoff_preview", "Generation handoff preview endpoint", "endpoint"), _dep("project_record", "Project record", "project")],
        maturity="stable",
        execution_mode="manual_assist",
    ),
    _skill(
        "generate_local_project",
        "Generate Local Project",
        "generation",
        "Run the existing local deterministic generation flow when explicitly triggered by the user.",
        ["local", "generation", "template"],
        ["Project is ready for generation", "Output path provided by user"],
        ["Generate local static project from supported template"],
        [_dep("local_generation.run", "Local generation endpoint", "endpoint"), _dep("templates", "Local template registry", "template")],
        maturity="foundation",
        execution_mode="local_safe",
    ),
    _skill(
        "inspect_generated_files",
        "Inspect Generated Files",
        "generation",
        "Index and preview generated project files without executing code.",
        ["files", "preview", "safe"],
        ["Project has generated path"],
        ["Preview README.md", "Block binary preview safely"],
        [_dep("generation.files", "Generated files endpoint", "endpoint")],
        maturity="stable",
        execution_mode="read_only",
    ),
    _skill(
        "prepare_download",
        "Prepare Download",
        "generation",
        "Prepare secure ZIP download for an existing generated project.",
        ["download", "zip", "safe"],
        ["Project has generated path", "Generated files pass security filters"],
        ["Prepare ZIP after inspecting generated files"],
        [_dep("generation.prepare_download", "Prepare download endpoint", "endpoint")],
        maturity="stable",
        execution_mode="manual_assist",
    ),
    _skill(
        "diagnose_backend",
        "Diagnose Backend",
        "support",
        "Inspect backend health and offline states from existing status endpoints.",
        ["backend", "health", "support"],
        ["Health endpoint reachable or offline state detected"],
        ["Diagnose backend offline safe state", "Review API status before retry"],
        [_dep("health", "Health endpoint", "endpoint")],
        maturity="foundation",
        execution_mode="read_only",
    ),
    _skill(
        "diagnose_frontend",
        "Diagnose Frontend",
        "support",
        "Inspect frontend status surfaces and known validation state.",
        ["frontend", "build", "support"],
        ["Frontend shell loaded"],
        ["Review build health card", "Inspect frontend safe states"],
        [_dep("system_status", "System status endpoint", "endpoint")],
        maturity="foundation",
        execution_mode="read_only",
    ),
    _skill(
        "inspect_templates",
        "Inspect Templates",
        "support",
        "Inspect local template catalog, metadata, compatibility and maturity.",
        ["templates", "catalog", "support"],
        ["Template registry available"],
        ["Inspect landing-page changelog", "Review template compatibility"],
        [_dep("templates.catalog", "Template catalog endpoint", "endpoint")],
        maturity="stable",
        execution_mode="read_only",
    ),
]


class SkillRegistryEngine:
    def list_skills(self) -> list[dict[str, Any]]:
        return sorted(SKILLS, key=lambda item: (item["category"], item["id"]))

    def get_skill(self, skill_id: str) -> dict[str, Any]:
        if not SAFE_SKILL_ID.fullmatch(skill_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Skill '{skill_id}' was not found.")
        for skill in SKILLS:
            if skill["id"] == skill_id:
                return skill
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Skill '{skill_id}' was not found.")

    def categories(self) -> list[str]:
        return ["architecture", "planning", "generation", "support"]

    def recommendations(self, selection: dict[str, Any]) -> list[dict[str, Any]]:
        project_id = selection.get("project_id")
        architecture_id = selection.get("architecture_id")
        framework_id = selection.get("framework_id")
        has_generated_project = bool(selection.get("has_generated_project"))
        scored = []
        for skill in self.list_skills():
            score = 40
            reasons: list[str] = []
            if skill["category"] == "architecture" and architecture_id:
                score += 30
                reasons.append("Architecture context is available.")
            if skill["category"] == "planning" and framework_id:
                score += 25
                reasons.append("Framework context is available.")
            if skill["id"] in {"prepare_handoff", "generate_local_project"} and project_id:
                score += 30
                reasons.append("Project record is available.")
            if skill["id"] in {"inspect_generated_files", "prepare_download"} and has_generated_project:
                score += 40
                reasons.append("Generated project files are available.")
            if skill["category"] == "support":
                score += 15
                reasons.append("Support skills are always safe to inspect.")
            scored.append(
                {
                    "contractVersion": CONTRACT_VERSION,
                    "skill_id": skill["id"],
                    "score": min(score, 100),
                    "reason": " ".join(reasons) or "Foundational skill is available from the local registry.",
                    "unlocked": score >= 55,
                }
            )
        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[:6]

    def preview(self, skill_id: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        skill = self.get_skill(skill_id)
        del context
        return {
            "contractVersion": CONTRACT_VERSION,
            "skill_id": skill["id"],
            "title": f"{skill['name']} preview",
            "summary": f"Read-only operational preview for {skill['name']}. No action is executed.",
            "steps": [
                "Load local registry metadata.",
                "Inspect declared dependencies and requirements.",
                "Return a safe preview plan without mutation or execution.",
            ],
            "safety_notes": [
                "No AI execution.",
                "No agents.",
                "No shell execution.",
                "No external integration.",
            ],
            "execution_enabled": False,
        }
