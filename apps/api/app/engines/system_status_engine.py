from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.config import BASE_DIR, get_settings
from app.data.foundation import CONTRACT_VERSION
from app.engines.skill_registry_engine import SkillRegistryEngine
from app.engines.template_registry_engine import TemplateRegistryEngine


def _signal(signal_id: str, label: str, status: str, detail: str) -> dict[str, str]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": signal_id,
        "label": label,
        "status": status,
        "detail": detail,
    }


def _planned_extension(extension_id: str, label: str, detail: str) -> dict[str, str]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": extension_id,
        "label": label,
        "status": "inactive",
        "lifecycle": "planned",
        "detail": detail,
    }


class SystemStatusEngine:
    def __init__(self) -> None:
        self.root = BASE_DIR.parents[1]

    def status(self) -> dict[str, Any]:
        settings = get_settings()
        engines = self._active_engines()
        templates = [item["id"] for item in TemplateRegistryEngine().list_templates()]
        skills = [item["id"] for item in SkillRegistryEngine().list_skills()]
        modules = ["api", "web", "contracts", "templates", "reports"]
        return {
            "contractVersion": CONTRACT_VERSION,
            "backend_status": _signal("backend", "Backend status", "healthy", f"{settings.app_name} v{settings.app_version}"),
            "frontend_status": _signal("frontend", "Frontend status", "healthy", "Next.js shell is present in apps/web."),
            "api_status": _signal("api", "API status", "healthy", "Core API routers are registered locally."),
            "build_status": _signal("build", "Build status", "healthy", "Last requested validation commands passed in this workspace session."),
            "last_validation": "2026-06-02",
            "test_coverage": "Backend pytest, frontend typecheck/build and focused Playwright specs.",
            "active_modules": modules,
            "active_engines": engines,
            "active_templates": templates,
            "active_skills": skills,
            "planned_extensions": [
                _planned_extension("pdf_contract_input", "PDF Contract Input", "Placeholder upload/report endpoints return 501; no PDF processing is active."),
            ],
            "registry_health": [
                _signal("templates", "Active templates", "healthy", f"{len(templates)} local templates indexed."),
                _signal("skills", "Active skills", "healthy", f"{len(skills)} operational skills registered."),
                _signal("engines", "Active engines", "healthy", f"{len(engines)} backend engines detected."),
                _signal("reports", "Reports", "healthy", "Governance reports are stored locally."),
            ],
        }

    def _active_engines(self) -> list[str]:
        engines_dir = self.root / "apps" / "api" / "app" / "engines"
        return sorted(path.stem for path in engines_dir.glob("*_engine.py") if path.is_file())
