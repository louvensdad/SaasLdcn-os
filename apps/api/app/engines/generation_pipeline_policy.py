from __future__ import annotations

from dataclasses import dataclass

BACKEND_CHUNKS = [
    "structure", "package_config", "domain_entities", "dtos", "controllers",
    "services", "repositories", "auth", "validation", "error_handling",
    "tests", "openapi_sync",
]
MOBILE_CHUNKS = [
    "structure", "package_config", "screens", "navigation",
    "state_management", "api_client", "native_modules", "tests",
]


@dataclass(frozen=True)
class PipelineStep:
    state: str
    logical: str
    action: str
    role: str | None = None
    chunk: str | None = None


STEPS = [
    PipelineStep("PREPARING_CONTEXT", "contracts", "prepare"),
    PipelineStep("CONTRACTS_PLANNING", "contracts", "plan"),
    PipelineStep("CONTRACTS_GENERATING", "contracts", "llm", "contracts"),
    PipelineStep("CONTRACTS_VALIDATING", "contracts", "validate"),
    PipelineStep("DATABASE_PLANNING", "database", "plan"),
    PipelineStep("DATABASE_GENERATING", "database", "deterministic"),
    PipelineStep("DATABASE_VALIDATING", "database", "validate"),
    PipelineStep("BACKEND_PLANNING", "backend", "plan"),
    *(PipelineStep("BACKEND_GENERATING", "backend", "llm", "backend", chunk) for chunk in BACKEND_CHUNKS),
    PipelineStep("BACKEND_VALIDATING", "backend", "validate"),
    PipelineStep("FRONTEND_PLANNING", "frontend", "plan"),
    PipelineStep("FRONTEND_GENERATING", "frontend", "llm", "frontend"),
    PipelineStep("FRONTEND_VALIDATING", "frontend", "validate"),
    PipelineStep("SECURITY_PLANNING", "security", "plan"),
    PipelineStep("SECURITY_VALIDATING", "security", "security"),
    PipelineStep("TESTS_GENERATING", "tests", "llm", "qa"),
    PipelineStep("TESTS_RUNNING", "tests", "validate"),
    PipelineStep("DOCUMENTATION_GENERATING", "docs", "llm", "docs"),
    PipelineStep("BUILD_RUNNING", "build", "build"),
    PipelineStep("PACKAGE_CREATING", "package", "package"),
]
MOBILE_STEPS = [
    PipelineStep("MOBILE_PLANNING", "mobile", "plan"),
    *(PipelineStep("MOBILE_GENERATING", "mobile", "llm", "mobile", chunk) for chunk in MOBILE_CHUNKS),
    PipelineStep("MOBILE_VALIDATING", "mobile", "validate"),
]
DELIVERY_TYPES_WITH_MOBILE = frozenset({"mobile", "full_stack"})


def steps_for(delivery_type: str | None) -> list[PipelineStep]:
    if delivery_type not in DELIVERY_TYPES_WITH_MOBILE:
        return STEPS
    insert_at = next(index for index, step in enumerate(STEPS) if step.state == "FRONTEND_VALIDATING") + 1
    return [*STEPS[:insert_at], *MOBILE_STEPS, *STEPS[insert_at:]]


def logical_stages_for(steps: list[PipelineStep]) -> list[str]:
    return list(dict.fromkeys(step.logical for step in steps))