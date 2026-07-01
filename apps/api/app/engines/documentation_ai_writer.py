from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.data.foundation import CONTRACT_VERSION
from app.engines.documentation_engine import DocumentationEngine
from app.engines.llm.base import LLMError
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, ReasoningLevel
from app.services.ai_availability import ai_available
from app.services.generated_project_service import GeneratedProjectService

# (id, output path, doc kind label for the LLM/deterministic builders)
MIN_DOCS: list[tuple[str, str, str]] = [
    ("readme", "README.md", "project overview and quickstart"),
    ("architecture", "docs/ARCHITECTURE.md", "architecture: layers, modules, decisions, trade-offs"),
    ("api", "docs/API.md", "API: endpoints, auth, request/response examples, errors"),
    ("database", "docs/DATABASE.md", "database: entities, relationships, constraints, migrations"),
    ("security", "docs/SECURITY.md", "security: authn/z, secrets handling, OWASP, data protection"),
    ("testing", "docs/TESTING.md", "testing: unit/integration/e2e strategy, coverage, commands"),
    ("deployment", "docs/DEPLOYMENT.md", "deployment: environments, Docker, CI/CD, rollback, observability"),
    ("adr_0001", "docs/adr/0001-initial-architecture.md", "ADR: the initial architecture decision"),
]
_DOC_BY_ID = {doc_id: (path, kind) for doc_id, path, kind in MIN_DOCS}

DETERMINISTIC_BANNER = (
    "> _Preview determinístico — gerado a partir dos dados reais do projeto, sem IA._\n\n"
)

WRITER_SYSTEM_PROMPT = (
    "You are a senior staff software engineer writing the documentation a team will rely on to "
    "maintain this exact project for years. Write professional, specific Markdown grounded only in "
    "the provided project facts — never generic boilerplate. Justify the important decisions, include "
    "useful, concrete examples, and adapt to the project's stack and business domain. Absolute rules: "
    "never include real secrets, tokens, passwords or credentials; never reproduce a real .env; use "
    "obvious placeholders in examples. Return strictly JSON: {\"content\": \"<the full Markdown>\"}."
)

_CONTENT_SCHEMA = {
    "type": "object",
    "properties": {"content": {"type": "string"}},
    "required": ["content"],
    "additionalProperties": False,
}


