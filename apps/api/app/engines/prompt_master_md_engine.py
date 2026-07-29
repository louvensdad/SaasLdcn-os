from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any

from app.schemas.orchestrator import ProjectSpec


# Deterministic PromptMaster.md generator for the AI Project Room.
#
# It turns a ProjectSpec (already produced by the orchestrator — natural language
# in, structured spec out) into the professional PromptMaster.md document the
# product vision requires, covering every mandatory section.
#
# This engine NEVER calls an LLM: the model already ran upstream in the
# orchestrator. When that upstream run was served by the deterministic mock
# (degraded=True), we prepend an explicit "Modo Determinístico" banner so the
# document never pretends a real model authored it.

PROMPT_MASTER_MD_ENGINE_VERSION = "1.0.0"

# (anchor id, human title) — the contract of mandatory sections, in order.
SECTION_ORDER: list[tuple[str, str]] = [
    ("visao-geral", "Visão Geral"),
    ("objetivo", "Objetivo do Projeto"),
    ("problema", "Problema Resolvido"),
    ("publico-alvo", "Público-Alvo"),
    ("tipo-de-sistema", "Tipo de Sistema"),
    ("modulos", "Módulos"),
    ("usuarios", "Usuários"),
    ("permissoes", "Permissões"),
    ("regras-de-negocio", "Regras de Negócio"),
    ("fluxos", "Fluxos Principais"),
    ("entidades", "Entidades"),
    ("campos", "Campos"),
    ("integracoes", "Integrações"),
    ("banco-de-dados", "Banco de Dados"),
    ("backend", "Backend"),
    ("frontend", "Frontend"),
    ("apis", "APIs"),
    ("seguranca", "Segurança"),
    ("autenticacao", "Autenticação"),
    ("observabilidade", "Observabilidade"),
    ("auditoria", "Auditoria"),
    ("testes", "Testes"),
    ("documentacao", "Documentação"),
    ("responsividade", "Responsividade"),
    ("internacionalizacao", "Internacionalização"),
    ("escalabilidade", "Escalabilidade"),
    ("criterios-de-aceite", "Critérios de Aceite"),
    ("estrutura-de-pastas", "Estrutura de Pastas"),
    ("arquivos-esperados", "Arquivos Esperados"),
    ("roadmap", "Roadmap"),
    ("regras-de-geracao", "Regras de Geração"),
    ("o-que-nao-gerar", "O que NÃO deve ser gerado"),
]

DETERMINISTIC_BANNER = (
    "> ⚠️ **Modo Determinístico** — este PromptMaster.md foi montado pelo motor "
    "determinístico do LDCN OS (nenhum LLM real estava disponível nesta execução). "
    "O conteúdo é estruturalmente completo, mas revise as inferências antes de aprovar."
)


def build_prompt_master_md(
    spec: ProjectSpec,
    *,
    degraded: bool,
    version: int,
) -> dict[str, Any]:
    """Build the full PromptMaster.md document from a ProjectSpec.

    Returns a dict with the compiled markdown, the section index (for trace / UI),
    the version number, a timestamp and the degraded flag. Pure and side-effect
    free — persistence is the repository's job.
    """
    project_name = _project_name(spec)
    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()

    bodies = _section_bodies(spec, project_name)
    blocks: list[str] = [f"# PromptMaster — {project_name}"]
    if degraded:
        blocks.append(DETERMINISTIC_BANNER)
    blocks.append(
        f"_Gerado em {generated_at} · versão {version} · "
        f"modo {'determinístico' if degraded else 'IA'} · locale {spec.locale}_"
    )
    for anchor, title in SECTION_ORDER:
        blocks.append(f"## {title}\n\n{bodies[anchor].strip()}")

    markdown = "\n\n".join(blocks).strip() + "\n"
    return {
        "markdown": markdown,
        "sections": [{"id": anchor, "title": title} for anchor, title in SECTION_ORDER],
        "version": version,
        "engine_version": PROMPT_MASTER_MD_ENGINE_VERSION,
        "generated_at": generated_at,
        "degraded": degraded,
        "project_name": project_name,
    }


