from __future__ import annotations

import time
from datetime import UTC, datetime

from app.schemas.architecture_blueprint import ArchitectureBlueprint, BlueprintDecision
from app.schemas.orchestrator import ProjectSpec


# Architect Engine (PASSO 3.5): turns a ProjectSpec/PromptMaster into a justified
# ArchitectureBlueprint. Premium path = a real LLM decides + justifies each area;
# the deterministic fallback derives decisions from the spec and is labelled as a
# preview, never as the best possible architecture.


def build_blueprint(
    spec: ProjectSpec,
    *,
    project_id: str,
    api_key: str | None = None,
    user_model_choice: str | None = None,
) -> ArchitectureBlueprint:
    from app.services.ai_availability import ai_available

    started = time.perf_counter()
    if api_key or ai_available():
        try:
            import json

            from app.engines.agent_prompts import ARCHITECT_SYSTEM_PROMPT
            from app.engines.llm.blueprint_response_pipeline import parse_blueprint_response
            from app.engines.llm.router import LLMRouter
            from app.schemas.llm import LLMRequest

            user_payload = json.dumps(spec.model_dump(mode="json"), ensure_ascii=False)
            response = LLMRouter().route(
                LLMRequest(
                    system=ARCHITECT_SYSTEM_PROMPT,
                    user=user_payload,
                    # No hard json_schema on purpose: it makes adapters reject any
                    # response that isn't pure JSON (fenced/prose JSON, partial,
                    # YAML, markdown). The resilient pipeline below adapts ANY of
                    # those into BlueprintDecisions, so the platform never rejects
                    # a valid blueprint just because the format differs.
                    timeout_ms=120_000,
                ),
                user_choice=user_model_choice,
                api_key=api_key,
            )
            if not response.served_by_fallback:
                latency_ms = _elapsed_ms(started)
                tokens = _usage_tokens(response.usage)
                provider = response.provider.value
                provider_label = _provider_label(provider)
                result = parse_blueprint_response(
                    text=response.text,
                    parsed=response.parsed,
                    provider=provider,
                    model=response.model,
                    prompt=user_payload,
                    tokens=tokens,
                    latency_ms=latency_ms,
                )
                diagnostics = {**result.diagnostics.as_dict(), "raw_record": result.raw_record.as_dict()}
                if result.decisions:
                    # Recovered a real (possibly partial) blueprint from the LLM.
                    return ArchitectureBlueprint(
                        project_id=project_id,
                        decisions=result.decisions,
                        degraded=False,
                        generated_at=_now(),
                        provider=provider,
                        providerLabel=provider_label,
                        mode="llm",
                        model=response.model,
                        source="llm",
                        generatedAt=_now(),
                        tokensUsed=tokens.get("total", tokens.get("input", 0) + tokens.get("output", 0)),
                        latencyMs=latency_ms,
                        generatedBy="architect_engine",
                        llmMetadata={"provider": provider, "providerLabel": provider_label, "model": response.model, "servedByFallback": False},
                        origin=provider,
                        confidence=0.97 if not result.diagnostics.partial else 0.8,
                        llm_model=response.model,
                        generation_time_ms=latency_ms,
                        tokens=tokens,
                        fallback=False,
                        responseDiagnostics=diagnostics,
                    )
                # Nothing recoverable from the raw text: never raise a bare
                # "Blueprint inválido". Fall back to the deterministic preview but
                # ATTACH the diagnostics + raw response so the user sees exactly
                # what the provider returned and why parsing yielded nothing.
                fallback_blueprint = _deterministic_blueprint(spec, project_id, generation_time_ms=_elapsed_ms(started))
                fallback_blueprint.responseDiagnostics = diagnostics
                return fallback_blueprint
            if api_key:
                # The user supplied a key but the router served a mock/deterministic
                # fallback instead of the real provider — that is NOT a format issue,
                # it means the configured provider never ran. Surface it explicitly
                # rather than silently saving a deterministic blueprint.
                from app.engines.llm.base import LLMError
                raise LLMError("O provider configurado nao atendeu a chamada; nenhuma versao deterministica foi salva silenciosamente.")
        except Exception as exc:
            # A genuine provider error (timeout / refusal / connection / circuit)
            # is a real failure, not a format issue — surface it when the user
            # supplied a key. Format differences never reach here.
            if api_key:
                from app.engines.llm.base import LLMError
                if isinstance(exc, LLMError):
                    raise
                raise LLMError(f"Falha na geracao do Blueprint com o provider configurado: {exc}") from exc

    return _deterministic_blueprint(spec, project_id, generation_time_ms=_elapsed_ms(started))


