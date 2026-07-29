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

# Frontend Team (PARTE 6 of the request): frontend generation was previously
# one single LLM call (unlike backend/mobile's chunked, per-responsibility
# calls above) -- confirmed the load-bearing gap via research before adding
# this. Each chunk here is a distinct specialized role (see
# FRONTEND_TEAM_ROLES below and their prompts in agent_prompts.py), not just
# a scope-boundary annotation on one shared prompt: the first four produce a
# single structured JSON planning artifact each (ux-strategy.json,
# visual-direction.json, frontend-architecture.json, interaction-spec.json),
# "implementation" is the pre-existing FRONTEND_GENERATING behavior now
# additionally informed by those four artifacts as context, and "qa_review"
# is a holistic LLM review pass answering PARTE 7's ten questions against the
# real generated output (a distinct, opt-in-cost addition on top of the
# always-on deterministic FrontendAuthenticityGate). Accessibility and
# Responsive concerns are folded into qa_review rather than split into two
# more LLM calls -- a deliberate cost/latency bound (6 LLM calls instead of
# 8), documented here rather than silently decided.
FRONTEND_TEAM_CHUNKS = [
    "ux_strategy", "visual_direction", "frontend_architecture", "interaction_design",
    "implementation", "qa_review",
]
FRONTEND_TEAM_ROLES: dict[str, str] = {
    "ux_strategy": "frontend_ux_strategy",
    "visual_direction": "frontend_visual_direction",
    "frontend_architecture": "frontend_architecture_role",
    "interaction_design": "frontend_interaction_design",
    "implementation": "frontend",
    "qa_review": "frontend_qa_review",
}
# Chunks whose output is a single JSON planning artifact (not application
# code) -- used by generation_job_engine.py to decide how to persist/validate
# the parsed output differently from a normal multi-file code chunk.
FRONTEND_TEAM_JSON_CHUNKS = frozenset({"ux_strategy", "visual_direction", "frontend_architecture", "interaction_design", "qa_review"})

# PARTE 9 of the request: real-time messages tied to an actually-active
# operation, not a generic "Etapa iniciada: frontend.ux_strategy." -- these
# are emitted (see generation_job_engine.py's _begin_step) only when that
# exact chunk's LLM call is actually starting, never speculatively.
FRONTEND_TEAM_START_MESSAGES: dict[str, str] = {
    "ux_strategy": "Mapeando as jornadas principais.",
    "visual_direction": "Definindo a direcao visual.",
    "frontend_architecture": "Planejando os componentes da interface.",
    "interaction_design": "Definindo as interacoes e microinteracoes.",
    "implementation": "Implementando as telas da interface.",
    "qa_review": "Executando revisao visual.",
}


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
    *(PipelineStep("FRONTEND_GENERATING", "frontend", "llm", FRONTEND_TEAM_ROLES[chunk], chunk) for chunk in FRONTEND_TEAM_CHUNKS),
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