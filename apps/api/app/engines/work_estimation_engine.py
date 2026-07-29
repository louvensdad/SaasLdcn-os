from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.schemas.orchestrator import ProjectSpec
from app.schemas.work_estimate import PhaseEstimate, WorkEstimate

# Work Estimation Engine (Engineering Employee Mode, section 1): before a
# GenerationJob exists, size the project and state a healthy minimum delivery
# time -- never let a complex project look instant ("No Rush Policy", section
# 2). Deterministic and additive, same scoring/banding style already proven in
# engineering_readiness_engine.estimate_delivery_complexity, but driven by the
# real ProjectSpec/blueprint fields the Project Room -> Meta-Factory pipeline
# actually uses (that engine only ever sees the Wizard's capability_ids/
# infrastructure_ids selection dict, which the real pipeline doesn't produce).

# Mirrors generation_job_engine._DELIVERY_TYPES_WITH_MOBILE -- duplicated (not
# imported) to avoid a circular import, since generation_job_engine.create_job
# calls into this module.
_DELIVERY_TYPES_WITH_MOBILE = frozenset({"mobile", "full_stack"})

_SECURITY_KEYWORDS = ("security", "seguranca", "segurança", "compliance", "lgpd", "gdpr", "auditoria", "audit", "pci")

_ARCHITECTURE_HOURS = {"landing_page": 1, "api_simples": 4, "saas": 8, "enterprise": 16}
_BUILD_HOURS = {"api_simples": 2, "saas": 4, "enterprise": 6}


def _clamp(value: int) -> int:
    return max(0, min(100, value))


def _count_security_signals(non_functional: dict[str, str]) -> int:
    haystacks = [str(k).lower() for k in non_functional] + [str(v).lower() for v in non_functional.values()]
    return sum(1 for keyword in _SECURITY_KEYWORDS if any(keyword in text for text in haystacks))


def _size_band(score: int) -> str:
    if score < 25:
        return "landing_page"
    if score < 45:
        return "api_simples"
    if score < 70:
        return "saas"
    return "enterprise"


def _complexity_label(size_band: str, score: int) -> str:
    if size_band == "landing_page":
        return "Baixa"
    if size_band == "api_simples":
        return "Baixa" if score < 35 else "Média"
    if size_band == "saas":
        return "Média" if score < 58 else "Alta"
    return "Alta" if score < 85 else "Enterprise"


_HEALTHY_MINIMUM_LABEL = {
    "landing_page": "2-3 horas",
    "api_simples": "1-3 dias",
    "saas": "1-3 semanas",
    "enterprise": "2-6 semanas",
}


def estimate_generation_effort(spec: ProjectSpec, blueprint: dict[str, Any] | None = None, *, project_name: str = "") -> WorkEstimate:
    entities = len(spec.entities)
    workflows = len(spec.core_workflows)
    business_rules = len(spec.business_rules)
    decisions = len((blueprint or {}).get("decisions") or [])
    has_mobile = spec.delivery_type in _DELIVERY_TYPES_WITH_MOBILE
    architecture = (spec.suggested_stack.architecture or "").lower()
    distributed = any(keyword in architecture for keyword in ("microservices", "event", "cqrs", "distributed"))
    security_signals = _count_security_signals(spec.non_functional or {})

    score = 20 + entities * 3 + workflows * 4 + business_rules * 1 + decisions * 1
    drivers: list[str] = []
    if entities:
        drivers.append(f"{entities} entidade(s) de domínio")
    if workflows:
        drivers.append(f"{workflows} fluxo(s) de negócio")
    if has_mobile:
        score += 20
        drivers.append("Entrega mobile")
    if distributed:
        score += 22
        drivers.append("Arquitetura distribuída/microsserviços")
    if security_signals:
        score += security_signals * 6
        drivers.append("Requisitos de segurança/conformidade explícitos")
    score = _clamp(score)

    size_band = _size_band(score)
    complexity = _complexity_label(size_band, score)
    healthy_minimum_label = _HEALTHY_MINIMUM_LABEL[size_band]

    if distributed or security_signals >= 2 or score >= 70:
        risk_level = "Alto"
    elif score >= 45 or security_signals == 1:
        risk_level = "Médio"
    else:
        risk_level = "Baixo"

    phases: list[PhaseEstimate] = [
        PhaseEstimate(id="architecture", label="Arquitetura", duration_label=f"{_ARCHITECTURE_HOURS[size_band]}h"),
    ]
    if size_band != "landing_page":
        backend_days = max(1, round(entities * 0.5 + workflows * 0.3))
        frontend_days = max(1, round(entities * 0.4 + workflows * 0.2))
        phases.append(PhaseEstimate(id="backend", label="Backend", duration_label=f"{backend_days} dias"))
        phases.append(PhaseEstimate(id="frontend", label="Frontend", duration_label=f"{frontend_days} dias"))
        if has_mobile:
            mobile_days = max(1, round(backend_days * 0.5))
            phases.append(PhaseEstimate(id="mobile", label="Mobile", duration_label=f"{mobile_days} dias"))
        tests_days = max(1, round(score / 40))
        phases.append(PhaseEstimate(id="tests", label="Testes", duration_label=f"{tests_days} dias"))
        phases.append(PhaseEstimate(id="docs", label="Documentação", duration_label="1 dia"))
        phases.append(PhaseEstimate(id="build", label="Build", duration_label=f"{_BUILD_HOURS[size_band]}h"))

    if size_band == "landing_page":
        no_rush_message = "Projeto simples detectado. Execução direta, sem necessidade de faseamento."
    else:
        no_rush_message = (
            f"Projeto complexo detectado. Execução recomendada por fases. "
            f"Tempo saudável estimado: {healthy_minimum_label}."
        )

    return WorkEstimate(
        project_name=project_name,
        complexity=complexity,
        size_band=size_band,
        healthy_minimum_label=healthy_minimum_label,
        risk_level=risk_level,
        phases=phases,
        drivers=drivers,
        no_rush_message=no_rush_message,
        generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
    )