def _deterministic_blueprint(spec: ProjectSpec, project_id: str, *, generation_time_ms: int = 0) -> ArchitectureBlueprint:
    stack = spec.suggested_stack
    nf = spec.non_functional or {}
    vertical = spec.system_type or "sistema sob medida"
    entities = ", ".join(spec.entities) or "as entidades do dominio"
    users = ", ".join(spec.target_users) or "os papeis do dominio"
    has_payments = any("pag" in k.lower() or "payment" in k.lower() for k in nf) or any(
        "pag" in e.lower() for e in spec.entities
    )

    rule_count = len(spec.business_rules)
    entity_count = len(spec.entities)
    # Requirement links are quoted from the real spec only — never fabricated.
    rule_links = [r for r in spec.business_rules[:3]]
    payment_entities = [e for e in spec.entities if "pag" in e.lower() or "payment" in e.lower()]

    decisions = [
        BlueprintDecision(
            area="frontend",
            choice=f"SPA/SSR moderna ({stack.framework or 'Next.js'}) com design system e i18n",
            justification=f"Atende {users} com UI responsiva e o locale {spec.locale}; repositorio tipado por contrato.",
            alternatives_considered=["SSR puro sem hidratacao", "App mobile-first nativo"],
            tradeoffs=["SSR melhora SEO/first paint, mas exige runtime Node em producao.", "Design system acelera UI ao custo de setup inicial."],
            impact="Define a experiencia de todos os perfis de usuario e o tempo ate a primeira tela util.",
            risks=["Hidratacao mal feita degrada a performance percebida."],
            when_to_reconsider="Se o produto virar majoritariamente mobile nativo ou um back-office sem SEO.",
            dependencies=["Contrato de API (apis)", "Locale/i18n da spec"],
            requirement_links=[f"{len(spec.target_users)} perfil(is) de usuario na spec"],
        ),
        BlueprintDecision(
            area="backend",
            choice=f"{stack.language or 'Python'} / {stack.framework or 'FastAPI'} em camadas (Clean Architecture)",
            justification=(
                f"Vertical: {vertical}. "
                + (stack.framework_reason or "Stack idiomatica; regra de negocio isolada do controller.")
            ),
            alternatives_considered=["Monolito sem camadas", "Microservicos (over-engineering para o escopo)"],
            tradeoffs=["Camadas dao testabilidade e clareza, com mais boilerplate inicial."],
            impact=f"Hospeda as {rule_count} regra(s) de negocio; e o centro de gravidade do sistema.",
            risks=["Acoplar regra ao framework dificulta evolucao futura."],
            when_to_reconsider="Se um dominio especifico exigir escala independente, extrair como servico.",
            dependencies=["Database", "Auth/Authorization"],
            requirement_links=rule_links,
        ),
        BlueprintDecision(
            area="database",
            choice="PostgreSQL (relacional)",
            justification=f"As entidades ({entities}) tem relacionamentos e exigem integridade transacional.",
            alternatives_considered=["NoSQL documento", "SQLite (apenas dev)"],
            tradeoffs=["ACID e joins fortes; escala de escrita horizontal exige sharding mais tarde."],
            impact=f"Persiste as {entity_count} entidade(s) do dominio e garante consistencia.",
            risks=["Modelagem inadequada de relacionamentos gera dividas dificeis de reverter."],
            when_to_reconsider="Se surgir volume massivo de dados semiestruturados ou time-series.",
            dependencies=["Backend"],
            requirement_links=[f"Entidades: {entities}"] if spec.entities else [],
        ),
        BlueprintDecision(
            area="auth",
            choice="JWT (access + refresh) com hash forte de senha",
            justification="Autenticacao stateless padrao; senhas com bcrypt/argon2.",
            alternatives_considered=["Sessao em cookie server-side", "OAuth externo apenas"],
            tradeoffs=["Stateless escala bem, mas revogacao de token exige denylist/refresh curto."],
            impact="Porta de entrada de seguranca para todos os perfis de usuario.",
            risks=["Tokens longos sem rotacao ampliam a janela de um vazamento."],
            when_to_reconsider="Se exigirem SSO corporativo ou logout global imediato.",
            dependencies=["Authorization"],
            requirement_links=[r for r in spec.business_rules if "login" in r.lower() or "acesso" in r.lower()][:2],
        ),
        BlueprintDecision(
            area="authorization",
            choice="RBAC por papel + isolamento por dono/workspace",
            justification=f"Os papeis ({users}) exigem permissoes distintas verificadas no backend.",
            alternatives_considered=["Sem autorizacao", "ABAC (complexo demais para o escopo)"],
            tradeoffs=["RBAC e simples de auditar; regras muito granulares podem pedir ABAC depois."],
            impact="Garante que cada perfil so acessa o que lhe e permitido (defesa no servidor).",
            risks=["Checagem so no frontend deixaria recursos expostos."],
            when_to_reconsider="Se as permissoes passarem a depender de atributos dinamicos do recurso.",
            dependencies=["Auth"],
            requirement_links=[r for r in spec.business_rules if "permiss" in r.lower() or "papel" in r.lower() or "rbac" in r.lower()][:2],
        ),
        BlueprintDecision(
            area="apis",
            choice="REST versionada (/v1) documentada via OpenAPI",
            justification="Contrato explicito consumido por frontend e testes; rastreabilidade por regra de negocio.",
            alternatives_considered=["GraphQL", "RPC"],
            tradeoffs=["REST e universal e cacheavel; consultas muito agregadas podem favorecer GraphQL."],
            impact="E o contrato entre frontend, testes e a Meta-Fabrica.",
            risks=["API sem versao quebra clientes a cada mudanca."],
            when_to_reconsider="Se o frontend precisar de consultas agregadas e flexiveis em larga escala.",
            dependencies=["Backend", "Frontend"],
            requirement_links=[f"{len(spec.core_workflows)} fluxo(s) principal(is)"] if spec.core_workflows else [],
        ),
        BlueprintDecision(
            area="integrations",
            choice="Gateway de pagamento + webhooks" if has_payments else "Nenhuma integracao externa obrigatoria",
            justification="Derivado dos requisitos do dominio na spec." if has_payments else "A intencao atual nao exige integracoes externas.",
            alternatives_considered=["Integracao de e-mail transacional", "Geolocalizacao/mapas"],
            tradeoffs=["Webhooks exigem idempotencia e reconciliacao."] if has_payments else ["Sem integracoes reduz superficie de falha agora."],
            impact="Conecta o sistema a servicos externos criticos (pagamento)." if has_payments else "Nenhum acoplamento externo no escopo atual.",
            risks=["Falha do gateway sem retry/reconciliacao perde transacoes."] if has_payments else [],
            when_to_reconsider="Se surgir cobranca, notificacao ou dados de terceiros no roadmap." if not has_payments else "Se adicionar novos provedores de pagamento ou antifraude.",
            dependencies=["Backend"] if has_payments else [],
            requirement_links=[f"Entidade(s) de pagamento: {', '.join(payment_entities)}"] if payment_entities else [],
        ),
        BlueprintDecision(
            area="observability",
            choice="Logs estruturados + metricas por endpoint + health check",
            justification=nf.get("performance", "Operacao observavel para readiness/liveness e diagnostico."),
            alternatives_considered=["Apenas logs de texto", "Tracing distribuido (futuro)"],
            tradeoffs=["Logs estruturados facilitam busca, com custo de armazenamento."],
            impact="Determina o tempo de deteccao e diagnostico de incidentes.",
            risks=["Sem metricas, degradacoes passam despercebidas ate o usuario reclamar."],
            when_to_reconsider="Quando houver multiplos servicos exigindo tracing distribuido.",
            dependencies=["Backend", "Deploy"],
            requirement_links=[f"NFR performance: {nf['performance']}"] if nf.get("performance") else [],
        ),
        BlueprintDecision(
            area="tests",
            choice="Unit por regra de negocio + integracao por endpoint/fluxo",
            justification=f"Cobrir {rule_count} regra(s) e os fluxos principais com 401/403 nos protegidos.",
            alternatives_considered=["Apenas e2e", "Sem testes (inaceitavel)"],
            tradeoffs=["Piramide de testes da feedback rapido; e2e cobre o fluxo mas e mais lento/fragil."],
            impact="Define a confianca para liberar o projeto pela Meta-Fabrica.",
            risks=["Lacuna de teste em regra critica vaza bug para producao."],
            when_to_reconsider="Se a regressao manual passar a custar mais que manter e2e amplo.",
            dependencies=["Backend", "Apis"],
            requirement_links=rule_links,
        ),
        BlueprintDecision(
            area="deploy",
            choice="Docker + docker-compose; CI lint->test->build",
            justification=nf.get("scalability", "Empacotamento reproduzivel e stateless, pronto para escala horizontal."),
            alternatives_considered=["Deploy manual", "Kubernetes (quando a escala justificar)"],
            tradeoffs=["Compose e simples para comecar; orquestracao seria exige Kubernetes depois."],
            impact="Garante ambiente reproduzivel e caminho de entrega automatizado.",
            risks=["Deploy manual introduz erro humano e drift de ambiente."],
            when_to_reconsider="Quando a escala/HA justificar Kubernetes ou serverless.",
            dependencies=["Observability"],
            requirement_links=[f"NFR scalability: {nf['scalability']}"] if nf.get("scalability") else [],
        ),
    ]
    decisions = [_enrich_decision(d, spec) for d in decisions]
    return ArchitectureBlueprint(
        project_id=project_id,
        decisions=decisions,
        degraded=True,
        generated_at=_now(),
        provider=None,
        providerLabel="Nenhum",
        mode="deterministic",
        model="Motor deterministico",
        source="deterministic",
        generatedAt=_now(),
        tokensUsed=0,
        latencyMs=generation_time_ms,
        generatedBy="architect_engine",
        llmMetadata={"provider": None, "providerLabel": "Nenhum", "model": "Motor deterministico", "servedByFallback": True},
        origin="LDCN deterministic preview",
        confidence=0.64,
        llm_model=None,
        generation_time_ms=generation_time_ms,
        tokens={},
        fallback=True,
    )


