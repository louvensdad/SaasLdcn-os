from __future__ import annotations

from app.schemas.execution_profile import ExecutionProfile, ExecutionProfileSummary

# Single source of truth for the three execution profiles (Economy / Professional /
# Enterprise). Every profile still guarantees a compiling, QA'd, certified project --
# the only axis that varies is cost/speed/depth of validation and which models do the
# work. Professional's values match TODAY'S actual defaults (MAX_AUTO_REPAIR_ATTEMPTS=2,
# ROLE_MODEL_HINTS as-is), so a job/spec with no execution_profile behaves exactly as it
# always has.

EXECUTION_PROFILES: dict[str, ExecutionProfile] = {
    "economy": ExecutionProfile(
        id="economy",
        name="Economy",
        description="Mais rápido e econômico para MVPs, protótipos e aplicações pequenas.",
        model_strategy="economy",
        max_repair_cycles=1,
        enable_architecture_review=False,
        # No dedicated review beyond the baseline deterministic security step
        # every profile always gets (secret scan, path checks -- part of the
        # unconditional "no broken/insecure code" guarantee, not this flag).
        enable_security_review=False,
        enable_performance_review=False,
        enable_import_graph=False,
        enable_dependency_graph=False,
        enable_build_guarantee=True,
        enable_product_certification=True,
        enable_accessibility_review=False,
        enable_runtime_validation=False,
        enable_cost_optimization=True,
        enable_deep_project_planning=False,
        recommended=False,
    ),
    "professional": ExecutionProfile(
        id="professional",
        name="Professional",
        description="Melhor equilíbrio entre custo, velocidade e qualidade.",
        model_strategy="balanced",
        max_repair_cycles=2,
        enable_architecture_review=True,
        enable_security_review=True,
        enable_performance_review=False,
        enable_import_graph=True,
        enable_dependency_graph=True,
        enable_build_guarantee=True,
        enable_product_certification=True,
        enable_accessibility_review=False,
        enable_runtime_validation=False,
        enable_cost_optimization=True,
        enable_deep_project_planning=False,
        recommended=True,
    ),
    "enterprise": ExecutionProfile(
        id="enterprise",
        name="Enterprise",
        description="Máxima robustez para sistemas críticos.",
        model_strategy="premium",
        max_repair_cycles=3,
        enable_architecture_review=True,
        enable_security_review=True,
        enable_performance_review=True,
        enable_import_graph=True,
        enable_dependency_graph=True,
        enable_build_guarantee=True,
        enable_product_certification=True,
        enable_accessibility_review=False,
        enable_runtime_validation=True,
        enable_cost_optimization=False,
        enable_deep_project_planning=True,
        recommended=False,
    ),
}

DEFAULT_EXECUTION_PROFILE_ID = "professional"


def resolve_execution_profile(profile_id: str | None) -> ExecutionProfile:
    if profile_id and profile_id in EXECUTION_PROFILES:
        return EXECUTION_PROFILES[profile_id]
    return EXECUTION_PROFILES[DEFAULT_EXECUTION_PROFILE_ID]


def list_execution_profiles() -> list[ExecutionProfileSummary]:
    return [
        ExecutionProfileSummary(id=p.id, name=p.name, description=p.description, recommended=p.recommended)
        for p in EXECUTION_PROFILES.values()
    ]
