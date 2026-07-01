from __future__ import annotations

from pathlib import Path
from statistics import mean
from typing import Any

from app.core.config import BASE_DIR
from app.data.foundation import CONTRACT_VERSION
from app.engines.skill_registry_engine import SkillRegistryEngine
from app.engines.template_registry_engine import TemplateRegistryEngine
from app.repositories.project_repository import ProjectRepository

STATUSES = ["IMPLEMENTED", "IN_PROGRESS", "PLANNED", "FUTURE", "ARCHIVED"]

RELEASES: list[dict[str, Any]] = [
    {"id": "v1", "title": "Foundation", "date": "2026-06-02", "status": "DELIVERED", "progress": 100, "features": ["project_registry", "template_marketplace", "skill_registry", "system_status", "architecture_center", "roadmap_center"], "dependencies": [], "risks": []},
    {"id": "v2", "title": "Generation workflow", "date": "2026-06-18", "status": "DELIVERED", "progress": 100, "features": ["project_room", "prompt_master", "architect", "blueprint", "meta_factory", "engineering_review", "local_generation"], "dependencies": ["project_registry", "skill_registry"], "risks": []},
    {"id": "v2.5", "title": "Engineering control plane", "date": "2026-06-26", "status": "ACTIVE", "progress": 72, "features": ["engineering_laboratory", "deploy_center", "documentation_engine", "git_export", "user_key_boost"], "dependencies": ["meta_factory", "engineering_review", "local_generation"], "risks": ["Terminal, deploy and laboratory actions require backend execution boundaries."]},
    {"id": "v3", "title": "Observability and analytics", "date": "2026-07-30", "status": "PLANNED", "progress": 20, "features": ["analytics_center", "monitoring_center", "pdf_contract_input", "external_marketplace"], "dependencies": ["engineering_laboratory", "deploy_center"], "risks": ["Runtime telemetry is not available until collectors are connected."]},
    {"id": "v4", "title": "Agent runtime governance", "date": "2026-09-15", "status": "PLANNED", "progress": 0, "features": ["agent_runtime"], "dependencies": ["user_key_boost", "engineering_laboratory"], "risks": ["Agents remain out of scope until execution governance is approved."]},
]


def item(id: str, title: str, category: str, status: str, summary: str, progress: int, deps: list[str], release: str, owner: str, priority: str, maturity: str, risk: str, tags: list[str], *, updated: str = "2026-06-26", engines: list[str] | None = None, apis: list[str] | None = None, skills: list[str] | None = None, contracts: list[str] | None = None, docs: list[str] | None = None, impact: str | None = None, risk_basis: list[str] | None = None) -> dict[str, Any]:
    return {
        "id": id,
        "title": title,
        "category": category,
        "status": status,
        "summary": summary,
        "progress": progress,
        "dependencies": deps,
        "release": release,
        "updated_at": updated,
        "owner": owner,
        "priority": priority,
        "maturity": maturity,
        "risk": risk,
        "risk_basis": risk_basis or ["Derived from roadmap dependencies, maturity, documentation and active API evidence."],
        "engines": engines or [],
        "apis": apis or [],
        "skills": skills or [],
        "contracts": contracts or [],
        "documentation": docs or [],
        "impact": impact or f"If {title} is unavailable, downstream modules depending on it are blocked or degraded.",
        "tags": tags,
    }


