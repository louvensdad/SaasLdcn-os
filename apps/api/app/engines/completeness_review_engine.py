from __future__ import annotations

import json
from pathlib import PurePosixPath
from typing import Any

from app.engines.agent_prompts import REVIEWER_SYSTEM_PROMPT
from app.engines.llm.router import LLMRouter
from app.schemas.completeness import CompletenessReport
from app.schemas.llm import LLMRequest, ReasoningLevel
from app.schemas.orchestrator import ProjectSpec
from app.services.generated_project_service import GeneratedProjectService

MAX_FILE_CHARS = 12_000
MAX_TOTAL_CHARS = 60_000
KEY_FILENAMES = {
    "openapi.yaml",
    "openapi.yml",
    "openapi.json",
    "readme.md",
    "architecture.md",
    "traceability.md",
    "security_review.md",
    "package.json",
    "pom.xml",
    "requirements.txt",
    "pyproject.toml",
    "docker-compose.yml",
}


class CompletenessReviewEngine:
    def __init__(
        self,
        *,
        router: LLMRouter | None = None,
        files_service: GeneratedProjectService | None = None,
    ) -> None:
        self.router = router or LLMRouter()
        self.files_service = files_service or GeneratedProjectService()

    def review(
        self,
        spec: ProjectSpec,
        project: dict[str, Any],
        *,
        user_model_choice: str | None = None,
        api_key: str | None = None,
    ) -> CompletenessReport:
        project_id = str(project["project_id"])
        prompt = self._build_prompt(spec, project)
        response = self.router.route(
            LLMRequest(
                system=REVIEWER_SYSTEM_PROMPT,
                user=prompt,
                reasoning=ReasoningLevel.high,
                cache_prefix=True,
                max_output_tokens=12_000,
                timeout_ms=300_000,
                json_schema=CompletenessReport.model_json_schema(),
            ),
            user_choice=user_model_choice,
            agent_role="reviewer",
            api_key=api_key,
            project_id=project_id,
        )
        payload = response.parsed if response.parsed is not None else json.loads(response.text)
        if not isinstance(payload, dict):
            raise ValueError("Completeness reviewer returned a non-object payload.")
        payload["project_id"] = str(payload.get("project_id") or project_id)
        payload["degraded"] = bool(payload.get("degraded")) or response.served_by_fallback
        return CompletenessReport.model_validate(payload)

    def _build_prompt(self, spec: ProjectSpec, project: dict[str, Any]) -> str:
        listing = self.files_service.list_files(project)
        files = [
            str(item["relative_path"])
            for item in listing.get("files", [])
            if item.get("relative_path") != ".ldcn-generation.json"
        ]
        snippets = self._read_key_snippets(project, files)
        payload = {
            "project_id": project["project_id"],
            "spec": {
                "product_summary": spec.product_summary,
                "business_rules": spec.business_rules,
                "core_workflows": spec.core_workflows,
                "entities": spec.entities,
                "target_users": spec.target_users,
                "non_functional": spec.non_functional,
                "suggested_stack": spec.suggested_stack.model_dump(),
            },
            "generated_paths": files,
            "key_file_snippets": snippets,
        }
        return json.dumps(payload, ensure_ascii=False, indent=2)

    def _read_key_snippets(self, project: dict[str, Any], paths: list[str]) -> list[dict[str, str]]:
        selected = [path for path in paths if self._is_key_file(path)]
        snippets: list[dict[str, str]] = []
        total = 0
        for path in selected:
            if total >= MAX_TOTAL_CHARS:
                break
            try:
                file_data = self.files_service.read_file(project, path)
            except Exception:
                continue
            content = file_data.get("content")
            if not isinstance(content, str) or not content:
                continue
            remaining = MAX_TOTAL_CHARS - total
            text = content[: min(MAX_FILE_CHARS, remaining)]
            total += len(text)
            snippets.append({"path": path, "content": text})
        return snippets

    def _is_key_file(self, path: str) -> bool:
        posix = PurePosixPath(path)
        name = posix.name.lower()
        if name in KEY_FILENAMES:
            return True
        return name.startswith("openapi.") or path.lower().endswith("/traceability.md")