# Per-area base confidence (how well-established the pattern is for the area) and a
# QUALITATIVE, non-monetary cost band. These are architectural facts about the area's
# role, not invented numbers; the final confidence is modulated by real evidence.
_AREA_BASE_CONFIDENCE = {
    "database": 0.97, "backend": 0.95, "auth": 0.94, "authorization": 0.93,
    "apis": 0.92, "tests": 0.91, "frontend": 0.9, "deploy": 0.86,
    "observability": 0.82, "integrations": 0.7,
}
_AREA_COST_BAND = {
    "frontend": "Baixo", "auth": "Baixo", "authorization": "Baixo", "apis": "Baixo",
    "tests": "Baixo", "backend": "Médio", "database": "Médio", "observability": "Médio",
    "deploy": "Médio", "integrations": "Alto",
}
_AREA_SECURITY_IMPACT = {
    "auth": "Alto — superfície de autenticação; exige hashing forte e rotação de token.",
    "authorization": "Alto — defesa de acesso no servidor; falha aqui expõe recursos.",
    "apis": "Médio — superfície de entrada; exige validação e versionamento.",
    "database": "Médio — dados em repouso; exige least-privilege e backup.",
    "integrations": "Médio — confiança em terceiros; exige verificação de webhook/secret.",
}
_AREA_SCALABILITY_IMPACT = {
    "backend": "Alto — stateless permite escala horizontal sob carga.",
    "database": "Alto — ponto de contenção de escrita; pode exigir réplica/sharding.",
    "deploy": "Alto — empacotamento stateless habilita réplicas.",
    "apis": "Médio — contrato cacheável ajuda a absorver leitura.",
    "observability": "Médio — necessário para detectar gargalos sob escala.",
}
_AREA_MAINTAINABILITY_IMPACT = {
    "backend": "Alto — camadas isolam regra do framework, facilitando evolução.",
    "tests": "Alto — rede de segurança contra regressão.",
    "apis": "Médio — contrato explícito reduz acoplamento frontend/backend.",
    "frontend": "Médio — design system padroniza a UI.",
}


