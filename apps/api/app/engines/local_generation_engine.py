from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.core.config import BASE_DIR
from app.data.foundation import CONTRACT_VERSION
from app.engines.generation_handoff_engine import build_generation_handoff_package
from app.services.template_render_service import TemplateRenderService
from app.services.localization_service import LocalizationService

ALLOWED_ARCHETYPES = {
    "landing_page": "landing-page",
    "portfolio": "portfolio",
    "documentation_site": "docs-site",
}
STATIC_STACK_TEMPLATE = "static-site"
BLOCKED_ARCHITECTURES = {"microservices", "event_driven", "cqrs", "distributed_system"}
BLOCKED_CAPABILITIES = {"ai_chat", "rag", "queue", "websocket", "realtime", "kubernetes", "docker", "ci_cd"}
SAFE_PATH_PATTERN = re.compile(r"^[a-zA-Z0-9._/\\: -]+$")


class LocalGenerationEngine:
    def __init__(self, template_service: TemplateRenderService | None = None) -> None:
        self.template_service = template_service or TemplateRenderService()
        self.workspace_root = BASE_DIR.parents[1].resolve()

    def run(self, project: dict[str, Any], output_path: str) -> dict[str, Any]:
        trace: list[dict[str, Any]] = []
        failures: list[dict[str, Any]] = []
        generation_id = f"localgen_{uuid4().hex[:12]}"
        target = self._resolve_output_path(output_path)
        if target.exists():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Output path already exists. Local generation will not overwrite an existing directory.",
            )

        self._trace(trace, "handoff_validation", "started", "Validating generation readiness handoff.")
        handoff = build_generation_handoff_package(project)
        if handoff["handoff_readiness"] != "ready":
            self._trace(trace, "handoff_validation", "blocked", "Generation blocked because handoff is not ready.")
            failures.append(self._failure("invalid_handoff", "Project handoff is not ready for local generation.", [project["project_id"]]))
            return self._blocked_result(generation_id, project, output_path, handoff, trace, failures)
        self._trace(trace, "handoff_validation", "completed", "Handoff readiness is ready.")

        template_id = self._resolve_template_id(project)
        if template_id is None:
            self._trace(trace, "template_resolution", "blocked", "Generation blocked by unsupported architecture or archetype.")
            failures.append(self._failure("unsupported_archetype", "Local generation V0 only supports static site, landing page, portfolio, and documentation site foundations.", [project.get("archetype_id", "")]))
            return self._blocked_result(generation_id, project, output_path, handoff, trace, failures)

        policy_failure = self._validate_static_policy(project)
        if policy_failure is not None:
            self._trace(trace, "static_policy", "blocked", policy_failure["message"])
            failures.append(policy_failure)
            return self._blocked_result(generation_id, project, output_path, handoff, trace, failures, template_id=template_id)

        self._trace(trace, "template_resolution", "started", f"Loading template '{template_id}'.")
        manifest = self.template_service.load_template(template_id)
        variables = self._variables(project, handoff, manifest)
        rendered_files = self.template_service.render_template(template_id, variables)
        self._trace(trace, "template_resolution", "completed", f"Template '{template_id}' resolved with {len(rendered_files)} files.")

        self._trace(trace, "filesystem_generation", "started", "Creating local filesystem snapshot.")
        artifacts = self._write_files(target, rendered_files, manifest, variables)
        file_map = self._file_map(target)
        self._trace(trace, "filesystem_generation", "completed", f"Filesystem snapshot generated at {target}.")

        return {
            "contractVersion": CONTRACT_VERSION,
            "generation_id": generation_id,
            "project_id": project["project_id"],
            "project_name": project["project_name"],
            "status": "generated",
            "runtime": "local_static_v0",
            "template_id": template_id,
            "template_name": manifest.get("name"),
            "output_path": str(target),
            "handoff_readiness": handoff["handoff_readiness"],
            "artifacts": artifacts,
            "file_map": file_map,
            "trace": trace,
            "failures": [],
            "metadata": self._metadata(manifest),
        }

    def _resolve_template_id(self, project: dict[str, Any]) -> str | None:
        archetype_id = str(project.get("archetype_id") or "")
        framework_id = ((project.get("technology_graph") or {}).get("framework") or {}).get("id")
        if archetype_id in ALLOWED_ARCHETYPES:
            return ALLOWED_ARCHETYPES[archetype_id]
        if framework_id == "static_site" and archetype_id in {"institutional_site", "sales_page", "blog"}:
            return STATIC_STACK_TEMPLATE
        return None

    def _validate_static_policy(self, project: dict[str, Any]) -> dict[str, Any] | None:
        architecture_id = str(project.get("architecture_id") or "")
        capability_ids = set(str(item) for item in project.get("selected_capabilities") or [])
        infrastructure_ids = set(((project.get("blueprint_snapshot") or {}).get("infrastructure_profile") or {}).get("selected_component_ids") or [])
        blocked = sorted((capability_ids | infrastructure_ids) & BLOCKED_CAPABILITIES)
        if architecture_id in BLOCKED_ARCHITECTURES:
            return self._failure("unsupported_architecture", "Generation blocked by unsupported architecture.", [architecture_id])
        if blocked:
            return self._failure("unsupported_capability", "Local generation V0 blocks AI, RAG, queues, websocket, kubernetes and distributed infrastructure.", blocked)
        return None

    def _resolve_output_path(self, output_path: str) -> Path:
        if not output_path.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="output_path is required.")
        if "\x00" in output_path or not SAFE_PATH_PATTERN.match(output_path):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid output path.")
        candidate = Path(output_path)
        if any(part == ".." for part in candidate.parts):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path traversal is not allowed.")
        resolved = (candidate if candidate.is_absolute() else self.workspace_root / candidate).resolve()
        if not candidate.is_absolute():
            cwd_resolved = candidate.resolve()
            if cwd_resolved.exists() and cwd_resolved != resolved:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Output path already exists. Local generation will not overwrite an existing directory.",
                )
        if self.workspace_root not in resolved.parents and resolved != self.workspace_root:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Output path must stay inside the LDCN OS workspace.")
        return resolved

    def _variables(self, project: dict[str, Any], handoff: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
        blueprint = project.get("blueprint_snapshot") or {}
        tech = project.get("technology_graph") or {}
        capabilities = project.get("selected_capabilities") or []
        modules = project.get("selected_business_modules") or []
        endpoints = project.get("selected_endpoints") or []
        locale_profile = project.get("locale_profile") or blueprint.get("locale_profile") or {}
        selected_locale = locale_profile.get("selected_locale") or project.get("locale") or "pt-BR"
        fallback_locale = locale_profile.get("fallback_locale") or "pt-BR"
        translations = LocalizationService().dictionary(selected_locale, fallback_locale)["entries"]
        requirements = blueprint.get("project_requirements") or {}
        return {
            "project": {
                "id": project["project_id"],
                "name": project["project_name"],
                "slug": self._slug(project["project_name"]),
                "locale": selected_locale,
                "archetype": project.get("archetype_id") or "",
                "architecture": project.get("architecture_id") or "",
                "language": (tech.get("language") or {}).get("name") or "",
                "framework": (tech.get("framework") or {}).get("name") or "",
                "summary": translations["generation.summary"].replace("{{project}}", project["project_name"]),
            },
            "template": {
                "id": manifest.get("id") or "",
                "name": manifest.get("name") or "",
                "description": manifest.get("description") or "",
            },
            "scope": {
                "capabilities": ", ".join(capabilities) or "static content",
                "modules": ", ".join(modules) or "content",
                "endpoints": ", ".join(endpoints) or "none",
                "capability_list": "\n".join(f"- {item}" for item in capabilities) or "- static content",
                "module_list": "\n".join(f"- {item}" for item in modules) or "- content",
                "endpoint_list": "\n".join(f"- {item}" for item in endpoints) or "- none",
            },
            "requirements": {
                "project_goal": requirements.get("project_goal") or "Not provided",
                "business_context": requirements.get("business_context") or "Not provided",
                "target_users": ", ".join(requirements.get("target_users") or []) or "Not provided",
                "business_rule_list": "\n".join(f"- {item}" for item in requirements.get("business_rules") or []) or "- Not provided",
                "entity_list": "\n".join(f"- {item}" for item in requirements.get("entities") or []) or "- Not provided",
                "workflow_list": "\n".join(f"- {item}" for item in requirements.get("workflows") or []) or "- Not provided",
                "constraint_list": "\n".join(f"- {item}" for item in requirements.get("constraints") or []) or "- Not provided",
                "delivery_target": requirements.get("delivery_target") or "Not provided",
            },
            "blueprint": {
                "generated_at": blueprint.get("generated_at") or "",
                "risk": ((blueprint.get("complexity_profile") or {}).get("risk_level")) or "low",
                "score": ((blueprint.get("complexity_profile") or {}).get("overall_score")) or 0,
            },
            "handoff": {
                "id": handoff["handoff_id"],
                "readiness": handoff["handoff_readiness"],
            },
            "i18n": translations,
            "locale_profile": {
                "selected_locale": selected_locale,
                "fallback_locale": fallback_locale,
                "generated_docs_locale": locale_profile.get("generated_docs_locale") or selected_locale,
                "generated_readme_locale": locale_profile.get("generated_readme_locale") or selected_locale,
                "generated_comments_locale": locale_profile.get("generated_comments_locale") or selected_locale,
            },
        }

    def _write_files(self, target: Path, files: list[dict[str, str]], manifest: dict[str, Any], variables: dict[str, Any]) -> list[dict[str, Any]]:
        target.mkdir(parents=True, exist_ok=False)
        artifacts: list[dict[str, Any]] = []
        for item in files:
            relative = self._safe_relative_path(item["relative_path"])
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            content = item["content"]
            destination.write_text(content, encoding="utf-8", newline="\n")
            artifacts.append(self._artifact("file", relative.as_posix(), destination))

        metadata_path = target / ".ldcn-generation.json"
        metadata_path.write_text(
            json.dumps(
                {
                    "contractVersion": CONTRACT_VERSION,
                    "runtime": "local_static_v0",
                    "template": self._metadata(manifest),
                    "project": variables["project"],
                    "locale_profile": variables["locale_profile"],
                    "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
                    "offline_first": True,
                    "no_ai": True,
                    "no_agents": True,
                },
                ensure_ascii=True,
                indent=2,
                sort_keys=True,
            ),
            encoding="utf-8",
            newline="\n",
        )
        artifacts.append(self._artifact("metadata", ".ldcn-generation.json", metadata_path))
        return artifacts

    def _file_map(self, target: Path) -> dict[str, Any]:
        files = []
        directories = []
        for item in sorted(target.rglob("*")):
            relative = item.relative_to(target).as_posix()
            if item.is_dir():
                directories.append(relative)
            elif item.is_file():
                files.append(
                    {
                        "relative_path": relative,
                        "size_bytes": item.stat().st_size,
                        "checksum": self._checksum(item),
                    }
                )
        return {"contractVersion": CONTRACT_VERSION, "root_path": str(target), "files": files, "directories": directories}

    def _blocked_result(
        self,
        generation_id: str,
        project: dict[str, Any],
        output_path: str,
        handoff: dict[str, Any],
        trace: list[dict[str, Any]],
        failures: list[dict[str, Any]],
        *,
        template_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "generation_id": generation_id,
            "project_id": project["project_id"],
            "project_name": project["project_name"],
            "status": "blocked",
            "runtime": "local_static_v0",
            "template_id": template_id,
            "template_name": None,
            "output_path": output_path,
            "handoff_readiness": handoff["handoff_readiness"],
            "artifacts": [],
            "file_map": {"contractVersion": CONTRACT_VERSION, "root_path": output_path, "files": [], "directories": []},
            "trace": trace,
            "failures": failures,
            "metadata": {"no_code_written": True, "no_ai": True, "no_agents": True, "offline_first": True},
        }

    def _safe_relative_path(self, value: str) -> Path:
        path = Path(value)
        if path.is_absolute() or any(part == ".." for part in path.parts):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template attempted to write outside the output directory.")
        return path

    def _trace(self, trace: list[dict[str, Any]], step: str, trace_status: str, message: str) -> None:
        trace.append(
            {
                "contractVersion": CONTRACT_VERSION,
                "timestamp": datetime.now(UTC).replace(microsecond=0).isoformat(),
                "step": step,
                "status": trace_status,
                "message": message,
                "safe": True,
            }
        )

    def _failure(self, code: str, message: str, related_ids: list[str]) -> dict[str, Any]:
        return {"contractVersion": CONTRACT_VERSION, "code": code, "message": message, "recoverable": True, "related_ids": related_ids}

    def _artifact(self, kind: str, relative_path: str, path: Path) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "id": f"artifact_{hashlib.sha256(relative_path.encode('utf-8')).hexdigest()[:12]}",
            "kind": kind,
            "relative_path": relative_path,
            "size_bytes": path.stat().st_size,
            "checksum": self._checksum(path),
        }

    def _checksum(self, path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def _metadata(self, manifest: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": manifest.get("id"),
            "name": manifest.get("name"),
            "runtime": "local_static_v0",
            "deterministic": True,
            "offline_first": True,
            "supported_capabilities": manifest.get("supported_capabilities") or [],
        }

    def _slug(self, value: str) -> str:
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
        return slug or "ldcn-project"
