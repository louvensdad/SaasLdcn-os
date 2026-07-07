from __future__ import annotations

from collections.abc import Sequence

from app.data.foundation import CONTRACT_VERSION
from app.registry.archetypes_registry import ARCHETYPES
from app.registry.architectures_registry import ARCHITECTURES
from app.registry.business_modules_registry import BUSINESS_MODULES
from app.registry.capabilities_registry import CAPABILITIES
from app.registry.compatibility_registry import COMPATIBILITY_RULES
from app.registry.endpoints_registry import ENDPOINTS
from app.registry.frameworks_registry import FRAMEWORKS
from app.registry.languages_registry import LANGUAGES
from app.registry.runtimes_registry import RUNTIMES
from app.registry.stacks_registry import STACKS


class RegistryRepository:
    @staticmethod
    def _with_contract_version(items: Sequence[dict]) -> list[dict]:
        return [
            item
            if "contractVersion" in item
            else {"contractVersion": CONTRACT_VERSION, **item}
            for item in items
        ]

    def list_languages(self) -> Sequence[dict]:
        return self._with_contract_version(LANGUAGES)

    def list_runtimes(self) -> Sequence[dict]:
        return self._with_contract_version(RUNTIMES)

    def list_frameworks(self) -> Sequence[dict]:
        return self._with_contract_version(FRAMEWORKS)

    def list_architectures(self) -> Sequence[dict]:
        return self._with_contract_version(ARCHITECTURES)

    def list_stacks(self) -> Sequence[dict]:
        return STACKS

    def list_archetypes(self) -> Sequence[dict]:
        normalized: list[dict] = []
        for item in ARCHETYPES:
            normalized.append(
                {
                    "supported_frameworks": item.get("supported_frameworks", item.get("supported_stacks", [])),
                    "recommended_frameworks": item.get("recommended_frameworks", item.get("recommended_stacks", [])),
                    "supported_architectures": item.get(
                        "supported_architectures",
                        self._architecture_ids_for_legacy_levels(item.get("supported_architecture_levels", [])),
                    ),
                    **item,
                }
            )
        return self._with_contract_version(normalized)

    def list_capabilities(self) -> Sequence[dict]:
        normalized: list[dict] = []
        for item in CAPABILITIES:
            normalized.append(
                {
                    "supported_frameworks": item.get("supported_frameworks", item.get("supported_stacks", [])),
                    "architecture_ids": item.get(
                        "architecture_ids",
                        self._all_architecture_ids_for_minimum(item.get("architecture_level_minimum", "level_1_mvp")),
                    ),
                    **item,
                }
            )
        return self._with_contract_version(normalized)

    def list_business_modules(self) -> Sequence[dict]:
        normalized = [
            {
                "supported_frameworks": item.get("supported_frameworks", item.get("supported_stacks", [])),
                **item,
            }
            for item in BUSINESS_MODULES
        ]
        return self._with_contract_version(normalized)

    def list_endpoints(self) -> Sequence[dict]:
        normalized: list[dict] = []
        for item in ENDPOINTS:
            normalized.append(
                {
                    "supported_frameworks": item.get("supported_frameworks", item.get("supported_stacks", [])),
                    "supported_architectures": item.get(
                        "supported_architectures",
                        self._all_architecture_ids_for_minimum(item.get("architecture_level_minimum", "level_1_mvp")),
                    ),
                    **item,
                }
            )
        return self._with_contract_version(normalized)

    def list_architecture_levels(self) -> Sequence[dict]:
        return []

    def list_compatibility_rules(self) -> Sequence[dict]:
        return self._with_contract_version(COMPATIBILITY_RULES)

    # Per-level architecture list, exactly as originally authored (unchanged —
    # this is the curated "which architectures make sense at this tier" data).
    # The bug was in how a capability's MINIMUM level got turned into a set:
    # architecture_level_minimum is a FLOOR ("needs at least this much
    # engineering maturity"), so a capability's final architecture_ids must be
    # the union of its own tier's list AND every MORE complex tier's list —
    # never just its own tier in isolation. The previous lookup returned only
    # the single matching tier's list, and since "microservices"/
    # "distributed_system" only ever appear in level_4/level_5's own lists,
    # EVERY capability (all of which are tagged level_1-3 across every
    # language) had zero architecture_ids in common with those two — picking
    # either in the wizard always produced a completely empty Capabilities
    # step, confirmed live regardless of language/framework/archetype.
    _LEVEL_ORDER = ("level_1_mvp", "level_2_professional", "level_3_enterprise", "level_4_distributed", "level_5_hyperscale")
    _LEVEL_ARCHITECTURES = {
        "level_1_mvp": ["monolith", "modular_monolith"],
        "level_2_professional": ["monolith", "modular_monolith", "clean_architecture", "hexagonal", "serverless"],
        "level_3_enterprise": ["modular_monolith", "clean_architecture", "hexagonal", "event_driven", "cqrs"],
        "level_4_distributed": ["microservices", "event_driven", "distributed_system", "clean_architecture", "hexagonal"],
        "level_5_hyperscale": ["microservices", "event_driven", "distributed_system", "cqrs"],
    }

    @classmethod
    def _all_architecture_ids_for_minimum(cls, minimum_level: str) -> list[str]:
        start = cls._LEVEL_ORDER.index(minimum_level) if minimum_level in cls._LEVEL_ORDER else 0
        architecture_ids: list[str] = []
        for level in cls._LEVEL_ORDER[start:]:  # this tier AND every more complex one
            for architecture_id in cls._LEVEL_ARCHITECTURES[level]:
                if architecture_id not in architecture_ids:
                    architecture_ids.append(architecture_id)
        return architecture_ids

    @classmethod
    def _architecture_ids_for_legacy_levels(cls, levels: Sequence[str]) -> list[str]:
        architecture_ids: list[str] = []
        for level in levels:
            architecture_ids.extend(cls._all_architecture_ids_for_minimum(level))
        return list(dict.fromkeys(architecture_ids))
