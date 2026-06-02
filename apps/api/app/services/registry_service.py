from __future__ import annotations

from collections.abc import Sequence
import re
from typing import Any

from fastapi import HTTPException, status

from app.repositories.registry_repository import RegistryRepository

ID_PATTERN = re.compile(r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")
BACKEND_ENDPOINT_GROUPS = {"auth", "users", "products", "orders", "payments", "analytics", "admin", "ai"}
BACKEND_ARCHETYPE_CATEGORIES = {"backend", "ai", "architecture"}
FRONTEND_ARCHETYPE_CATEGORIES = {"frontend", "application"}


class RegistryService:
    def __init__(self, repository: RegistryRepository | None = None) -> None:
        self.repository = repository or RegistryRepository()

    def list_languages(self) -> Sequence[dict]:
        return self.repository.list_languages()

    def list_runtimes(self) -> Sequence[dict]:
        return self.repository.list_runtimes()

    def list_frameworks(self) -> Sequence[dict]:
        return self.repository.list_frameworks()

    def list_architectures(self) -> Sequence[dict]:
        return self.repository.list_architectures()

    def list_stacks(self) -> Sequence[dict]:
        return self.repository.list_stacks()

    def list_archetypes(self) -> Sequence[dict]:
        return self.repository.list_archetypes()

    def list_capabilities(self) -> Sequence[dict]:
        return self.repository.list_capabilities()

    def list_business_modules(self) -> Sequence[dict]:
        return self.repository.list_business_modules()

    def list_endpoints(self) -> Sequence[dict]:
        return self.repository.list_endpoints()

    def list_architecture_levels(self) -> Sequence[dict]:
        return self.repository.list_architecture_levels()

    def list_compatibility_rules(self) -> Sequence[dict]:
        return self.repository.list_compatibility_rules()

    def get_archetype(self, archetype_id: str) -> dict[str, Any]:
        self._validate_id(archetype_id, "Archetype")
        return self._find_required(self.list_archetypes(), archetype_id, "Archetype")

    def get_framework(self, framework_id: str) -> dict[str, Any]:
        self._validate_id(framework_id, "Framework")
        return self._find_required(self.list_frameworks(), framework_id, "Framework")

    def list_language_frameworks(self, language_id: str) -> list[dict[str, Any]]:
        self._validate_id(language_id, "Language")
        self._find_required(self.list_languages(), language_id, "Language")
        return [item for item in self.list_frameworks() if item["language_id"] == language_id]

    def list_framework_architectures(self, framework_id: str) -> list[dict[str, Any]]:
        framework = self.get_framework(framework_id)
        supported_architecture_ids = set(framework["architecture_support"])
        return [
            item
            for item in self.list_architectures()
            if item["id"] in supported_architecture_ids
        ]

    def list_framework_archetypes(self, framework_id: str) -> list[dict[str, Any]]:
        framework = self.get_framework(framework_id)
        return [
            item
            for item in self.list_archetypes()
            if framework_id in item["supported_frameworks"]
            and item["id"] in framework["archetype_support"]
        ]

    def list_stack_archetypes(self, stack_id: str) -> list[dict[str, Any]]:
        # Legacy alias for framework-oriented selection.
        return self.list_framework_archetypes(stack_id)

    def list_stack_capabilities(self, stack_id: str) -> list[dict[str, Any]]:
        # Legacy alias for framework-oriented selection.
        return self.list_framework_capabilities(stack_id)

    def list_framework_capabilities(self, framework_id: str) -> list[dict[str, Any]]:
        framework = self.get_framework(framework_id)
        capability_support = set(framework["capability_support"])
        return [
            item
            for item in self.list_capabilities()
            if framework_id in item["supported_frameworks"] and item["id"] in capability_support
        ]

    def list_module_endpoints(self, module_id: str) -> list[dict[str, Any]]:
        self._validate_id(module_id, "Business module")
        self._find_required(self.list_business_modules(), module_id, "Business module")
        return [
            item for item in self.list_endpoints()
            if item.get("business_module_id") == module_id
        ]

    def validate_selection(self, payload: dict[str, Any]) -> dict[str, Any]:
        language_id = payload["language_id"]
        runtime_id = payload["runtime_id"]
        framework_id = payload["framework_id"]
        architecture_id = payload["architecture_id"]
        archetype_id = payload["archetype_id"]
        capability_ids = list(dict.fromkeys(payload.get("capability_ids", [])))
        business_module_ids = list(dict.fromkeys(payload.get("business_module_ids", [])))
        endpoint_ids = list(dict.fromkeys(payload.get("endpoint_ids", [])))

        language = self._find_required(self.list_languages(), language_id, "Language")
        runtime = self._find_required(self.list_runtimes(), runtime_id, "Runtime")
        framework = self._find_required(self.list_frameworks(), framework_id, "Framework")
        architecture = self._find_required(self.list_architectures(), architecture_id, "Architecture")
        archetype = self._find_required(self.list_archetypes(), archetype_id, "Archetype")
        capability_map = self._validate_related_ids(self.list_capabilities(), capability_ids, "Capability")
        module_map = self._validate_related_ids(self.list_business_modules(), business_module_ids, "Business module")
        endpoint_map = self._validate_related_ids(self.list_endpoints(), endpoint_ids, "Endpoint")

        errors: list[dict[str, Any]] = []
        warnings: list[dict[str, Any]] = []
        recommended_additions: list[str] = []

        if runtime_id not in language["supported_runtimes"]:
            errors.append(
                self._message(
                    "runtime_language_incompatible",
                    f"Language '{language_id}' does not support runtime '{runtime_id}'.",
                    related_ids=[runtime_id, language_id],
                )
            )

        if framework_id not in language["supported_frameworks"]:
            errors.append(
                self._message(
                    "framework_language_incompatible",
                    f"Language '{language_id}' does not support framework '{framework_id}'.",
                    related_ids=[framework_id, language_id],
                )
            )

        if framework_id not in runtime["supported_frameworks"]:
            errors.append(
                self._message(
                    "framework_runtime_incompatible",
                    f"Runtime '{runtime_id}' does not support framework '{framework_id}'.",
                    related_ids=[framework_id, runtime_id],
                )
            )

        if framework["runtime_id"] != runtime_id:
            warnings.append(
                self._message(
                    "framework_runtime_noncanonical",
                    f"Framework '{framework_id}' is canonically modeled on runtime '{framework['runtime_id']}', but '{runtime_id}' was selected.",
                    suggestion="Keep this pairing only if your target environment truly supports it.",
                    related_ids=[framework_id, runtime_id],
                )
            )

        if architecture_id not in framework["architecture_support"]:
            errors.append(
                self._message(
                    "framework_architecture_incompatible",
                    f"Framework '{framework_id}' does not support architecture '{architecture_id}'.",
                    related_ids=[framework_id, architecture_id],
                )
            )

        if framework_id not in architecture["supported_frameworks"]:
            errors.append(
                self._message(
                    "architecture_framework_incompatible",
                    f"Architecture '{architecture_id}' does not support framework '{framework_id}'.",
                    related_ids=[architecture_id, framework_id],
                )
            )

        if framework_id not in archetype["supported_frameworks"]:
            errors.append(
                self._message(
                    "framework_archetype_incompatible",
                    f"Archetype '{archetype_id}' does not support framework '{framework_id}'.",
                    related_ids=[framework_id, archetype_id],
                )
            )

        if architecture_id not in archetype["supported_architectures"]:
            errors.append(
                self._message(
                    "archetype_architecture_incompatible",
                    f"Archetype '{archetype_id}' does not support architecture '{architecture_id}'.",
                    related_ids=[archetype_id, architecture_id],
                )
            )

        for capability_id, capability in capability_map.items():
            if framework_id not in capability["supported_frameworks"]:
                errors.append(
                    self._message(
                        "capability_framework_incompatible",
                        f"Capability '{capability_id}' does not support framework '{framework_id}'.",
                        related_ids=[capability_id, framework_id],
                    )
                )
            if architecture_id not in capability["architecture_ids"]:
                errors.append(
                    self._message(
                        "capability_architecture_incompatible",
                        f"Capability '{capability_id}' does not support architecture '{architecture_id}'.",
                        related_ids=[capability_id, architecture_id],
                    )
                )
            for required_id in capability["requires"]:
                if required_id not in capability_ids:
                    errors.append(
                        self._message(
                            "capability_requirement_missing",
                            f"Capability '{capability_id}' requires capability '{required_id}'.",
                            suggestion=f"Add '{required_id}' to the capability selection.",
                            related_ids=[capability_id, required_id],
                        )
                    )
            for conflict_id in capability["conflicts_with"]:
                if conflict_id in capability_ids:
                    errors.append(
                        self._message(
                            "capability_conflict",
                            f"Capability '{capability_id}' conflicts with capability '{conflict_id}'.",
                            related_ids=[capability_id, conflict_id],
                        )
                    )

        for module_id, module in module_map.items():
            if framework_id not in module["supported_frameworks"]:
                errors.append(
                    self._message(
                        "module_framework_incompatible",
                        f"Business module '{module_id}' does not support framework '{framework_id}'.",
                        related_ids=[module_id, framework_id],
                    )
                )

        for endpoint_id, endpoint in endpoint_map.items():
            if framework_id not in endpoint["supported_frameworks"]:
                errors.append(
                    self._message(
                        "endpoint_framework_incompatible",
                        f"Endpoint '{endpoint_id}' does not support framework '{framework_id}'.",
                        related_ids=[endpoint_id, framework_id],
                    )
                )
            if architecture_id not in endpoint["supported_architectures"]:
                errors.append(
                    self._message(
                        "endpoint_architecture_incompatible",
                        f"Endpoint '{endpoint_id}' does not support architecture '{architecture_id}'.",
                        related_ids=[endpoint_id, architecture_id],
                    )
                )
            missing_endpoint_capabilities = [
                capability_id
                for capability_id in endpoint["required_capabilities"]
                if capability_id not in capability_ids
            ]
            if missing_endpoint_capabilities:
                errors.append(
                    self._message(
                        "endpoint_capabilities_missing",
                        f"Endpoint '{endpoint_id}' requires capabilities: {', '.join(missing_endpoint_capabilities)}.",
                        suggestion="Add the required capabilities or remove the endpoint from the blueprint.",
                        related_ids=[endpoint_id, *missing_endpoint_capabilities],
                    )
                )

        if framework_id == "spring_boot" and not (language_id == "java" and runtime_id == "jvm"):
            errors.append(
                self._message(
                    "spring_boot_requires_java_jvm",
                    "Spring Boot requires the Java language and the JVM runtime.",
                    related_ids=[language_id, runtime_id, framework_id],
                )
            )

        if framework_id == "nestjs" and not (
            language_id in {"typescript", "javascript"} and runtime_id == "nodejs"
        ):
            errors.append(
                self._message(
                    "nestjs_requires_ts_node",
                    "NestJS requires a TypeScript or JavaScript selection running on Node.js.",
                    related_ids=[language_id, runtime_id, framework_id],
                )
            )

        if framework_id == "nextjs" and archetype["category"] in BACKEND_ARCHETYPE_CATEGORIES:
            warnings.append(
                self._message(
                    "nextjs_backend_archetype_warning",
                    "Next.js is best aligned with frontend and full-stack archetypes in this foundation phase.",
                    suggestion="Prefer frontend, application or full-stack archetypes with Next.js.",
                    related_ids=[framework_id, archetype_id],
                )
            )

        if framework_id == "react" and archetype["category"] in BACKEND_ARCHETYPE_CATEGORIES:
            errors.append(
                self._message(
                    "react_backend_archetype_blocked",
                    "React alone does not support backend-oriented archetypes in this foundation model.",
                    suggestion="Choose a backend-capable framework such as FastAPI, NestJS or Spring Boot.",
                    related_ids=[framework_id, archetype_id],
                )
            )

        if architecture_id == "microservices":
            for required_capability in ("docker",):
                if required_capability not in capability_ids:
                    errors.append(
                        self._message(
                            "microservices_requirement_missing",
                            f"Architecture '{architecture_id}' requires capability '{required_capability}'.",
                            suggestion=f"Add '{required_capability}' to the capability selection.",
                            related_ids=[architecture_id, required_capability],
                        )
                    )
            for recommended_capability in ("observability", "queue"):
                if recommended_capability not in capability_ids:
                    warnings.append(
                        self._message(
                            "microservices_capability_recommended",
                            f"Architecture '{architecture_id}' strongly benefits from capability '{recommended_capability}'.",
                            suggestion=f"Add '{recommended_capability}' for healthier distributed operation.",
                            related_ids=[architecture_id, recommended_capability],
                        )
                    )
                    recommended_additions.append(recommended_capability)

        if archetype_id == "ai_saas":
            for recommended_capability in ("websocket", "ai_chat", "authentication"):
                if recommended_capability not in capability_ids:
                    warnings.append(
                        self._message(
                            "ai_saas_capability_recommended",
                            f"AI SaaS archetypes usually expect capability '{recommended_capability}'.",
                            suggestion=f"Add '{recommended_capability}' to better align the blueprint.",
                            related_ids=[archetype_id, recommended_capability],
                        )
                    )
                    recommended_additions.append(recommended_capability)

        if "payments" in capability_ids and not (
            {"users", "customers"} & set(business_module_ids)
            or {"subscriptions", "orders"} & set(business_module_ids)
        ):
            errors.append(
                self._message(
                    "payments_business_context_missing",
                    "Capability 'payments' requires customer, user, subscription or order context.",
                    suggestion="Add 'customers', 'users', 'subscriptions' or 'orders' business modules.",
                    related_ids=["payments"],
                )
            )

        if endpoint_ids and framework["framework_type"] == "ui_framework":
            backend_only_endpoints = [
                endpoint_id
                for endpoint_id, endpoint in endpoint_map.items()
                if endpoint["group"] in BACKEND_ENDPOINT_GROUPS and archetype["category"] in BACKEND_ARCHETYPE_CATEGORIES
            ]
            if backend_only_endpoints:
                warnings.append(
                    self._message(
                        "ui_framework_backend_endpoints_warning",
                        "UI-oriented frameworks should usually pair with a backend framework before owning backend-first endpoints.",
                        suggestion="Use a full-stack or backend framework if the blueprint depends on backend route ownership.",
                        related_ids=backend_only_endpoints,
                    )
                )

        recommended_additions = list(
            dict.fromkeys(
                [
                    *recommended_additions,
                    *[
                        capability_id
                        for capability_id in archetype["default_capabilities"]
                        if capability_id not in capability_ids
                    ],
                    *[
                        module_id
                        for module_id in archetype["recommended_business_modules"]
                        if module_id not in business_module_ids
                    ],
                    *[
                        endpoint_id
                        for endpoint_id in archetype["default_endpoints"]
                        if endpoint_id not in endpoint_ids
                    ],
                    *[
                        capability_id
                        for capability_id in architecture["recommended_capabilities"]
                        if capability_id not in capability_ids
                    ],
                ]
            )
        )

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "recommended_additions": recommended_additions,
            "resolved_blueprint_summary": {
                "technology_graph": {
                    "language": {
                        "id": language["id"],
                        "name": language["name"],
                        "ecosystem": language["ecosystem"],
                    },
                    "runtime": {
                        "id": runtime["id"],
                        "name": runtime["name"],
                    },
                    "framework": {
                        "id": framework["id"],
                        "name": framework["name"],
                        "framework_type": framework["framework_type"],
                        "maturity_level": framework["maturity_level"],
                        "enterprise_score": framework["enterprise_score"],
                    },
                    "architecture": {
                        "id": architecture["id"],
                        "name": architecture["name"],
                        "complexity_level": architecture["complexity_level"],
                        "deployment_complexity": architecture["deployment_complexity"],
                    },
                },
                "archetype": {
                    "id": archetype["id"],
                    "name": archetype["name"],
                    "category": archetype["category"],
                },
                "counts": {
                    "capabilities": len(capability_ids),
                    "business_modules": len(business_module_ids),
                    "endpoints": len(endpoint_ids),
                },
                "capability_ids": capability_ids,
                "business_module_ids": business_module_ids,
                "endpoint_ids": endpoint_ids,
            },
        }

    def _validate_related_ids(
        self,
        items: Sequence[dict],
        ids: list[str],
        label: str,
    ) -> dict[str, dict[str, Any]]:
        resolved: dict[str, dict[str, Any]] = {}
        for item_id in ids:
            self._validate_id(item_id, label)
            resolved[item_id] = self._find_required(items, item_id, label)
        return resolved

    @staticmethod
    def _find_required(items: Sequence[dict], item_id: str, label: str) -> dict[str, Any]:
        for item in items:
            if item["id"] == item_id:
                return item
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{label} '{item_id}' was not found.",
        )

    @staticmethod
    def _validate_id(item_id: str, label: str) -> None:
        if not ID_PATTERN.fullmatch(item_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"{label} '{item_id}' was not found.",
            )

    @staticmethod
    def _message(
        code: str,
        message: str,
        *,
        suggestion: str | None = None,
        related_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        return {
            "code": code,
            "message": message,
            "suggestion": suggestion,
            "related_ids": related_ids or [],
        }
