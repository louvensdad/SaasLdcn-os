from __future__ import annotations

from fastapi import APIRouter

from app.schemas.registry import (
    Architecture,
    Archetype,
    BusinessModule,
    Capability,
    CompatibilityRule,
    Endpoint,
    Framework,
    Language,
    RegistryValidationResponse,
    RegistryValidationSelection,
    Runtime,
)
from app.schemas.stack import Stack
from app.services.registry_service import RegistryService


router = APIRouter(tags=["registry"])
service = RegistryService()


@router.get("/registry/stacks", response_model=list[Stack])
def list_registry_stacks() -> list[Stack]:
    return [Stack.model_validate(item) for item in service.list_stacks()]


@router.get("/registry/languages", response_model=list[Language])
def list_languages() -> list[Language]:
    return [Language.model_validate(item) for item in service.list_languages()]


@router.get("/registry/runtimes", response_model=list[Runtime])
def list_runtimes() -> list[Runtime]:
    return [Runtime.model_validate(item) for item in service.list_runtimes()]


@router.get("/registry/frameworks", response_model=list[Framework])
def list_frameworks() -> list[Framework]:
    return [Framework.model_validate(item) for item in service.list_frameworks()]


@router.get("/registry/architectures", response_model=list[Architecture])
def list_architectures() -> list[Architecture]:
    return [Architecture.model_validate(item) for item in service.list_architectures()]


@router.get("/registry/archetypes", response_model=list[Archetype])
def list_archetypes() -> list[Archetype]:
    return [Archetype.model_validate(item) for item in service.list_archetypes()]


@router.get("/registry/capabilities", response_model=list[Capability])
def list_capabilities() -> list[Capability]:
    return [Capability.model_validate(item) for item in service.list_capabilities()]


@router.get("/registry/business-modules", response_model=list[BusinessModule])
def list_business_modules() -> list[BusinessModule]:
    return [BusinessModule.model_validate(item) for item in service.list_business_modules()]


@router.get("/registry/endpoints", response_model=list[Endpoint])
def list_endpoints() -> list[Endpoint]:
    return [Endpoint.model_validate(item) for item in service.list_endpoints()]


@router.get("/registry/compatibility", response_model=list[CompatibilityRule])
def list_compatibility() -> list[CompatibilityRule]:
    return [CompatibilityRule.model_validate(item) for item in service.list_compatibility_rules()]


@router.get("/registry/archetypes/{archetype_id}", response_model=Archetype)
def get_archetype(archetype_id: str) -> Archetype:
    return Archetype.model_validate(service.get_archetype(archetype_id))


@router.get("/registry/languages/{language_id}/frameworks", response_model=list[Framework])
def list_language_frameworks(language_id: str) -> list[Framework]:
    return [Framework.model_validate(item) for item in service.list_language_frameworks(language_id)]


@router.get("/registry/frameworks/{framework_id}", response_model=Framework)
def get_framework(framework_id: str) -> Framework:
    return Framework.model_validate(service.get_framework(framework_id))


@router.get("/registry/frameworks/{framework_id}/architectures", response_model=list[Architecture])
def list_framework_architectures(framework_id: str) -> list[Architecture]:
    return [Architecture.model_validate(item) for item in service.list_framework_architectures(framework_id)]


@router.get("/registry/frameworks/{framework_id}/archetypes", response_model=list[Archetype])
def list_framework_archetypes(framework_id: str) -> list[Archetype]:
    return [Archetype.model_validate(item) for item in service.list_framework_archetypes(framework_id)]


@router.get("/registry/stacks/{stack_id}/archetypes", response_model=list[Archetype])
def list_stack_archetypes(stack_id: str) -> list[Archetype]:
    return [Archetype.model_validate(item) for item in service.list_stack_archetypes(stack_id)]


@router.get("/registry/stacks/{stack_id}/capabilities", response_model=list[Capability])
def list_stack_capabilities(stack_id: str) -> list[Capability]:
    return [Capability.model_validate(item) for item in service.list_stack_capabilities(stack_id)]


@router.get("/registry/business-modules/{module_id}/endpoints", response_model=list[Endpoint])
def list_module_endpoints(module_id: str) -> list[Endpoint]:
    return [Endpoint.model_validate(item) for item in service.list_module_endpoints(module_id)]


@router.post("/registry/validate-selection", response_model=RegistryValidationResponse)
def validate_selection(payload: RegistryValidationSelection) -> RegistryValidationResponse:
    return RegistryValidationResponse.model_validate(
        service.validate_selection(payload.model_dump())
    )
