from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import BASE_DIR
from app.data.foundation import CONTRACT_VERSION

SAFE_TEMPLATE_ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")

TEMPLATE_PROFILES: dict[str, dict[str, Any]] = {
    "landing-page": {
        "version": "1.0.0",
        "category": "marketing",
        "supported_languages": ["typescript"],
        "supported_frameworks": ["nextjs"],
        "supported_architectures": ["modular_monolith"],
        "supported_archetypes": ["landing_page", "sales_page", "institutional_site"],
        "complexity": "medium",
        "maturity": "stable",
        "preview_images": ["/templates/landing-page/preview.png"],
        "tags": ["landing", "seo", "static", "nextjs"],
        "changelog": [
            {"version": "1.0.0", "date": "2026-06-02", "changes": ["Initial deterministic Next.js landing page template."]},
        ],
    },
    "portfolio": {
        "version": "1.0.0",
        "category": "portfolio",
        "supported_languages": ["javascript", "typescript"],
        "supported_frameworks": ["react"],
        "supported_architectures": ["modular_monolith", "static_site"],
        "supported_archetypes": ["portfolio"],
        "complexity": "low",
        "maturity": "stable",
        "preview_images": ["/templates/portfolio/preview.png"],
        "tags": ["portfolio", "showcase", "static", "react"],
        "changelog": [
            {"version": "1.0.0", "date": "2026-06-02", "changes": ["Initial deterministic React portfolio template."]},
        ],
    },
    "docs-site": {
        "version": "1.0.0",
        "category": "documentation",
        "supported_languages": ["html", "javascript"],
        "supported_frameworks": ["vanilla", "static_site"],
        "supported_architectures": ["static_site", "modular_monolith"],
        "supported_archetypes": ["documentation_site", "blog"],
        "complexity": "low",
        "maturity": "mature",
        "preview_images": ["/templates/docs-site/preview.png"],
        "tags": ["docs", "search", "static", "html"],
        "changelog": [
            {"version": "1.0.0", "date": "2026-06-02", "changes": ["Initial deterministic documentation site template."]},
        ],
    },
    "static-site": {
        "version": "1.0.0",
        "category": "static",
        "supported_languages": ["html", "javascript", "typescript"],
        "supported_frameworks": ["vanilla", "static_site"],
        "supported_architectures": ["static_site", "modular_monolith"],
        "supported_archetypes": ["institutional_site", "sales_page", "blog"],
        "complexity": "low",
        "maturity": "mature",
        "preview_images": ["/templates/static-site/preview.png"],
        "tags": ["static", "html", "css", "starter"],
        "changelog": [
            {"version": "1.0.0", "date": "2026-06-02", "changes": ["Initial deterministic vanilla static site template."]},
        ],
    },
}


class TemplateRegistryEngine:
    def __init__(self, templates_root: Path | None = None) -> None:
        self.templates_root = templates_root or BASE_DIR.parents[1] / "templates"

    def list_templates(self) -> list[dict[str, Any]]:
        root = self.templates_root.resolve()
        if not root.is_dir():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template registry root was not found.")

        templates = []
        for manifest_path in sorted(root.glob("*/manifest.json")):
            templates.append(self._marketplace_item(manifest_path))
        if not templates:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No local templates were found.")
        return templates

    def get_template(self, template_id: str) -> dict[str, Any]:
        if not SAFE_TEMPLATE_ID.fullmatch(template_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template '{template_id}' was not found.")
        manifest_path = (self.templates_root / template_id / "manifest.json").resolve()
        root = self.templates_root.resolve()
        if root not in manifest_path.parents or not manifest_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template '{template_id}' was not found.")
        return self._marketplace_item(manifest_path)

    def categories(self) -> list[str]:
        return sorted({item["category"] for item in self.list_templates()})

    def _marketplace_item(self, manifest_path: Path) -> dict[str, Any]:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        template_id = str(manifest["id"])
        profile = TEMPLATE_PROFILES.get(template_id, {})
        capabilities = sorted(set(manifest.get("supported_capabilities") or []) | set(profile.get("capabilities") or []))
        return {
            "contractVersion": CONTRACT_VERSION,
            "id": template_id,
            "name": manifest["name"],
            "description": manifest["description"],
            "version": profile.get("version", "1.0.0"),
            "category": profile.get("category", manifest.get("metadata", {}).get("mode", "static")),
            "supported_languages": profile.get("supported_languages", ["typescript"]),
            "supported_frameworks": profile.get("supported_frameworks", [manifest.get("metadata", {}).get("framework", "vanilla")]),
            "supported_architectures": profile.get("supported_architectures", ["modular_monolith"]),
            "supported_archetypes": profile.get("supported_archetypes", []),
            "capabilities": capabilities,
            "complexity": profile.get("complexity", "low"),
            "maturity": profile.get("maturity", "stable"),
            "preview_images": profile.get("preview_images", []),
            "tags": sorted(set(profile.get("tags", [])) | set(capabilities)),
            "changelog": profile.get("changelog", []),
        }
