from __future__ import annotations

from typing import Any

from app.data.foundation import CONTRACT_VERSION
from app.engines.template_registry_engine import TemplateRegistryEngine


class TemplateMetadataEngine:
    def __init__(self, registry: TemplateRegistryEngine | None = None) -> None:
        self.registry = registry or TemplateRegistryEngine()

    def compatibility(self, template_id: str, selection: dict[str, Any]) -> dict[str, Any]:
        template = self.registry.get_template(template_id)
        return self._score(template, selection)

    def recommendations(self, selection: dict[str, Any], *, limit: int = 3) -> dict[str, Any]:
        scored = [(template, self._score(template, selection)) for template in self.registry.list_templates()]
        scored.sort(key=lambda item: (item[1]["score"], item[0]["maturity"] == "mature"), reverse=True)
        compatible = [(template, score) for template, score in scored if score["compatible"]]
        selected = compatible[:limit] if compatible else scored[:limit]
        return {
            "contractVersion": CONTRACT_VERSION,
            "recommendations": [template for template, _ in selected],
            "compatibility": [score for _, score in selected],
        }

    def _score(self, template: dict[str, Any], selection: dict[str, Any]) -> dict[str, Any]:
        matched: list[str] = []
        missing: list[str] = []
        warnings: list[str] = []
        score = 0

        checks = [
            ("language", selection.get("language_id"), template["supported_languages"], 20),
            ("framework", selection.get("framework_id"), template["supported_frameworks"], 25),
            ("architecture", selection.get("architecture_id"), template["supported_architectures"], 20),
            ("archetype", selection.get("archetype_id"), template["supported_archetypes"], 25),
        ]
        for label, value, supported, weight in checks:
            if not value:
                warnings.append(f"No {label} selected.")
                continue
            if value in supported:
                matched.append(label)
                score += weight
            else:
                missing.append(label)

        capability_ids = set(selection.get("capability_ids") or [])
        if capability_ids:
            overlap = capability_ids & set(template["capabilities"])
            score += min(10, len(overlap) * 5)
            if overlap:
                matched.append("capabilities")
            else:
                warnings.append("No selected capabilities are native to this template.")

        if template["maturity"] in {"stable", "mature"}:
            score += 5
        if template["complexity"] == "low":
            score += 5

        score = min(score, 100)
        return {
            "contractVersion": CONTRACT_VERSION,
            "template_id": template["id"],
            "compatible": score >= 65 and "framework" not in missing and "archetype" not in missing,
            "score": score,
            "matched": matched,
            "missing": missing,
            "warnings": warnings,
            "maturity_verified": template["maturity"] in {"stable", "mature"},
        }