# --------------------------------------------------------------------------- #
# Section builders — each derives from ProjectSpec fields, never invents stack.
# --------------------------------------------------------------------------- #

def _section_bodies(spec: ProjectSpec, project_name: str) -> dict[str, str]:
    users = spec.target_users or ["Administrador", "Usuário"]
    entities = spec.entities or ["Registro"]
    workflows = spec.core_workflows or ["Usuário cria, consulta e gerencia registros."]
    rules = spec.business_rules or ["Apenas usuários autenticados alteram registros protegidos."]
    stack = spec.suggested_stack
    nf = spec.non_functional or {}
    system_type = _system_type(spec)

    return {
        "visao-geral": (
            f"{spec.product_summary or spec.raw_intent or project_name}\n\n"
            f"Ideia original do usuário:\n\n> {spec.raw_intent or '(não informada)'}"
        ),
        "objetivo": (
            f"Entregar **{project_name}**, um {system_type} que resolve a necessidade "
            "descrita pelo usuário com qualidade profissional, sem exigir que ele atue "
            "como arquiteto ou desenvolvedor."
        ),
        "problema": (
            "O usuário precisa de uma solução de software, mas não domina modelagem, "
            "arquitetura ou stack. Este projeto traduz a intenção em uma especificação "
            "executável, preservando as regras de negócio como prioridade zero."
        ),
        "publico-alvo": _bullets(users, prefix="Perfil: "),
        "tipo-de-sistema": (
            f"**{system_type}**\n\n"
            f"Confiança da inferência: {round(spec.confidence * 100)}%."
        ),
        "modulos": _bullets(_modules(entities, workflows)),
        "usuarios": _bullets(users),
        "permissoes": _bullets(_permissions(users)),
        "regras-de-negocio": _bullets(rules),
        "fluxos": _numbered(workflows),
        "entidades": _bullets(entities),
        "campos": _entity_fields(entities),
        "integracoes": _bullets(_integrations(spec)),
        "banco-de-dados": (
            "Banco relacional como padrão (PostgreSQL recomendado em produção; SQLite "
            "para desenvolvimento). Uma tabela/coleção por entidade, com chaves primárias "
            "UUID, timestamps `created_at`/`updated_at` e índices nas chaves de busca.\n\n"
            f"Entidades persistidas: {', '.join(entities)}."
        ),
        "backend": _backend_body(stack, nf),
        "frontend": _frontend_body(stack, spec.locale),
        "apis": (
            "API REST versionada (`/v1`). Para cada entidade: endpoints de listagem, "
            "criação, leitura, atualização e remoção, todos protegidos por autenticação "
            "e validação de entrada. Contrato documentado via OpenAPI."
        ),
        "seguranca": _bullets(_security(nf)),
        "autenticacao": (
            "Autenticação via tokens JWT (access + refresh). Senhas com hash forte "
            "(bcrypt/argon2). RBAC por papel de usuário. Isolamento por dono/workspace."
        ),
        "observabilidade": _bullets([
            "Logs estruturados com correlação de requisição.",
            "Métricas de latência e taxa de erro por endpoint.",
            "Health check (`/v1/health`) para readiness/liveness.",
        ]),
        "auditoria": (
            "Trilha de auditoria para toda mutação sensível (quem, o quê, quando), "
            "sem registrar segredos ou dados pessoais em texto puro."
        ),
        "testes": _bullets([
            "Testes unitários para cada regra de negócio.",
            "Testes de integração para cada endpoint e fluxo principal.",
            "Cobertura de caminhos de autenticação e autorização (401/403).",
        ]),
        "documentacao": _bullets([
            "README com setup, execução e variáveis de ambiente.",
            "Documentação de API (OpenAPI/Swagger).",
            "Matriz de rastreabilidade regra → use-case → teste.",
        ]),
        "responsividade": (
            "Interface responsiva (mobile-first), acessível (WCAG AA) e com estados de "
            "carregamento, vazio e erro tratados."
        ),
        "internacionalizacao": (
            f"Idioma principal: **{spec.locale}**. Frontend com biblioteca i18n e "
            f"dicionários populados (no mínimo {spec.locale} e en-US). Strings de UI, "
            "mensagens e documentação traduzidas; identificadores de código em inglês."
        ),
        "escalabilidade": (
            f"{nf.get('scalability', 'Serviços stateless, prontos para escala horizontal por réplicas.')} "
            "Cache e paginação onde houver listagens grandes."
        ),
        "criterios-de-aceite": _numbered(_acceptance(rules, workflows)),
        "estrutura-de-pastas": _folder_structure(stack),
        "arquivos-esperados": _bullets(_expected_files(stack)),
        "roadmap": _numbered([
            "Fundação: autenticação, RBAC, entidades e CRUD principais.",
            "Fluxos de negócio completos e relatórios.",
            "Integrações externas e refinamento de UX.",
            "Endurecimento (segurança, performance, observabilidade) e deploy.",
        ]),
        "regras-de-geracao": _bullets([
            "Preservar exatamente as regras de negócio (prioridade zero).",
            f"Não substituir a stack inferida ({_stack_label(stack)}) sem revisão aprovada.",
            "Traduzir 100% do conteúdo voltado ao usuário para o locale do projeto.",
            "Não inventar requisitos além da intenção do usuário.",
        ]),
        "o-que-nao-gerar": _bullets([
            "Nenhum segredo, chave de API ou credencial em texto puro.",
            "Nenhum módulo ou entidade não derivado da especificação.",
            "Nenhum endpoint que ignore autenticação/autorização.",
            "Nenhuma dependência abandonada ou versão insegura conhecida.",
        ]),
    }