class DocumentationAiWriter:
    """Generates the minimum documentation set from a project's real sources.

    When a real LLM is available it writes adapted, project-specific prose; otherwise
    it falls back to an honest deterministic builder (clearly labelled "Preview
    determinístico"), never disguising the fallback as AI. Generation is a preview —
    nothing is written until the user approves it via ``save``.
    """

    def __init__(
        self,
        *,
        router: LLMRouter | None = None,
        files_service: GeneratedProjectService | None = None,
        doc_engine: DocumentationEngine | None = None,
    ) -> None:
        self.router = router or LLMRouter()
        self.files = files_service or GeneratedProjectService()
        self.doc_engine = doc_engine or DocumentationEngine()

    # ------------------------------------------------------------------ generate

    def generate(
        self,
        project: dict[str, Any],
        *,
        doc_ids: list[str] | None = None,
        user_model_choice: str | None = None,
        api_key: str | None = None,
    ) -> dict[str, Any]:
        knowledge = self._knowledge(project)
        ai_active = bool(api_key) or ai_available()
        targets = [d for d in MIN_DOCS if not doc_ids or d[0] in set(doc_ids)]

        docs: list[dict[str, Any]] = []
        any_llm = False
        for doc_id, path, kind in targets:
            content, mode = self._write_doc(
                doc_id, kind, knowledge, ai_active, user_model_choice, api_key
            )
            content = self.doc_engine.sanitize(content)
            secret = self.doc_engine.scan_secret(content)
            issues = [secret] if secret else []
            any_llm = any_llm or mode == "llm"
            docs.append(
                {
                    "contractVersion": CONTRACT_VERSION,
                    "id": doc_id,
                    "title": Path(path).name,
                    "path": path,
                    "category": doc_id.split("_")[0],
                    "content": content,
                    "mode": mode,
                    "safe": secret is None,
                    "issues": issues,
                    "sources": knowledge["sources"],
                }
            )

        return {
            "contractVersion": CONTRACT_VERSION,
            "project_id": str(project["project_id"]),
            "ai_active": ai_active,
            "mode": "ai" if any_llm else "deterministic",
            "docs": docs,
        }

    # -------------------------------------------------------------------- save

    def save(
        self,
        project: dict[str, Any],
        items: list[dict[str, str]],
        *,
        overwrite: bool = False,
    ) -> dict[str, Any]:
        root = self.doc_engine._project_root(project)  # reuse workspace/containment guards
        results: list[dict[str, Any]] = []
        blocked = False

        for item in items:
            doc_id = str(item.get("id") or "")
            entry = _DOC_BY_ID.get(doc_id)
            if entry is None:
                continue
            path, _kind = entry
            content = self.doc_engine.sanitize(str(item.get("content") or ""))
            target = self.doc_engine._resolve_inside(root, path)

            if self.doc_engine.scan_secret(content) is not None:
                blocked = True
                results.append(self._save_result(doc_id, path, written=False, skipped=False, blocked=True,
                                                  reason="Document still contains a secret-like value after sanitization."))
                continue
            if target.exists() and not overwrite:
                results.append(self._save_result(doc_id, path, written=False, skipped=True, blocked=False,
                                                  reason="File already exists; confirm overwrite to replace it."))
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            results.append(self._save_result(doc_id, path, written=True, skipped=False, blocked=False, reason=None))

        score = self.doc_engine.analyze(project)["score"]
        return {
            "contractVersion": CONTRACT_VERSION,
            "project_id": str(project["project_id"]),
            "saved": results,
            "score": score,
            "blocked": blocked,
        }

    def _save_result(self, doc_id, path, *, written, skipped, blocked, reason) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "id": doc_id,
            "path": path,
            "written": written,
            "skipped": skipped,
            "blocked": blocked,
            "reason": reason,
        }

    # ---------------------------------------------------------------- writing

    def _write_doc(
        self,
        doc_id: str,
        kind: str,
        knowledge: dict[str, Any],
        ai_active: bool,
        user_model_choice: str | None,
        api_key: str | None,
    ) -> tuple[str, str]:
        if ai_active:
            try:
                response = self.router.route(
                    LLMRequest(
                        system=WRITER_SYSTEM_PROMPT,
                        user=self._user_prompt(kind, knowledge),
                        reasoning=ReasoningLevel.high,
                        max_output_tokens=6_000,
                        json_schema=_CONTENT_SCHEMA,
                        cache_prefix=True,
                    ),
                    user_choice=user_model_choice,
                    agent_role="documentation",
                    api_key=api_key,
                )
                # The mock fallback returns generic text, not real documentation, so a
                # fallback run is treated as deterministic — never surfaced as "AI".
                if not response.served_by_fallback:
                    payload = response.parsed if response.parsed is not None else json.loads(response.text)
                    content = str((payload or {}).get("content") or "").strip()
                    if content:
                        return content, "llm"
            except (LLMError, json.JSONDecodeError, ValueError):
                pass
        return DETERMINISTIC_BANNER + self._deterministic(doc_id, knowledge), "deterministic"

    def _user_prompt(self, kind: str, knowledge: dict[str, Any]) -> str:
        return (
            f"Write the {kind} document for this project as professional Markdown.\n\n"
            f"PROJECT FACTS (JSON):\n{json.dumps(knowledge, ensure_ascii=False, indent=2)}"
        )

    # -------------------------------------------------------------- knowledge

    def _knowledge(self, project: dict[str, Any]) -> dict[str, Any]:
        blueprint = project.get("blueprint_snapshot") or {}
        req = blueprint.get("project_requirements") or {}
        tg = project.get("technology_graph") or blueprint.get("technology_graph") or {}
        arch = blueprint.get("architecture_profile") or {}
        archetype = blueprint.get("archetype_profile") or {}
        sources: list[str] = []
        files: list[str] = []
        try:
            listing = self.files.list_files(project)
            files = [str(f["relative_path"]) for f in listing.get("files", [])][:60]
            if files:
                sources.append("generated project files")
        except HTTPException:
            files = []

        if blueprint:
            sources.append("Blueprint")
        if project.get("prompt_master_snapshot"):
            sources.append("PromptMaster")
        if project.get("architectural_graph_snapshot"):
            sources.append("Architecture Review")

        def _node(name: str) -> str:
            node = tg.get(name) or {}
            return str(node.get("name") or node.get("id") or "")

        return {
            "project_name": str(project.get("project_name") or project["project_id"]),
            "summary": req.get("project_goal") or "",
            "business_context": req.get("business_context") or "",
            "target_users": req.get("target_users") or [],
            "business_rules": req.get("business_rules") or [],
            "entities": req.get("entities") or [],
            "workflows": req.get("workflows") or [],
            "constraints": req.get("constraints") or [],
            "stack": {
                "language": _node("language"),
                "runtime": _node("runtime"),
                "framework": _node("framework"),
                "architecture": _node("architecture"),
            },
            "architecture_profile": {
                "architecture_id": arch.get("architecture_id") or "",
                "complexity_level": arch.get("complexity_level") or "",
                "recommended_patterns": arch.get("recommended_patterns") or [],
                "required_infrastructure": arch.get("required_infrastructure") or [],
            },
            "archetype": archetype.get("name") or "",
            "capabilities": [
                {"name": c.get("name"), "security_impact": c.get("security_impact")}
                for c in (blueprint.get("capabilities") or [])
            ],
            "business_modules": [m.get("name") for m in (blueprint.get("business_modules") or [])],
            "endpoints": [
                {
                    "method": e.get("method"),
                    "path": e.get("path"),
                    "description": e.get("description"),
                    "security_level": e.get("security_level"),
                }
                for e in (blueprint.get("endpoints") or [])
            ],
            "files": files,
            "sources": sources or ["project record"],
        }

    # --------------------------------------------------------- deterministic

    def _deterministic(self, doc_id: str, k: dict[str, Any]) -> str:
        builder = getattr(self, f"_det_{doc_id}", None)
        if builder is None:
            builder = self._det_generic
        return builder(k)

    def _det_readme(self, k: dict[str, Any]) -> str:
        stack = k["stack"]
        lines = [
            f"# {k['project_name']}",
            "",
            k["summary"] or "Service generated by LDCN OS.",
            "",
            "## Stack",
            self._bullets(
                [
                    f"Language: {stack['language']}" if stack["language"] else None,
                    f"Framework: {stack['framework']}" if stack["framework"] else None,
                    f"Architecture: {stack['architecture']}" if stack["architecture"] else None,
                ]
            ),
            "## Capabilities",
            self._bullets([c["name"] for c in k["capabilities"]]) or "_None selected._",
            "## Documentation",
            "See `docs/` for ARCHITECTURE, API, DATABASE, SECURITY, TESTING and DEPLOYMENT.",
            "",
            "## Configuration",
            "Copy `.env.example` to `.env` and fill in local values. Never commit real secrets.",
        ]
        return "\n".join(lines)

    def _det_architecture(self, k: dict[str, Any]) -> str:
        ap = k["architecture_profile"]
        return "\n".join(
            [
                "# Architecture",
                "",
                f"**Architecture:** {ap['architecture_id'] or k['stack']['architecture'] or 'n/a'}  ",
                f"**Complexity:** {ap['complexity_level'] or 'n/a'}  ",
                f"**Archetype:** {k['archetype'] or 'n/a'}",
                "",
                "## Modules",
                self._bullets(k["business_modules"]) or "_No business modules recorded._",
                "## Recommended patterns",
                self._bullets(ap["recommended_patterns"]) or "_None recorded._",
                "## Required infrastructure",
                self._bullets(ap["required_infrastructure"]) or "_None recorded._",
                "## Key workflows",
                self._bullets(k["workflows"]) or "_None recorded._",
            ]
        )

    def _det_api(self, k: dict[str, Any]) -> str:
        if k["endpoints"]:
            rows = ["| Method | Path | Security | Description |", "| --- | --- | --- | --- |"]
            for e in k["endpoints"]:
                rows.append(
                    f"| {e.get('method') or ''} | `{e.get('path') or ''}` | {e.get('security_level') or ''} | {e.get('description') or ''} |"
                )
            table = "\n".join(rows)
        else:
            table = "_No endpoints recorded in the blueprint._"
        return "\n".join(
            [
                "# API",
                "",
                f"Framework: {k['stack']['framework'] or 'n/a'}.",
                "",
                "## Endpoints",
                table,
                "",
                "## Authentication",
                "Endpoints marked as protected require an authenticated request. Send credentials "
                "via the `Authorization` header; never embed secrets in the URL.",
                "",
                "## Errors",
                "Errors are returned as a JSON envelope with a stable `code` and a human `message`.",
            ]
        )

    def _det_database(self, k: dict[str, Any]) -> str:
        return "\n".join(
            [
                "# Database",
                "",
                "## Entities",
                self._bullets(k["entities"]) or "_No entities recorded._",
                "## Constraints & integrity",
                "Primary keys, foreign keys and unique constraints enforce integrity at the database "
                "layer. Apply migrations before starting the service.",
                "## Infrastructure",
                self._bullets(k["architecture_profile"]["required_infrastructure"]) or "_None recorded._",
            ]
        )

    def _det_security(self, k: dict[str, Any]) -> str:
        caps = [f"{c['name']} — {c['security_impact']}" for c in k["capabilities"] if c.get("security_impact")]
        return "\n".join(
            [
                "# Security",
                "",
                "## Secrets handling",
                "All secrets live in environment variables and are provided through `.env` (never "
                "committed). Examples in this repository use placeholders only.",
                "## Access control",
                self._bullets([f"User type: {u}" for u in k["target_users"]]) or "_No roles recorded._",
                "## Capability security impact",
                self._bullets(caps) or "_No security-impacting capabilities recorded._",
                "## Constraints",
                self._bullets(k["constraints"]) or "_None recorded._",
            ]
        )

    def _det_testing(self, k: dict[str, Any]) -> str:
        test_files = [f for f in k["files"] if "test" in f.lower()]
        return "\n".join(
            [
                "# Testing",
                "",
                "## Strategy",
                "Cover the service and persistence layers with unit and integration tests; add "
                "end-to-end checks for the critical workflows.",
                "## Detected test files",
                self._bullets(test_files[:20]) or "_No test files detected yet._",
                "## Workflows to cover",
                self._bullets(k["workflows"]) or "_None recorded._",
            ]
        )

    def _det_deployment(self, k: dict[str, Any]) -> str:
        has_docker = any("dockerfile" in f.lower() or "docker-compose" in f.lower() for f in k["files"])
        return "\n".join(
            [
                "# Deployment",
                "",
                "## Environments",
                "Configure each environment through environment variables; keep production secrets in a "
                "secret manager, never in the repository.",
                "## Containers",
                "A Docker/Compose setup is present in this project." if has_docker else "No container files were detected; deploy as a managed process behind a reverse proxy.",
                "## Rollback",
                "Roll back by redeploying the previous released artifact; database migrations must be "
                "backward compatible.",
            ]
        )

    def _det_adr_0001(self, k: dict[str, Any]) -> str:
        ap = k["architecture_profile"]
        return "\n".join(
            [
                "# 0001 — Initial architecture",
                "",
                f"- **Status:** Accepted",
                f"- **Date:** {date.today().isoformat()}",
                "",
                "## Context",
                k["business_context"] or k["summary"] or "Initial architecture for the generated project.",
                "",
                "## Decision",
                f"Adopt **{ap['architecture_id'] or k['stack']['architecture'] or 'the selected architecture'}** "
                f"on {k['stack']['framework'] or 'the chosen framework'} "
                f"({k['stack']['language'] or 'the chosen language'}).",
                "",
                "## Alternatives considered",
                self._bullets(ap["recommended_patterns"]) or "_Alternatives were not explicitly recorded._",
                "",
                "## Consequences",
                "The team commits to the patterns and infrastructure above; revisiting this decision "
                "requires a follow-up ADR.",
            ]
        )

    def _det_generic(self, k: dict[str, Any]) -> str:
        return f"# {k['project_name']}\n\n{k['summary'] or 'Generated documentation.'}"

    def _bullets(self, items: Any) -> str:
        values = [str(item) for item in (items or []) if item]
        return "\n".join(f"- {value}" for value in values)
