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

    @staticmethod
    def _all_architecture_ids_for_minimum(minimum_level: str) -> list[str]:
        legacy_mapping = {
            "level_1_mvp": ["monolith", "modular_monolith"],
            "level_2_professional": ["monolith", "modular_monolith", "clean_architecture", "hexagonal", "serverless"],
            "level_3_enterprise": ["modular_monolith", "clean_architecture", "hexagonal", "event_driven", "cqrs"],
            "level_4_distributed": ["microservices", "event_driven", "distributed_system", "clean_architecture", "hexagonal"],
            "level_5_hyperscale": ["microservices", "event_driven", "distributed_system", "cqrs"],
        }
        return legacy_mapping[minimum_level]

    @classmethod
    def _architecture_ids_for_legacy_levels(cls, levels: Sequence[str]) -> list[str]:
        architecture_ids: list[str] = []
        for level in levels:
            architecture_ids.extend(cls._all_architecture_ids_for_minimum(level))
        return list(dict.fromkeys(architecture_ids))
