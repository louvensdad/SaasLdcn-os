from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import BASE_DIR

PLACEHOLDER_PATTERN = re.compile(r"{{\s*([a-zA-Z0-9_.-]+)\s*}}")


class TemplateRenderService:
    def __init__(self, templates_root: Path | None = None) -> None:
        self.templates_root = templates_root or BASE_DIR.parents[1] / "templates"

    def load_template(self, template_id: str) -> dict[str, Any]:
        template_dir = self._template_dir(template_id)
        manifest_path = template_dir / "manifest.json"
        if not manifest_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Template '{template_id}' manifest was not found.",
            )
        return json.loads(manifest_path.read_text(encoding="utf-8"))

    def render_template(self, template_id: str, variables: dict[str, Any]) -> list[dict[str, str]]:
        template_dir = self._template_dir(template_id)
        files_root = template_dir / "files"
        if not files_root.is_dir():
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Template '{template_id}' file templates were not found.",
            )

        rendered: list[dict[str, str]] = []
        for source in sorted(item for item in files_root.rglob("*") if item.is_file()):
            relative = source.relative_to(files_root).as_posix()
            target = relative[:-5] if relative.endswith(".tmpl") else relative
            content = source.read_text(encoding="utf-8")
            rendered.append(
                {
                    "relative_path": self.render_string(target, variables),
                    "content": self.render_string(content, variables),
                }
            )
        return rendered

    def render_string(self, value: str, variables: dict[str, Any]) -> str:
        def replace(match: re.Match[str]) -> str:
            key = match.group(1)
            current: Any = variables
            for part in key.split("."):
                if not isinstance(current, dict) or part not in current:
                    return ""
                current = current[part]
            if isinstance(current, list):
                return "\n".join(str(item) for item in current)
            return str(current)

        return PLACEHOLDER_PATTERN.sub(replace, value)

    def _template_dir(self, template_id: str) -> Path:
        if not template_id or "/" in template_id or "\\" in template_id or ".." in template_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid template id.")
        template_dir = (self.templates_root / template_id).resolve()
        root = self.templates_root.resolve()
        if root not in template_dir.parents and template_dir != root:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Template path traversal is not allowed.")
        return template_dir