ITEMS: list[dict[str, Any]] = [
    item("project_registry", "Project Registry", "module", "IMPLEMENTED", "Persisted project records and detail surfaces.", 100, [], "v1", "Platform Core", "CRITICAL", "PRODUCTION_READY", "LOW", ["backend", "api", "platform"], updated="2026-06-02", apis=["GET /api/projects", "POST /api/projects/save-from-wizard"], contracts=["project.contract.ts"], docs=["Project records"]),
    item("project_room", "Project Room", "module", "IMPLEMENTED", "Conversational intake that turns product intent into a governed ProjectSpec.", 100, ["project_registry"], "v2", "Product Intelligence", "CRITICAL", "BETA", "MEDIUM", ["frontend", "backend", "ia", "architecture"], apis=["GET /api/project-rooms", "POST /api/project-rooms"], contracts=["project-room.contract.ts"], docs=["PromptMaster.md"]),
    item("prompt_master", "PromptMaster", "ai", "IMPLEMENTED", "Generates the project contract document used by architecture and generation.", 100, ["project_room"], "v2", "Product Intelligence", "CRITICAL", "BETA", "MEDIUM", ["ia", "architecture", "documentation"], engines=["prompt_master_md_engine"], apis=["POST /api/project-rooms/{room_id}/generate-prompt"], skills=["review_blueprint"], contracts=["prompt-master.contract.ts"], docs=["PromptMaster.md"], impact="If unavailable, Architect and Blueprint lose the canonical project brief."),
    item("architect", "Architect", "architecture", "IMPLEMENTED", "Architecture selection and validation surface for generated products.", 100, ["prompt_master"], "v2", "Architecture Guild", "CRITICAL", "BETA", "MEDIUM", ["architecture", "backend", "frontend"], engines=["architecture_recommendation_engine", "architectural_graph_engine"], apis=["GET /api/architectures"], contracts=["architecture.contract.ts", "architectural-graph.contract.ts"], docs=["Architecture report"]),
    item("blueprint", "Blueprint", "architecture", "IMPLEMENTED", "Builds a structured blueprint from requirements, stack, modules and endpoints.", 100, ["architect", "prompt_master"], "v2", "Architecture Guild", "CRITICAL", "BETA", "LOW", ["architecture", "backend", "api"], engines=["blueprint_engine"], apis=["POST /api/blueprints/preview"], skills=["review_blueprint"], contracts=["blueprint.contract.ts"], docs=["Blueprint report"], impact="If unavailable, Meta-Factory cannot receive a deterministic generation scope."),
    item("engineering_review", "Engineering Review", "module", "IMPLEMENTED", "Readiness and quality checks before generation or deploy.", 100, ["blueprint"], "v2", "Quality Guild", "HIGH", "BETA", "MEDIUM", ["quality", "security", "backend", "tests"], engines=["engineering_readiness_engine", "generated_project_quality_engine"], apis=["POST /api/generated-projects/{project_id}/quality-check"], contracts=["engineering-readiness.contract.ts", "generated-project-quality.contract.ts"], docs=["Engineering readiness"]),
    item("meta_factory", "Meta-Factory", "engine", "IMPLEMENTED", "Generates project files from approved specifications.", 100, ["blueprint", "engineering_review", "project_registry"], "v2", "Generation Platform", "CRITICAL", "BETA", "HIGH", ["backend", "engine", "templates", "quality"], engines=["meta_factory_engine", "generated_project_quality_engine"], apis=["POST /api/meta-factory/generate", "GET /api/meta-factory/{project_id}/files"], skills=["prepare_download"], contracts=["meta-factory.contract.ts", "local-generation.contract.ts"], docs=["Generation manifest", "Quality gate"], risk_basis=["Writes project files and requires path controls.", "Generation quality depends on template and validation coverage."], impact="If unavailable, no new project artifact can be created or refreshed."),
    item("local_generation", "Local Generation Download Preview", "engine", "IMPLEMENTED", "Safe local generation inspection and ZIP preparation.", 100, ["project_registry", "meta_factory"], "v2", "Generation Platform", "HIGH", "BETA", "MEDIUM", ["backend", "generation", "export"], engines=["local_generation_engine"], apis=["GET /api/generation/{project_id}/files", "POST /api/generation/{project_id}/prepare-download"], skills=["prepare_download"], contracts=["local-generation.contract.ts"], docs=["Generation files"]),
    item("engineering_laboratory", "Engineering Laboratory", "laboratory", "IN_PROGRESS", "Professional workbench for analysis, terminal, API exploration, security, quality and tests.", 84, ["meta_factory", "engineering_review", "local_generation"], "v2.5", "Engineering Tools", "CRITICAL", "ALPHA", "HIGH", ["laboratory", "backend", "frontend", "security", "tests"], engines=["engineering_lab_engine", "generated_project_quality_engine"], apis=["GET /api/engineering-lab/projects/{project_id}/overview", "POST /api/engineering-lab/projects/{project_id}/terminal"], contracts=["engineering_lab.py"], docs=["reports/engineering_laboratory.md"], risk_basis=["Executes real backend commands through controlled endpoints.", "Analysis coverage depends on generated project files and installed tools."], impact="If unavailable, users lose the main pre-deploy audit and remediation workbench."),
    item("deploy_center", "Deploy Center", "deploy", "IN_PROGRESS", "Provider-aware delivery continuation after laboratory validation.", 58, ["engineering_laboratory", "git_export", "local_generation"], "v2.5", "Platform Delivery", "HIGH", "ALPHA", "HIGH", ["deploy", "devops", "cloud", "backend"], engines=["git_export_engine"], apis=["POST /api/git/export/{provider}", "GET /api/git/export/status/{job_id}"], contracts=["git-export.contract.ts", "git-provider.contract.ts"], docs=["Deploy report"], risk_basis=["Cloud deployment automation is not active yet.", "Git provider export is available but provider deploys remain gated."]),
    item("documentation_engine", "Documentation Engine", "documentation", "IMPLEMENTED", "Generates and exports project documentation from generated files and project metadata.", 100, ["project_registry", "local_generation"], "v2.5", "Documentation Guild", "HIGH", "BETA", "LOW", ["documentation", "frontend", "backend"], engines=["documentation_engine"], apis=["GET /api/projects/{project_id}/documentation", "POST /api/projects/{project_id}/documentation/export"], contracts=["documentation.contract.ts"], docs=["README", "ADR", "Architecture docs"]),
    item("template_marketplace", "Template Marketplace Foundation", "template", "IMPLEMENTED", "Local template catalog, metadata and compatibility.", 100, [], "v1", "Generation Platform", "HIGH", "PRODUCTION_READY", "LOW", ["templates", "backend", "frontend"], updated="2026-06-02", engines=["template_registry_engine"], apis=["GET /api/templates"], contracts=["template.contract.ts"], docs=["Template catalog"]),
    item("skill_registry", "Skill Registry Foundation", "skill", "IMPLEMENTED", "Read-only operational skill registry and preview plans.", 100, [], "v1", "Automation Governance", "HIGH", "PRODUCTION_READY", "LOW", ["skills", "backend", "security"], updated="2026-06-02", engines=["skill_registry_engine"], apis=["GET /api/skills", "POST /api/skills/preview"], skills=["review_blueprint", "prepare_download"], contracts=["skill.contract.ts"], docs=["Skill registry"], risk_basis=["Preview plans do not execute actions.", "Registry is read-only."]),
    item("system_status", "System Status Center", "visualization", "IMPLEMENTED", "Internal runtime, registry and validation health.", 100, ["template_marketplace", "skill_registry"], "v1", "Platform Core", "MEDIUM", "PRODUCTION_READY", "LOW", ["monitoring", "backend", "frontend"], updated="2026-06-02", engines=["system_status_engine"], apis=["GET /api/system-status"], contracts=["system-status.contract.ts"], docs=["System status"]),
    item("architecture_center", "Architecture Center", "architecture", "IMPLEMENTED", "Current platform architecture overview from local knowledge.", 100, ["system_status"], "v1", "Architecture Guild", "HIGH", "BETA", "LOW", ["architecture", "frontend", "backend"], updated="2026-06-02", engines=["system_design_visualization_engine", "architectural_graph_engine"], apis=["GET /api/architecture", "GET /api/system-design"], contracts=["system-design-visualization.contract.ts"], docs=["Architecture map"]),
    item("roadmap_center", "Roadmap Center", "module", "IMPLEMENTED", "Executive roadmap grouped by releases, dependencies, impact and lifecycle status.", 100, ["system_status", "architecture_center"], "v1", "Platform Strategy", "HIGH", "BETA", "LOW", ["planning", "frontend", "backend"], engines=["roadmap_engine"], apis=["GET /api/roadmap"], contracts=["roadmap.contract.ts"], docs=["reports/roadmap_center_refactor.md"], impact="If unavailable, CTO-level release and dependency tracking falls back to raw module inventories."),
    item("user_key_boost", "User Key Boost", "extension", "IMPLEMENTED", "Bring-your-own LLM key per session, held only in encrypted RAM and cleared on logout.", 100, [], "v2.5", "Security Guild", "HIGH", "BETA", "MEDIUM", ["ia", "security", "backend"], apis=["POST /api/user-ai-keys/session", "DELETE /api/user-ai-keys/session"], contracts=["user-key-boost.contract.ts"], docs=["Security notes"], risk_basis=["Secrets must never be logged or persisted.", "Tests verify validation errors do not echo raw keys."]),
    item("git_export", "Git Provider Export", "extension", "IMPLEMENTED", "Self-service GitHub and GitLab connection, repository creation, initial commit and push.", 100, ["local_generation", "engineering_review"], "v2.5", "Platform Delivery", "HIGH", "BETA", "MEDIUM", ["deploy", "devops", "backend"], engines=["git_export_engine"], apis=["POST /api/git/export/github", "POST /api/git/export/gitlab"], contracts=["git-export.contract.ts", "git-provider.contract.ts"], docs=["Git export"]),
    item("pdf_contract_input", "PDF Contract Input", "extension", "PLANNED", "PDF contract context upload and embedded text extraction are planned without OCR or auto-generation.", 15, ["project_room", "prompt_master"], "v3", "Product Intelligence", "MEDIUM", "PROTOTYPE", "MEDIUM", ["planning", "documentation", "security"], updated="2026-06-02", apis=["POST /api/contracts/upload-pdf", "POST /api/contracts/analyze"], contracts=["pdf-contract.contract.ts"], docs=["PDF contract plan"], risk_basis=["Placeholder endpoints return 501.", "No PDF processing is active."]),
    item("analytics_center", "Analytics Center", "visualization", "PLANNED", "Platform analytics for generated projects, validations, deploys and engineering activity.", 20, ["system_status", "engineering_laboratory"], "v3", "Platform Strategy", "MEDIUM", "PROTOTYPE", "HIGH", ["analytics", "frontend", "backend"], docs=["Analytics plan"], risk_basis=["Runtime telemetry collectors are not connected yet.", "Historical counters require backend aggregation."]),
    item("monitoring_center", "Monitoring Center", "visualization", "FUTURE", "Runtime monitoring for deployed applications and platform operations.", 0, ["deploy_center", "analytics_center"], "v3", "Platform Operations", "MEDIUM", "PROTOTYPE", "HIGH", ["monitoring", "cloud", "devops"], docs=["Monitoring plan"], risk_basis=["No runtime collectors are active.", "Depends on deploy and analytics foundations."]),
    item("agent_runtime", "Agent Runtime", "agent", "FUTURE", "Agents remain explicitly out of scope until execution governance is approved.", 0, ["user_key_boost", "engineering_laboratory"], "v4", "Automation Governance", "LOW", "PROTOTYPE", "CRITICAL", ["agents", "ia", "security"], updated="2026-06-02", docs=["Agent governance plan"], risk_basis=["Autonomous execution is not enabled.", "Provider, permission and audit policies are required first."]),
    item("external_marketplace", "External Marketplace", "registry", "FUTURE", "No external marketplace integration in current foundation.", 0, ["template_marketplace", "skill_registry"], "v3", "Platform Strategy", "LOW", "PROTOTYPE", "MEDIUM", ["templates", "skills", "security"], updated="2026-06-02", docs=["Marketplace plan"]),
    item("legacy_placeholders", "Archived Placeholders", "module", "ARCHIVED", "Reserved and archived folders remain documented.", 0, [], "v1", "Platform Core", "LOW", "PROTOTYPE", "LOW", ["archive"], updated="2026-06-02", docs=["Archive notes"], impact="No active platform flow depends on archived placeholders.", risk_basis=["Archived items are not active runtime dependencies."]),
]