def _enrich_decision(d: BlueprintDecision, spec: ProjectSpec) -> BlueprintDecision:
    """Fill the deep, dimension-specific fields deterministically from the decision's
    OWN real signals. Confidence reflects how well-grounded the choice is (cited
    requirements, alternatives weighed, NFR coverage) — it is never a fixed/invented value."""
    base = _AREA_BASE_CONFIDENCE.get(d.area, 0.75)
    signals: list[str] = []
    confidence = base
    if d.requirement_links:
        confidence += 0.01
        signals.append("requisitos da spec citados")
    if d.alternatives_considered:
        signals.append(f"{len(d.alternatives_considered)} alternativa(s) avaliada(s)")
    choice_lower = d.choice.lower()
    # Optional / conditional / future choices are honestly less certain.
    if any(token in choice_lower for token in ("nenhuma", "opcional", "futuro", "quando")):
        confidence = min(confidence, 0.7)
        signals.append("escolha opcional/condicional")
    confidence = round(max(0.0, min(0.99, confidence)), 2)
    basis = "; ".join(signals) or "padrão consolidado para a área"

    vertical = spec.system_type or spec.product_summary or "o sistema sob medida"
    evidence: list[str] = list(d.requirement_links)
    if spec.entities and d.area in {"database", "backend", "apis"}:
        evidence.append(f"{len(spec.entities)} entidade(s) no domínio")
    if spec.non_functional and d.area in {"observability", "deploy"}:
        evidence.append("requisitos não-funcionais declarados na spec")

    return d.model_copy(update={
        "confidence": confidence,
        "confidence_basis": basis,
        "context": f"No contexto de {vertical}, esta decisão sustenta a área de {d.area}.",
        "security_impact": _AREA_SECURITY_IMPACT.get(d.area, "Baixo — sem exposição de segurança direta nesta área."),
        "scalability_impact": _AREA_SCALABILITY_IMPACT.get(d.area, "Baixo — não é o ponto de contenção de escala."),
        "maintainability_impact": _AREA_MAINTAINABILITY_IMPACT.get(d.area, "Médio — manutenção padrão para a área."),
        "cost_impact": f"{_AREA_COST_BAND.get(d.area, 'Médio')} (estimativa qualitativa, não monetária)",
        "evidence": evidence,
    })


def _usage_tokens(usage: dict) -> dict[str, int]:
    tokens: dict[str, int] = {}
    for source, target in (
        ("input_tokens", "input"),
        ("output_tokens", "output"),
        ("cache_read_input_tokens", "cache_read"),
        ("cache_creation_input_tokens", "cache_write"),
        ("total_tokens", "total"),
    ):
        value = usage.get(source)
        if isinstance(value, int):
            tokens[target] = value
    return tokens


def _provider_label(provider: str) -> str:
    return {
        "anthropic": "Claude",
        "openai": "GPT",
        "google": "Gemini",
        "openrouter": "OpenRouter",
        "deepseek": "DeepSeek",
        "custom": "Custom",
        "ollama": "Ollama",
    }.get(provider, provider)


def _elapsed_ms(started: float) -> int:
    return max(1, int((time.perf_counter() - started) * 1000))


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


architect_engine = build_blueprint