def _project_name(spec: ProjectSpec) -> str:
    source = (spec.product_summary or spec.raw_intent or "").strip()
    if not source:
        return "Projeto LDCN"
    first = re.split(r"[.\n]", source)[0].strip()
    return (first[:80] or "Projeto LDCN").strip()


def _system_type(spec: ProjectSpec) -> str:
    text = f"{spec.raw_intent} {spec.product_summary}".lower()
    table = [
        (("saas", "multiempresa", "assinatura"), "SaaS (software como serviço)"),
        (("marketplace",), "Marketplace"),
        (("e-commerce", "ecommerce", "loja", "venda online"), "E-commerce"),
        (("crm",), "CRM"),
        (("erp",), "ERP"),
        (("landing",), "Landing Page"),
        (("blog",), "Blog"),
        (("portfolio", "portfólio"), "Portfólio"),
        (("api",), "API / serviço backend"),
        (("mobile", "aplicativo", "app "), "Aplicativo"),
        (("site", "institucional"), "Site institucional"),
    ]
    for needles, label in table:
        if any(n in text for n in needles):
            return label
    return "sistema de gestão sob medida"


def _modules(entities: list[str], workflows: list[str]) -> list[str]:
    modules = [f"Gestão de {entity}" for entity in entities]
    modules.append("Autenticação e Controle de Acesso (RBAC)")
    modules.append("Dashboard e Relatórios")
    if any("pag" in w.lower() for w in workflows):
        modules.append("Pagamentos")
    return modules


def _permissions(users: list[str]) -> list[str]:
    perms = []
    for index, user in enumerate(users):
        scope = "acesso total (administração)" if index == 0 else "acesso conforme escopo do papel"
        perms.append(f"{user}: {scope}.")
    perms.append("Toda permissão é verificada no backend, nunca apenas na UI.")
    return perms


