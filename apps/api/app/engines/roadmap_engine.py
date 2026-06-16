from __future__ import annotations

from typing import Any

from app.data.foundation import CONTRACT_VERSION

STATUSES = ["IMPLEMENTED", "IN_PROGRESS", "PLANNED", "FUTURE", "ARCHIVED"]

ITEMS: list[dict[str, Any]] = [
    ("project_registry", "Project Registry", "module", "IMPLEMENTED", "Persisted project records and detail surfaces."),
    ("template_marketplace", "Template Marketplace Foundation", "template", "IMPLEMENTED", "Local template catalog, metadata and compatibility."),
    ("skill_registry", "Skill Registry Foundation", "skill", "IMPLEMENTED", "Read-only operational skill registry and preview plans."),
    ("system_status", "System Status Center", "visualization", "IMPLEMENTED", "Internal runtime, registry and validation health."),
    ("architecture_center", "Architecture Center", "visualization", "IMPLEMENTED", "Current platform architecture overview from local knowledge."),
    ("roadmap_center", "Roadmap Center", "module", "IMPLEMENTED", "Governed roadmap grouped by lifecycle status."),
    ("local_generation", "Local Generation Download Preview", "engine", "IMPLEMENTED", "Safe local generation inspection and ZIP preparation."),
    ("user_key_boost", "User Key Boost", "extension", "IMPLEMENTED", "Bring-your-own LLM key per session, held only in encrypted RAM (never persisted/logged) and cleared on logout."),
    ("git_export", "Git Provider Export", "extension", "IMPLEMENTED", "Self-service GitHub and GitLab connection, repository creation, initial commit, and push."),
    ("pdf_contract_input", "PDF Contract Input", "extension", "PLANNED", "PDF contract context upload and embedded text extraction are planned without OCR or auto-generation."),
    ("agent_runtime", "Agent Runtime", "module", "FUTURE", "Agents remain explicitly out of scope."),
    ("external_marketplace", "External Marketplace", "registry", "FUTURE", "No external marketplace integration in current foundation."),
    ("deployment", "Deployment Automation", "module", "FUTURE", "No deployment automation in current foundation."),
    ("legacy_placeholders", "Archived Placeholders", "module", "ARCHIVED", "Reserved and archived folders remain documented."),
]


class RoadmapEngine:
    def roadmap(self) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "items": [
                {
                    "contractVersion": CONTRACT_VERSION,
                    "id": item_id,
                    "title": title,
                    "category": category,
                    "status": status,
                    "summary": summary,
                }
                for item_id, title, category, status, summary in ITEMS
            ],
            "statuses": STATUSES,
        }
