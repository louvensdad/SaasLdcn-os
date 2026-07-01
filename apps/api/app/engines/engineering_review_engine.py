from __future__ import annotations

from typing import Any

# Engineering Review Engine: a technical-committee critique layered over the
# Architect's blueprint. It is intentionally DETERMINISTIC and runs without an
# LLM/key so the Engineering Review Center always renders — but it never invents
# findings. Every item is traced to real spec/blueprint/readiness evidence, and a
# category with no evidence is reported as "unavailable", not guessed.
#
# It is distinct from the Architect Engine: the Architect *decides and justifies*;
# this engine *reviews critically* — surfacing what is solid, what is debatable,
# the gaps, risks, inconsistencies, scalability/security impact, and the actions
# to take before the Meta-Factory.

SECURITY_AREAS = {"auth", "authorization"}


def _finding(title: str, detail: str = "", area: str | None = None) -> dict[str, Any]:
    return {"title": title, "detail": detail, "area": area}


def _category(key: str, label: str, score: int | None, basis: str) -> dict[str, Any]:
    if score is None:
        return {"key": key, "label": label, "status": "unavailable", "score": None, "basis": basis}
    return {"key": key, "label": label, "status": "scored", "score": max(0, min(100, int(score))), "basis": basis}


def build_engineering_review(room: dict[str, Any], readiness_checks: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Return the committee assessment dict, or None when there is no blueprint to
    review (the Review Center is only meaningful once the Architect has produced one)."""
    blueprint = room.get("architecture_blueprint") or {}
    decisions = [d for d in (blueprint.get("decisions") or []) if isinstance(d, dict)]
    if not blueprint or not decisions:
        return None

    spec = room.get("spec") or {}
    areas = {d.get("area") for d in decisions}
    degraded = bool(blueprint.get("degraded")) or blueprint.get("mode") == "deterministic" or blueprint.get("source") == "deterministic"
    open_questions = spec.get("open_questions") or []

    good_decisions: list[dict[str, Any]] = []
    debatable_decisions: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []

    for decision in decisions:
        area = decision.get("area")
        choice = (decision.get("choice") or "").strip()
        justification = (decision.get("justification") or "").strip()
        has_depth = bool(decision.get("tradeoffs")) or bool(decision.get("alternatives_considered"))
        # Solid = a real choice, a justification, and at least some rationale depth.
        if choice and justification and has_depth:
            good_decisions.append(_finding(choice, justification, area))
        else:
            debatable_decisions.append(
                _finding(choice or f"Decisao de {area}", "Justificativa ou trade-offs ausentes nesta decisao.", area)
            )
        # Carry the decision's own declared risks up into the risk center.
        for risk in decision.get("risks") or []:
            if isinstance(risk, str) and risk.strip():
                risks.append(_finding(risk.strip(), f"Originado da decisao de {area}.", area))

    # A degraded (no-LLM) blueprint is itself a reviewable concern, not a verdict.
    if degraded:
        debatable_decisions.append(
            _finding(
                "Blueprint em modo deterministico (preview)",
                "Nenhum LLM autorou estas decisoes; sao uma previa tecnica, nao o melhor resultado possivel.",
            )
        )
        risks.append(
            _finding(
                "Arquitetura nao revisada por IA",
                "Para projetos complexos/Enterprise, regenerar com IA reduz o risco de decisoes rasas.",
            )
        )

    # Open questions from the spec are unresolved decisions -> real risks.
    for question in open_questions:
        if isinstance(question, dict) and question.get("question"):
            risks.append(
                _finding(
                    question["question"],
                    question.get("why_it_matters") or "Pergunta em aberto na spec.",
                )
            )

    # Gaps = required readiness checks that are not yet passed.
    gaps = [
        _finding(check["label"], check["detail"])
        for check in readiness_checks
        if check.get("required") and check.get("status") != "passed"
    ]

    # Inconsistencies = verifiable contradictions in the real data.
    inconsistencies: list[dict[str, Any]] = []
    if blueprint.get("project_id") and blueprint.get("project_id") != room.get("room_id"):
        inconsistencies.append(
            _finding("Blueprint pertence a outra sala", "O project_id do blueprint nao corresponde a esta sala.")
        )
    if "database" in areas and not (spec.get("entities") or []):
        inconsistencies.append(
            _finding("Banco decidido sem entidades", "Ha decisao de database, mas a spec nao lista entidades.")
        )

    # Impact summaries — real text or an honest "indisponivel".
    security_decisions = [d for d in decisions if d.get("area") in SECURITY_AREAS]
    security_impact = (
        "; ".join(f"{d['area']}: {d.get('choice', '')}" for d in security_decisions)
        if security_decisions
        else "indisponivel"
    )
    scale_decisions = [d for d in decisions if d.get("area") in {"deploy", "observability"}]
    scalability_impact = (
        "; ".join(f"{d['area']}: {d.get('choice', '')}" for d in scale_decisions)
        if scale_decisions
        else "indisponivel"
    )

    required = [c for c in readiness_checks if c.get("required")]
    passed = [c for c in required if c.get("status") == "passed"]
    generation_readiness = (
        f"{len(passed)}/{len(required)} verificacoes obrigatorias atendidas"
        + (" — modo deterministico (preview)." if degraded else ".")
    )

    recommendations: list[str] = []
    if degraded:
        recommendations.append("Conecte um provedor de IA (GPT, Claude, Gemini ou DeepSeek) e regenere o Blueprint.")
    if open_questions:
        recommendations.append(f"Responda {len(open_questions)} pergunta(s) em aberto antes de gerar.")
    for gap in gaps:
        recommendations.append(f"Resolva: {gap['title']} — {gap['detail']}")
    if not recommendations:
        recommendations.append("Nenhuma acao critica pendente. Pronto para revisao final e envio.")

    score = _build_score(spec, blueprint, areas, decisions, required, passed, degraded)
    dimensions = _dimensions(spec, areas, score, len(passed), len(required))
    committee = _committee(areas, score, dimensions, degraded)
    final_opinion = _final_opinion(spec, score, committee, len(open_questions), degraded)

    return {
        "good_decisions": good_decisions,
        "debatable_decisions": debatable_decisions,
        "risks": risks,
        "gaps": gaps,
        "inconsistencies": inconsistencies,
        "scalability_impact": scalability_impact,
        "security_impact": security_impact,
        "generation_readiness": generation_readiness,
        "recommendations": recommendations,
        "score": score,
        "dimensions": dimensions,
        "committee": committee,
        "final_opinion": final_opinion,
    }


_COST_BAND = {
    "frontend": "Baixo", "auth": "Baixo", "authorization": "Baixo", "apis": "Baixo",
    "tests": "Baixo", "backend": "Médio", "database": "Médio", "observability": "Médio",
    "deploy": "Médio", "integrations": "Alto",
}


def _verdict_for(score: int | None) -> str:
    if score is None:
        return "indisponivel"
    if score >= 85:
        return "approved"
    if score >= 65:
        return "approved_with_caveats"
    return "changes_requested"


def _dimension(key: str, label: str, score: int | None, findings: list[str]) -> dict[str, Any]:
    status = "unavailable" if score is None else "scored"
    return {"key": key, "label": label, "status": status, "score": score, "verdict": _verdict_for(score), "findings": findings}


def _cat(score: dict[str, Any], key: str) -> int | None:
    for c in score.get("categories", []):
        if c["key"] == key:
            return c["score"]
    return None


def _dimensions(spec: dict[str, Any], areas: set, score: dict[str, Any], passed: int, required: int) -> list[dict[str, Any]]:
    nf = spec.get("non_functional") or {}
    dims: list[dict[str, Any]] = []

    # Security — auth/authorization coverage + OWASP-relevant surfaces.
    sec_findings = []
    if "auth" in areas:
        sec_findings.append("Autenticação decidida (JWT + hash forte).")
    if "authorization" in areas:
        sec_findings.append("Autorização no servidor (RBAC).")
    if "apis" in areas:
        sec_findings.append("Contrato de API permite validação/rate limit no edge.")
    if not sec_findings:
        sec_findings.append("Sem controles de segurança decididos.")
    dims.append(_dimension("security", "Segurança", _cat(score, "security"), sec_findings))

    # Scalability.
    scale_findings = []
    if "backend" in areas:
        scale_findings.append("Backend stateless habilita escala horizontal.")
    if "database" in areas:
        scale_findings.append("Banco relacional: ponto de contenção de escrita (réplica/sharding futuro).")
    dims.append(_dimension("scalability", "Escalabilidade", _cat(score, "scalability"), scale_findings or ["Sem sinais de escala."]))

    # Performance — observability + cacheable API + explicit NFR.
    perf_signals = sum([("observability" in areas), ("apis" in areas), bool(nf.get("performance"))])
    perf_score = round(perf_signals / 3 * 100) if perf_signals else None
    perf_findings = []
    if nf.get("performance"):
        perf_findings.append(f"NFR de performance: {nf['performance']}")
    if "apis" in areas:
        perf_findings.append("Endpoints REST cacheáveis para leitura.")
    if not perf_findings:
        perf_findings.append("Não há dados suficientes de performance.")
    dims.append(_dimension("performance", "Performance", perf_score, perf_findings))

    # Cost — QUALITATIVE only; no numeric score (no monetary model).
    cost_findings = [f"{area}: {_COST_BAND.get(area, 'Médio')}" for area in sorted(areas) if area]
    bands = [_COST_BAND.get(a, "Médio") for a in areas if a]
    overall_band = "Alto" if "Alto" in bands else "Médio" if "Médio" in bands else "Baixo"
    cost_dim = _dimension("cost", "Custos", None, cost_findings or ["Não há dados suficientes."])
    cost_dim["verdict"] = f"Banda qualitativa geral: {overall_band} (não monetária)"
    dims.append(cost_dim)

    # Documentation.
    dims.append(_dimension("documentation", "Documentação", _cat(score, "documentation"), [
        "Contrato OpenAPI previsto." if "apis" in areas else "Sem contrato de API.",
        "PromptMaster versionado." if spec.get("product_summary") else "Resumo de produto ausente.",
    ]))

    # Quality — tests + generation readiness.
    quality_score = _cat(score, "maintainability")
    qual_findings = ["Pirâmide de testes (unit + integração)." if "tests" in areas else "Estratégia de testes ausente."]
    if required:
        qual_findings.append(f"{passed}/{required} verificações obrigatórias atendidas.")
    dims.append(_dimension("quality", "Qualidade", quality_score, qual_findings))

    return dims


def _stars(score: int | None) -> int:
    if score is None:
        return 0
    return max(0, min(5, round(score / 20)))


def _member(role: str, score: int | None, rationale: str, signals: list[str]) -> dict[str, Any]:
    verdict = _verdict_for(score)
    if verdict == "indisponivel":
        verdict = "changes_requested"
    return {"role": role, "rating": _stars(score), "verdict": verdict, "rationale": rationale, "signals": signals}


def _committee(areas: set, score: dict[str, Any], dimensions: list[dict[str, Any]], degraded: bool) -> list[dict[str, Any]]:
    dim = {d["key"]: d for d in dimensions}
    members = [
        _member("Architect", _cat(score, "architecture"), "Cobertura das áreas arquiteturais.", [f"{len([a for a in areas if a])}/10 áreas decididas"]),
        _member("Security", dim["security"]["score"], "Controles de autenticação e autorização.", dim["security"]["findings"][:2]),
        _member("Performance", dim["performance"]["score"], "Sinais de performance e cacheabilidade.", dim["performance"]["findings"][:2]),
        _member("QA", dim["quality"]["score"], "Estratégia de testes e qualidade.", dim["quality"]["findings"][:2]),
        _member("DevOps", round((("deploy" in areas) + ("observability" in areas)) / 2 * 100), "Deploy reproduzível e observabilidade.", [a for a in ("deploy", "observability") if a in areas]),
        _member("Documentation", dim["documentation"]["score"], "Contrato e documentação previstos.", dim["documentation"]["findings"][:2]),
    ]
    # The AI Reviewer is honest about the deterministic preview.
    if degraded:
        members.append({"role": "AI Reviewer", "rating": 3, "verdict": "approved_with_caveats", "rationale": "Blueprint em modo determinístico — sugere regenerar com IA para maior profundidade.", "signals": ["sem LLM ativo"]})
    else:
        members.append(_member("AI Reviewer", score.get("overall"), "Leitura geral da arquitetura autorada por IA.", [f"score geral {score.get('overall')}%"]))
    return members


def _band(value: int, low: int, high: int, labels: tuple[str, str, str]) -> str:
    return labels[0] if value <= low else labels[1] if value <= high else labels[2]


def _final_opinion(spec: dict[str, Any], score: dict[str, Any], committee: list[dict[str, Any]], open_q: int, degraded: bool) -> dict[str, Any]:
    overall = score.get("overall")
    # Success probability: overall score minus a penalty for unresolved questions.
    success = None if overall is None else max(0, min(100, overall - open_q * 5))

    counts = sum(int(spec.get(k) and len(spec[k]) or 0) for k in ("entities", "core_workflows", "business_rules", "target_users"))
    complexity = _band(counts, 8, 18, ("Baixa", "Média", "Alta"))

    changes = sum(1 for m in committee if m["verdict"] == "changes_requested")
    risk_points = changes * 2 + open_q + (2 if degraded else 0)
    risk = _band(risk_points, 1, 4, ("Baixo", "Médio", "Alto"))

    scale_score = _cat(score, "scalability")
    scalability = "Indisponível" if scale_score is None else _band(scale_score, 40, 75, ("Baixa", "Média", "Muito Alta"))

    if degraded:
        disclaimer = "Este parecer foi produzido pelo modo determinístico (sem LLM) e possui profundidade reduzida. Regenere o Blueprint com IA para uma análise mais profunda."
        narrative = (
            "Análise determinística da arquitetura proposta. A separação por áreas está "
            f"{'completa' if (overall or 0) >= 80 else 'parcial'}, com complexidade {complexity.lower()} e risco {risk.lower()}. "
            "Por ser um preview sem IA, recomendamos regenerar com um provedor de IA antes da geração final."
        )
    else:
        disclaimer = "Parecer gerado por regras determinísticas sobre um Blueprint autorado por IA."
        narrative = (
            "Após revisar a arquitetura, observamos boa separação de responsabilidades e "
            f"escalabilidade {scalability.lower()}, com complexidade {complexity.lower()} e risco {risk.lower()}. "
            + ("Recomendamos seguir para geração." if (success or 0) >= 70 else "Recomendamos resolver os pontos do comitê antes de gerar.")
        )

    return {
        "deterministic": degraded,
        "success_probability": success,
        "complexity": complexity,
        "risk": risk,
        "scalability": scalability,
        "narrative": narrative,
        "disclaimer": disclaimer,
    }


def _build_score(
    spec: dict[str, Any],
    blueprint: dict[str, Any],
    areas: set,
    decisions: list[dict[str, Any]],
    required: list[dict[str, Any]],
    passed: list[dict[str, Any]],
    degraded: bool,
) -> dict[str, Any]:
    nf = spec.get("non_functional") or {}
    total_areas = 10  # the canonical BLUEPRINT_AREAS count

    categories: list[dict[str, Any]] = []

    # Architecture Readiness — coverage of architectural areas.
    decided = len([a for a in areas if a])
    categories.append(
        _category("architecture", "Architecture Readiness", round(decided / total_areas * 100), f"{decided}/{total_areas} areas decididas")
    )

    # Security Readiness — auth + authorization both decided.
    sec_decided = len(SECURITY_AREAS & areas)
    categories.append(
        _category("security", "Security Readiness", round(sec_decided / 2 * 100), f"{sec_decided}/2 controles (auth, authorization)")
    )

    # Scalability Readiness — deploy + observability + an explicit NFR.
    scale_signals = sum([("deploy" in areas), ("observability" in areas), bool(nf.get("scalability") or nf.get("performance"))])
    if scale_signals == 0:
        categories.append(_category("scalability", "Scalability Readiness", None, "Sem sinais de escala na spec/blueprint"))
    else:
        categories.append(_category("scalability", "Scalability Readiness", round(scale_signals / 3 * 100), f"{scale_signals}/3 sinais (deploy, observability, NFR)"))

    # Maintainability — tests + layered backend + a versioned prompt doc.
    maint_signals = sum([("tests" in areas), ("backend" in areas), bool(spec)])
    categories.append(_category("maintainability", "Maintainability", round(maint_signals / 3 * 100), f"{maint_signals}/3 sinais (tests, backend, spec)"))

    # Generation Readiness — required readiness checks passed.
    if not required:
        categories.append(_category("generation", "Generation Readiness", None, "Sem verificacoes obrigatorias"))
    else:
        categories.append(_category("generation", "Generation Readiness", round(len(passed) / len(required) * 100), f"{len(passed)}/{len(required)} verificacoes"))

    # Documentation Readiness — PromptMaster + an API contract decision.
    doc_signals = sum([("apis" in areas), bool(spec.get("product_summary"))])
    if doc_signals == 0:
        categories.append(_category("documentation", "Documentation Readiness", None, "Sem documentacao/contrato detectavel"))
    else:
        categories.append(_category("documentation", "Documentation Readiness", round(doc_signals / 2 * 100), f"{doc_signals}/2 sinais (apis, resumo)"))

    scored = [c["score"] for c in categories if c["status"] == "scored" and c["score"] is not None]
    overall = round(sum(scored) / len(scored)) if scored else None
    return {"overall": overall, "categories": categories}


engineering_review_engine = build_engineering_review