def _integrations(spec: ProjectSpec) -> list[str]:
    text = f"{spec.raw_intent} {spec.product_summary} {' '.join(spec.core_workflows)}".lower()
    found: list[str] = []
    if any(k in text for k in ("pag", "pix", "cartão", "payment", "stripe")):
        found.append("Gateway de pagamento (a definir).")
    if any(k in text for k in ("email", "e-mail", "notific")):
        found.append("Envio de e-mail/notificações transacionais.")
    if any(k in text for k in ("mapa", "geo", "endereço", "entrega")):
        found.append("Serviço de geolocalização/mapas.")
    if not found:
        found.append("Nenhuma integração externa obrigatória identificada na intenção atual.")
    return found


def _security(nf: dict[str, str]) -> list[str]:
    base = [
        nf.get("security", "Baseline OWASP: validação de entrada, headers seguros, proteção contra injeção."),
        "RBAC e isolamento por workspace/dono.",
        "Rate limiting nos endpoints sensíveis.",
        "Proteção contra path traversal e vazamento de segredos.",
        "Sanitização de entradas e proteção contra prompt injection (onde houver IA).",
    ]
    return base


def _acceptance(rules: list[str], workflows: list[str]) -> list[str]:
    items = [f"O sistema cumpre a regra: {rule}" for rule in rules]
    items += [f"O fluxo funciona ponta a ponta: {wf}" for wf in workflows]
    items.append("Endpoints protegidos retornam 401/403 sem credencial válida.")
    items.append("Testes automatizados passam (unitários e integração).")
    return items


def _backend_body(stack: Any, nf: dict[str, str]) -> str:
    from app.data.language_agent_profiles import LANGUAGE_AGENT_PROFILES, resolve_language_id

    body = (
        f"Linguagem: **{stack.language or 'a definir'}** · Runtime: "
        f"**{stack.runtime or 'a definir'}** · Framework: **{stack.framework or 'a definir'}** · "
        f"Arquitetura: **{stack.architecture or 'monólito modular'}**.\n\n"
        "Camadas: interface (controllers) → aplicação (use-cases) → domínio → "
        "infraestrutura (repositórios). Regra de negócio vive na camada de aplicação/"
        f"domínio, nunca no controller. {nf.get('performance', '')}".strip()
    )
    language_id = resolve_language_id(stack.language)
    if language_id is not None:
        profile = LANGUAGE_AGENT_PROFILES[language_id]
        body += f"\n\nEcossistema ({profile['label']}): {profile['ecosystem_notes']}"
    return body


def _frontend_body(stack: Any, locale: str) -> str:
    return (
        "SPA/SSR moderna com componentes reutilizáveis e padrão de repositório para "
        "acesso a dados (nenhum componente faz fetch direto). UI premium (dark), "
        f"responsiva e internacionalizada (i18n, locale padrão {locale})."
    )


def _entity_fields(entities: list[str]) -> str:
    lines = ["Campos mínimos por entidade (refinar na geração):", ""]
    for entity in entities:
        lines.append(
            f"- **{entity}**: `id` (UUID), `name`/identificador, atributos de negócio, "
            "`created_at`, `updated_at`."
        )
    return "\n".join(lines)


def _stack_label(stack: Any) -> str:
    return f"{stack.language or '?'}/{stack.framework or '?'}"


def _folder_structure(stack: Any) -> str:
    return (
        "```\n"
        "apps/\n"
        "  api/        # backend (camadas: interface, application, domain, infrastructure)\n"
        "  web/        # frontend (app, components, lib)\n"
        "packages/\n"
        "  contracts/  # tipos compartilhados\n"
        "docs/         # README, arquitetura, rastreabilidade\n"
        "deploy/       # docker, ci\n"
        "```"
    )