TIMELINE_ORDER = ["project_room", "prompt_master", "architect", "blueprint", "meta_factory", "engineering_review", "engineering_laboratory", "deploy_center", "analytics_center", "monitoring_center"]


class RoadmapEngine:
    def __init__(self) -> None:
        self.root = BASE_DIR.parents[1]

    def roadmap(self) -> dict[str, Any]:
        items = [self._with_contract(entry) for entry in ITEMS]
        return {
            "contractVersion": CONTRACT_VERSION,
            "items": items,
            "statuses": STATUSES,
            "releases": [self._with_contract(entry) for entry in RELEASES],
            "platform_timeline": self._timeline(items),
            "dependency_edges": self._edges(items, "dependency"),
            "impact_edges": self._edges(items, "impact"),
            "executive_health": self._executive_health(items),
            "coverage": self._coverage(items),
            "platform_metrics": self._platform_metrics(items),
            "statistics": self._statistics(items),
            "sprints": self._sprints(items),
        }

    def _with_contract(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {"contractVersion": CONTRACT_VERSION, **payload}

    def _edges(self, items: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
        known = {entry["id"] for entry in items}
        edges: list[dict[str, Any]] = []
        for entry in items:
            for dep in entry.get("dependencies", []):
                if dep not in known:
                    continue
                source, target = (dep, entry["id"]) if kind == "dependency" else (entry["id"], dep)
                edges.append(self._with_contract({"source": source, "target": target, "kind": kind, "impact": entry["impact"]}))
        return edges

    def _timeline(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        by_id = {entry["id"]: entry for entry in items}
        return [
            self._with_contract(
                {
                    "id": entry["id"],
                    "title": entry["title"],
                    "status": entry["status"],
                    "description": entry["summary"],
                    "dependencies": entry["dependencies"],
                    "engines": entry["engines"],
                    "apis": entry["apis"],
                    "documentation": entry["documentation"],
                }
            )
            for item_id in TIMELINE_ORDER
            if (entry := by_id.get(item_id))
        ]

    def _executive_health(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            self._gauge("runtime", "Runtime", self._tag_progress(items, {"backend", "engine", "generation"}), "Roadmap progress across backend runtime and generation engine items."),
            self._gauge("api", "API", self._api_coverage(items), "Percent of non-archived roadmap items with API evidence or no active API requirement."),
            self._gauge("frontend", "Frontend", self._tag_progress(items, {"frontend"}), "Roadmap progress for frontend-facing items."),
            self._gauge("contracts", "Contracts", self._contract_coverage(items), "Percent of non-archived items with contract evidence or no active contract requirement."),
            self._gauge("llm", "LLM", self._tag_progress(items, {"ia"}), "Roadmap progress for AI and LLM-related items."),
            self._gauge("security", "Seguranca", self._tag_progress(items, {"security"}), "Roadmap progress for security-tagged items."),
            self._gauge("laboratory", "Laboratorio", self._item_progress(items, "engineering_laboratory"), "Engineering Laboratory roadmap progress."),
            self._gauge("documentation", "Documentacao", self._documentation_coverage(items), "Documentation reference coverage in roadmap metadata."),
        ]

    def _coverage(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            self._gauge("backend", "Backend", self._tag_progress(items, {"backend"}), "Average progress for backend-tagged roadmap items."),
            self._gauge("frontend", "Frontend", self._tag_progress(items, {"frontend"}), "Average progress for frontend-tagged roadmap items."),
            self._gauge("api", "API", self._api_coverage(items), "API evidence coverage in roadmap metadata."),
            self._gauge("security", "Seguranca", self._tag_progress(items, {"security"}), "Average progress for security-tagged roadmap items."),
            self._gauge("tests", "Testes", self._tag_progress(items, {"tests", "quality"}), "Average progress for quality and test-related items."),
            self._gauge("documentation", "Documentacao", self._documentation_coverage(items), "Documentation reference coverage in roadmap metadata."),
            self._gauge("deploy", "Deploy", self._tag_progress(items, {"deploy", "devops", "cloud"}), "Average progress for deploy and DevOps items."),
            self._gauge("laboratory", "Laboratorio", self._item_progress(items, "engineering_laboratory"), "Engineering Laboratory item progress."),
            self._gauge("analytics", "Analytics", self._tag_progress(items, {"analytics", "monitoring"}), "Average progress for analytics and monitoring items."),
        ]

    def _platform_metrics(self, items: list[dict[str, Any]]) -> list[dict[str, str]]:
        active = self._active(items)
        progress = round(mean([entry["progress"] for entry in active])) if active else 0
        return [
            self._metric("platform", "Plataforma", f"{progress}%", "Average progress across non-archived roadmap items."),
            self._metric("projects", "Projetos", str(self._project_count()), "Count from the local project repository."),
            self._metric("engines", "Motores", str(len(self._active_engines())), "Backend engine files detected under apps/api/app/engines."),
            self._metric("agents", "Agentes", str(self._count_by_category(items, "agent")), "Agent items in the governed roadmap; runtime remains future."),
            self._metric("modules", "Modulos", str(self._count_by_category(items, "module")), "Roadmap items classified as modules."),
            self._metric("skills", "Skills", str(len(self._skills())), "Operational skills returned by the local skill registry."),
            self._metric("templates", "Templates", str(len(self._templates())), "Templates returned by the local template registry."),
            self._metric("architectures", "Arquiteturas", str(len([entry for entry in items if "architecture" in entry.get("tags", [])])), "Roadmap items tagged as architecture-related."),
        ]

    def _statistics(self, items: list[dict[str, Any]]) -> list[dict[str, str]]:
        return [
            self._metric("projects", "Projetos", str(self._project_count()), "Local project records."),
            self._metric("promptmasters", "PromptMasters", str(self._exists(items, "prompt_master")), "PromptMaster module presence in roadmap."),
            self._metric("blueprints", "Blueprints", str(self._exists(items, "blueprint")), "Blueprint module presence in roadmap."),
            self._metric("architectures", "Arquiteturas", str(len([entry for entry in items if entry["category"] == "architecture"])), "Architecture-classified roadmap items."),
            self._metric("deploys", "Deploys", str(self._exists(items, "deploy_center") + self._exists(items, "git_export")), "Deploy-related roadmap capabilities."),
            self._metric("documentations", "Documentacoes", str(sum(len(entry.get("documentation", [])) for entry in items)), "Documentation references recorded in roadmap items."),
            self._metric("auto_fixes", "Auto Fixes", "0", "No roadmap item exposes an autonomous auto-fix counter."),
            self._metric("laboratories", "Laboratorios", str(self._exists(items, "engineering_laboratory")), "Engineering Laboratory roadmap item presence."),
            self._metric("corrections", "Correcoes", "0", "No correction counter is exposed by the roadmap endpoint."),
            self._metric("validations", "Validacoes", str(len([entry for entry in items if "quality" in entry.get("tags", []) or "security" in entry.get("tags", [])])), "Quality and security validation items in roadmap metadata."),
        ]

    def _sprints(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        current = [entry for entry in items if entry["release"] == "v2.5" and entry["status"] in {"IN_PROGRESS", "IMPLEMENTED"}]
        next_items = [entry for entry in items if entry["release"] == "v3"]
        done = len([entry for entry in current if entry["status"] == "IMPLEMENTED"])
        progress = round(mean([entry["progress"] for entry in current])) if current else 0
        return [
            self._with_contract({"id": "current", "title": "Sprint Atual", "status": "ACTIVE", "progress": progress, "tasks": len(current), "completed": done, "in_progress": len(current) - done}),
            self._with_contract({"id": "next", "title": "Sprint Seguinte", "status": "PLANNED", "progress": 0, "tasks": len(next_items), "completed": 0, "in_progress": 0}),
        ]

    def _gauge(self, id: str, label: str, value: int, basis: str) -> dict[str, Any]:
        status = "healthy" if value >= 90 else "warning" if value >= 60 else "blocked"
        return self._with_contract({"id": id, "label": label, "value": value, "status": status, "basis": basis})

    def _metric(self, id: str, label: str, value: str, detail: str) -> dict[str, str]:
        return self._with_contract({"id": id, "label": label, "value": value, "detail": detail})

    def _active(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [entry for entry in items if entry["status"] != "ARCHIVED"]

    def _tag_progress(self, items: list[dict[str, Any]], tags: set[str]) -> int:
        selected = [entry for entry in self._active(items) if tags.intersection(set(entry.get("tags", [])) | {entry["category"]})]
        return round(mean([entry["progress"] for entry in selected])) if selected else 0

    def _item_progress(self, items: list[dict[str, Any]], id: str) -> int:
        entry = next((candidate for candidate in items if candidate["id"] == id), None)
        return int(entry["progress"]) if entry else 0

    def _api_coverage(self, items: list[dict[str, Any]]) -> int:
        active = self._active(items)
        covered = [entry for entry in active if entry.get("apis") or entry["status"] in {"PLANNED", "FUTURE"}]
        return round((len(covered) / len(active)) * 100) if active else 0

    def _contract_coverage(self, items: list[dict[str, Any]]) -> int:
        active = self._active(items)
        covered = [entry for entry in active if entry.get("contracts") or entry["status"] in {"PLANNED", "FUTURE"}]
        return round((len(covered) / len(active)) * 100) if active else 0

    def _documentation_coverage(self, items: list[dict[str, Any]]) -> int:
        active = self._active(items)
        covered = [entry for entry in active if entry.get("documentation")]
        return round((len(covered) / len(active)) * 100) if active else 0

    def _count_by_category(self, items: list[dict[str, Any]], category: str) -> int:
        return len([entry for entry in items if entry["category"] == category])

    def _exists(self, items: list[dict[str, Any]], id: str) -> int:
        return 1 if any(entry["id"] == id for entry in items) else 0

    def _active_engines(self) -> list[str]:
        engines_dir = Path(self.root) / "apps" / "api" / "app" / "engines"
        return sorted(path.stem for path in engines_dir.glob("*_engine.py") if path.is_file())

    def _skills(self) -> list[str]:
        try:
            return [entry["id"] for entry in SkillRegistryEngine().list_skills()]
        except Exception:
            return []

    def _templates(self) -> list[str]:
        try:
            return [entry["id"] for entry in TemplateRegistryEngine().list_templates()]
        except Exception:
            return []

    def _project_count(self) -> int:
        try:
            return len(ProjectRepository().list_projects())
        except Exception:
            return 0