def _expected_files(stack: Any) -> list[str]:
    from app.data.language_agent_profiles import language_manifest

    manifest = language_manifest(stack.language)
    return [
        "openapi.yaml (contrato da API).",
        f"`{manifest}` (manifesto de dependências do backend)." if manifest
        else "Manifesto de dependências do backend (conforme a stack).",
        "Backend: entrypoint, controllers, use-cases, domínio, repositórios.",
        "Frontend: páginas, componentes e camada de repositório tipada.",
        "Testes automatizados (unitários e integração).",
        "Dockerfile, docker-compose e pipeline de CI.",
        "README.md, ARCHITECTURE.md e docs/traceability.md.",
        ".env.example (sem valores reais).",
    ]


def author_prompt_master_md(
    spec: ProjectSpec,
    *,
    version: int,
    api_key: str | None = None,
    user_model_choice: str | None = None,
) -> dict[str, Any]:
    """Premium path: have a REAL LLM author the PromptMaster.md from the spec.

    When `api_key` is present, the model writes the whole professional document
    (domain-specific, not a template). A safety net appends a deterministic stub for
    any mandatory heading the model omitted, so the section contract always holds.
    Authors via the LLM whenever AI is available — a user `api_key` OR a server-side
    provider (so a configured deployment is AI by default). Falls back to the
    deterministic `build_prompt_master_md` (degraded) when the mock served the turn.
    """
    from app.services.ai_availability import ai_available

    if api_key or ai_available():
        try:
            from app.data.language_agent_profiles import ecosystem_brief
            from app.engines.agent_prompts import PROMPTMASTER_AUTHOR_PROMPT
            from app.engines.llm.router import LLMRouter
            from app.schemas.llm import LLMRequest

            payload = json.dumps(
                {"spec": spec.model_dump(mode="json"), "required_sections": [title for _id, title in SECTION_ORDER]},
                ensure_ascii=False,
            )
            # Language specialist layer: the same ecosystem rules the builder agents
            # receive, so Backend/Testes/Estrutura de Pastas/Arquivos Esperados
            # describe the REAL stack instead of generic prose.
            brief = ecosystem_brief(spec.suggested_stack.language, spec.suggested_stack.framework)
            system = f"{PROMPTMASTER_AUTHOR_PROMPT}\n\n{brief}" if brief else PROMPTMASTER_AUTHOR_PROMPT
            response = LLMRouter().route(
                LLMRequest(system=system, user=payload, max_output_tokens=16000),
                user_choice=user_model_choice,
                api_key=api_key,
            )
            if response.text and response.text.strip() and not response.served_by_fallback:
                project_name = _project_name(spec)
                markdown = _ensure_sections(response.text.strip(), spec, project_name)
                return {
                    "markdown": markdown,
                    "sections": [{"id": anchor, "title": title} for anchor, title in SECTION_ORDER],
                    "version": version,
                    "engine_version": "llm-author-1.0.0",
                    "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
                    "degraded": False,
                    "project_name": project_name,
                }
        except Exception:  # noqa: BLE001 — never fail the room; fall back deterministically
            pass

    return build_prompt_master_md(spec, degraded=True, version=version)


def _ensure_sections(markdown: str, spec: ProjectSpec, project_name: str) -> str:
    """Guarantee every mandatory `## <title>` heading exists; append a deterministic
    stub for any the model omitted (contract safety net)."""
    bodies = _section_bodies(spec, project_name)
    missing = [(anchor, title) for anchor, title in SECTION_ORDER if f"## {title}" not in markdown]
    if not missing:
        return markdown if markdown.endswith("\n") else markdown + "\n"
    extra = "\n\n".join(f"## {title}\n\n{bodies[anchor].strip()}" for anchor, title in missing)
    return markdown.rstrip() + "\n\n" + extra + "\n"


def _bullets(items: list[str], *, prefix: str = "") -> str:
    if not items:
        return "_(a definir)_"
    return "\n".join(f"- {prefix}{item}" for item in items)


def _numbered(items: list[str]) -> str:
    if not items:
        return "_(a definir)_"
    return "\n".join(f"{index}. {item}" for index, item in enumerate(items, start=1))
