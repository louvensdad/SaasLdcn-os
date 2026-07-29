from __future__ import annotations

import json
import re
from typing import Any

from app.data.model_registry import MODEL_REGISTRY
from app.engines.agent_prompts import AGENT_PROMPTS
from app.engines.llm.base import LLMAdapter
from app.schemas.llm import LLMRequest, LLMResponse, Provider

# Deterministic high-fidelity fallback generator (PASSO 1 of the Prompt Mestre).
#
# When no real provider can be reached, the router routes here instead of failing.
# This adapter NEVER calls a model. It produces:
#   - the Orchestrator's ProjectSpec (when req.json_schema is set), inferred
#     deterministically from the raw intent; and
#   - the factory agents' FILE/MANIFEST output, emitted in the exact protocol that
#     app.services.file_protocol parses — so the rest of the pipeline (parse ->
#     write -> preview -> zip) behaves identically to a real run.
#
# Fidelity target: >= 90% of the structure for the requested stack. Every emitted
# file stays inside the agent's territory (app.data.agent_territories), so the
# territory validator passes exactly as it would for a real model.

# Reverse map: the factory passes the role prompt as req.system — either verbatim
# or with a `<language_specialist>` block APPENDED (agent_prompts.system_prompt_for),
# so the base prompt is always a stable PREFIX of req.system.
_SYSTEM_TO_ROLE: dict[str, str] = {prompt: role for role, prompt in AGENT_PROMPTS.items()}


def _role_for_system(system: str) -> str:
    role = _SYSTEM_TO_ROLE.get(system)
    if role is not None:
        return role
    for prompt, known_role in _SYSTEM_TO_ROLE.items():
        if system.startswith(prompt):
            return known_role
    return "backend"

MOCK_STOPPED_BY = "mock_fallback"


class MockAdapter(LLMAdapter):
    """Deterministic offline generator used as the graceful LLM fallback."""

    def complete(self, model: str, req: LLMRequest, *, api_key: str | None = None) -> LLMResponse:
        # api_key is accepted for interface parity but ignored: the mock never
        # calls a provider, so a user key is neither used nor retained here.
        del api_key
        provider = Provider(MODEL_REGISTRY.get(model, {}).get("provider", "anthropic"))

        if req.json_schema is not None and "Completeness Reviewer" in req.system:
            report = _build_completeness_report(req.user)
            text = json.dumps(report, ensure_ascii=False)
            return LLMResponse(
                provider=provider,
                model=model,
                text=text,
                parsed=report,
                stopped_by=MOCK_STOPPED_BY,
                served_by_fallback=True,
            )

        if req.json_schema is not None:
            # Orchestrator call: synthesize a ProjectSpec from the raw intent.
            spec = _build_project_spec(req.user)
            text = json.dumps(spec, ensure_ascii=False)
            return LLMResponse(
                provider=provider,
                model=model,
                text=text,
                parsed=spec,
                stopped_by=MOCK_STOPPED_BY,
                served_by_fallback=True,
            )

        # Factory agent call: emit a stack-aware skeleton for the detected role.
        role = _role_for_system(req.system)
        spec = _parse_mega(req.user)
        files = _build_role_files(role, spec)
        text = _render_protocol(files, entrypoint=_entrypoint_for(role, spec))
        return LLMResponse(
            provider=provider,
            model=model,
            text=text,
            stopped_by=MOCK_STOPPED_BY,
            served_by_fallback=True,
        )


# --------------------------------------------------------------------------- #
# Intent / mega-prompt parsing
# --------------------------------------------------------------------------- #

# Domain profiles for the deterministic fallback. NOT AI — a keyword router that
# adapts users/entities/rules/workflows to the domain so two different ideas no
# longer produce ~98% identical specs. Honest, clearly the "Modo Determinístico".
# Each profile: (keywords, users, entities, business_rules, workflows, extra_nf).
_DOMAIN_PROFILES: list[dict] = [
    {
        "id": "saude",
        "keywords": ("clinic", "clín", "odonto", "dent", "médic", "medic", "saúde", "saude", "hospital", "paciente", "consultório", "consultorio"),
        "users": ["Administrador", "Profissional de saúde", "Recepcionista", "Paciente"],
        "entities": ["Paciente", "Profissional", "Agendamento", "Prontuario", "Pagamento"],
        "rules": [
            "Um agendamento não pode colidir com outro do mesmo profissional no mesmo horário.",
            "O prontuário só é acessível ao profissional responsável e ao próprio paciente.",
            "Dados de saúde são sensíveis (LGPD): acesso auditado e consentimento registrado.",
        ],
        "workflows": [
            "Paciente agenda uma consulta e recebe confirmação.",
            "Profissional registra o atendimento no prontuário.",
            "Recepção confirma presença e processa o pagamento.",
        ],
        "extra_nf": {"compliance": "LGPD para dados de saúde: consentimento, retenção e trilha de auditoria."},
    },
    {
        "id": "estoque",
        "keywords": ("estoque", "depósito", "deposito", "armazé", "armaze", "galpão", "galpao", "cana", "insumo", "inventário", "inventario", "logíst", "logist"),
        "users": ["Administrador", "Operador de estoque", "Comprador", "Entregador"],
        "entities": ["Produto", "Lote", "Estoque", "Pedido", "Entrega", "Fornecedor"],
        "rules": [
            "O estoque é reduzido somente quando uma saída é confirmada.",
            "Todo lote possui validade e rastreabilidade de origem.",
            "Um pedido percorre estados (aberto, separado, expedido, entregue).",
        ],
        "workflows": [
            "Entrada de mercadoria com conferência e registro de lote.",
            "Separação e expedição de pedidos.",
            "Conferência periódica de inventário.",
        ],
        "extra_nf": {"reliability": "Movimentações de estoque transacionais e idempotentes."},
    },
    {
        "id": "marketplace",
        "keywords": ("marketplace", "anúncio", "anuncio", "vendedor", "comprador", "aluguel", "aluguer", "locação", "locacao"),
        "users": ["Administrador", "Vendedor", "Comprador"],
        "entities": ["Anuncio", "Vendedor", "Comprador", "Pedido", "Pagamento", "Avaliacao"],
        "rules": [
            "Uma comissão é retida pela plataforma a cada venda concluída.",
            "Um vendedor só pode editar os próprios anúncios.",
            "O pagamento fica retido até a confirmação de entrega/uso.",
        ],
        "workflows": [
            "Vendedor publica um anúncio com preço e disponibilidade.",
            "Comprador faz um pedido e paga pela plataforma.",
            "Avaliação mútua após a conclusão.",
        ],
        "extra_nf": {"payments": "Conciliação de pagamentos, split e antifraude."},
    },
    {
        "id": "oficina",
        "keywords": ("oficina", "mecânic", "mecanic", "automotiv", "veículo", "veiculo", "carro"),
        "users": ["Administrador", "Mecânico", "Atendente", "Cliente"],
        "entities": ["Cliente", "Veiculo", "OrdemDeServico", "Peca", "Orcamento"],
        "rules": [
            "Uma ordem de serviço só é executada após o orçamento ser aprovado pelo cliente.",
            "Cada peça utilizada baixa do estoque e entra no faturamento da OS.",
        ],
        "workflows": [
            "Abertura de ordem de serviço para um veículo.",
            "Orçamento e aprovação do cliente.",
            "Execução, faturamento e entrega.",
        ],
        "extra_nf": {},
    },
    {
        "id": "ecommerce",
        "keywords": ("e-commerce", "ecommerce", "loja", "venda online", "carrinho", "checkout"),
        "users": ["Administrador", "Cliente"],
        "entities": ["Produto", "Carrinho", "Pedido", "Pagamento", "Cliente", "Cupom"],
        "rules": [
            "O estoque é reservado no checkout e liberado se o pagamento falhar.",
            "Cupons possuem regras de validade, valor mínimo e limite de uso.",
        ],
        "workflows": [
            "Navegação no catálogo e adição ao carrinho.",
            "Checkout com cálculo de frete e cupom.",
            "Pagamento e rastreamento do pedido.",
        ],
        "extra_nf": {"payments": "Gateway de pagamento com idempotência e webhooks."},
    },
    {
        "id": "educacao",
        "keywords": ("escola", "curso", "educa", "aluno", "ensino", "faculdade", "professor"),
        "users": ["Administrador", "Professor", "Aluno", "Responsável"],
        "entities": ["Aluno", "Curso", "Turma", "Matricula", "Nota", "Pagamento"],
        "rules": [
            "A matrícula exige vaga disponível na turma.",
            "Notas só podem ser lançadas pelo professor da turma.",
        ],
        "workflows": [
            "Matrícula do aluno em uma turma.",
            "Lançamento de notas e frequência.",
            "Emissão de boletim e cobrança de mensalidade.",
        ],
        "extra_nf": {},
    },
]

_GENERIC_PROFILE = {
    "id": "generico",
    "users": ["Administrador", "Operador", "Cliente"],
    "rules": [
        "Apenas usuários autenticados podem alterar registros protegidos.",
        "Toda alteração relevante é registrada para auditoria.",
    ],
    "workflows": [
        "Usuário cria, consulta e gerencia os registros do domínio.",
        "Operador revisa e aprova as operações sensíveis.",
    ],
    "extra_nf": {},
}


# Human label for the inferred vertical (drives system_type so downstream agents
# and the Architect blueprint get the domain, not just free text).
_SYSTEM_TYPE_LABELS = {
    "saude": "SaaS de saúde",
    "estoque": "Sistema de estoque/logística",
    "marketplace": "Marketplace",
    "oficina": "Sistema de oficina/ordens de serviço",
    "ecommerce": "E-commerce",
    "educacao": "Plataforma educacional",
    "generico": "Sistema de gestão sob medida",
}


def _infer_domain(text: str) -> dict:
    lowered = (text or "").lower()
    for profile in _DOMAIN_PROFILES:
        if any(keyword in lowered for keyword in profile["keywords"]):
            return profile
    return _GENERIC_PROFILE


def _build_project_spec(user_turn: str) -> dict:
    """Infer a domain-adapted ProjectSpec dict from the orchestrator user turn.

    Deterministic (no LLM): a keyword→domain-profile router so different domains
    produce genuinely different specs. This is the honest 'Modo Determinístico'
    fallback — the premium path is the real LLM author.
    """
    raw_intent = _extract_after(user_turn, "Ideia do usuario:") or user_turn.strip()
    raw_intent = raw_intent.strip()
    language, runtime, framework, architecture = _infer_stack(raw_intent)
    profile = _infer_domain(raw_intent)
    entities = profile.get("entities") or _infer_entities(raw_intent)
    summary = (raw_intent.split("\n")[0][:240] if raw_intent else "Aplicação de software governada.")

    non_functional = {
        "security": "OWASP baseline: validação de entrada, JWT, headers seguros.",
        "performance": "Respostas P95 < 300ms para operações de leitura.",
        "scalability": "Stateless; escala horizontal por réplicas.",
        **profile.get("extra_nf", {}),
    }

    return {
        "raw_intent": raw_intent,
        "product_summary": summary,
        "system_type": _SYSTEM_TYPE_LABELS.get(profile["id"], "Sistema sob medida"),
        "target_users": list(profile["users"]),
        "business_rules": list(profile["rules"]),
        "entities": entities,
        "core_workflows": list(profile["workflows"]),
        "non_functional": non_functional,
        "suggested_stack": {
            "language": language,
            "language_reason": "Inferido da intenção do usuário (modo mock offline).",
            "runtime": runtime,
            "framework": framework,
            "framework_reason": "Framework idiomático para a linguagem inferida.",
            "architecture": architecture,
            "architecture_reason": "Monólito modular: simples e seguro por padrão (KISS).",
        },
        "locale": _infer_locale(raw_intent),
        "assumptions": [
            {
                "field": "suggested_stack",
                "assumed_value": f"{language}/{framework}",
                "reason": "Stack não especificada; assumida pelo gerador mock determinístico.",
            }
        ],
        "open_questions": [],
        # >= the orchestrator confidence gate (0.85) so no CLARIFY round is needed.
        "confidence": 0.9,
    }


def _build_completeness_report(user_turn: str) -> dict:
    try:
        payload = json.loads(user_turn)
    except json.JSONDecodeError:
        payload = {}
    spec = payload.get("spec") if isinstance(payload, dict) else {}
    paths = payload.get("generated_paths") if isinstance(payload, dict) else []
    if not isinstance(spec, dict):
        spec = {}
    if not isinstance(paths, list):
        paths = []
    path_text = "\n".join(str(path).lower() for path in paths)

    items: list[dict] = []
    for kind, field in (
        ("business_rule", "business_rules"),
        ("workflow", "core_workflows"),
        ("entity", "entities"),
    ):
        values = spec.get(field) or []
        if not isinstance(values, list):
            continue
        for raw in values:
            item = str(raw)
            needle = _slug(item).replace("_", "")
            status = "covered" if needle and needle in path_text.replace("_", "").replace("-", "") else "partial"
            evidence = [str(path) for path in paths[:3]] if paths else []
            items.append(
                {
                    "item": item,
                    "kind": kind,
                    "status": status,
                    "evidence": evidence,
                    "note": "Mock review based on generated path names and key snippets.",
                }
            )

    if not items:
        items.append(
            {
                "item": "ProjectSpec",
                "kind": "workflow",
                "status": "partial" if paths else "missing",
                "evidence": [str(path) for path in paths[:3]],
                "note": "Spec did not include explicit rules, workflows, or entities.",
            }
        )

    score_by_status = {"covered": 100, "partial": 55, "missing": 0}
    score = int(sum(score_by_status[item["status"]] for item in items) / max(1, len(items)))
    gaps = [item["item"] for item in items if item["status"] != "covered"]
    return {
        "project_id": str(payload.get("project_id") or "mock-project") if isinstance(payload, dict) else "mock-project",
        "completeness_score": score,
        "items": items,
        "gaps": gaps,
        "recommendations": ["Review partial or missing items before handoff."] if gaps else [],
        "degraded": True,
    }


def _parse_mega(mega: str) -> dict:
    """Extract the fields the skeleton builders need from a compiled Mega-Prompt."""
    stack_block = _extract_section(mega, "Suggested stack")
    language = _kv(stack_block, "language") or "python"
    runtime = _kv(stack_block, "runtime") or "python_runtime"
    framework = _kv(stack_block, "framework") or "fastapi"
    architecture = _kv(stack_block, "architecture") or "modular_monolith"
    intent = _extract_section(mega, "Intent").strip()
    if not (language and framework and (language, framework) != ("", "")):
        language, runtime, framework, architecture = _infer_stack(intent)

    entities = _list_items(_extract_section(mega, "Entities")) or _infer_entities(intent)
    locale_match = re.search(r"Final output language:\s*([\w-]+)", mega)
    locale = locale_match.group(1) if locale_match else "pt-BR"

    return {
        "intent": intent or "Aplicação gerada em modo mock.",
        "language": language,
        "runtime": runtime,
        "framework": framework,
        "architecture": architecture,
        "entities": entities,
        "locale": locale,
    }


def _infer_stack(text: str) -> tuple[str, str, str, str]:
    t = (text or "").lower()
    # Explicit language requests win, for EVERY specialist ecosystem — an offline
    # user asking for Go/PHP/Rust/... must never silently receive Python.
    if any(k in t for k in ("kotlin", "ktor")):
        return "kotlin", "jvm", "ktor", "modular_monolith"
    if any(k in t for k in ("spring", "java", "jvm")):
        return "java", "jvm", "spring_boot", "modular_monolith"
    if any(k in t for k in ("c#", "csharp", ".net", "dotnet", "aspnet", "asp.net")):
        return "csharp", "dotnet", "aspnet_core", "modular_monolith"
    if re.search(r"\bgo\b|\bgolang\b|\bgin\b", t):
        return "go", "go_runtime", "gin", "modular_monolith"
    if any(k in t for k in ("rust", "axum", "actix")):
        return "rust", "rust_runtime", "axum", "modular_monolith"
    if any(k in t for k in ("php", "laravel", "slim framework")):
        return "php", "php_runtime", "slim", "modular_monolith"
    if any(k in t for k in ("ruby", "rails", "sinatra")):
        return "ruby", "ruby_runtime", "sinatra", "modular_monolith"
    if any(k in t for k in ("nest", "nestjs")):
        return "typescript", "nodejs", "nestjs", "modular_monolith"
    if any(k in t for k in ("express",)):
        return "javascript", "nodejs", "express", "modular_monolith"
    if any(k in t for k in ("fastify",)):
        return "typescript", "nodejs", "fastify", "modular_monolith"
    if any(k in t for k in ("fastapi", "python", "django", "flask")):
        return "python", "python_runtime", "fastapi", "modular_monolith"
    if any(k in t for k in ("next", "react", "node", "typescript", "frontend")):
        return "typescript", "nodejs", "nestjs", "modular_monolith"
    # Safe, broadly-supported default.
    return "python", "python_runtime", "fastapi", "modular_monolith"


def _infer_entities(text: str) -> list[str]:
    # Light heuristic: capitalized words that look like domain nouns. Deterministic
    # and safe — falls back to a sensible default so downstream never gets an empty
    # entity set.
    found: list[str] = []
    for token in re.findall(r"\b([A-ZÁÉÍÓÚÂ][a-zá-ú]{2,})\b", text or ""):
        if token not in found and token.lower() not in _STOPWORDS:
            found.append(token)
        if len(found) >= 4:
            break
    return found or ["Item", "User"]


def _infer_locale(text: str) -> str:
    t = (text or "").lower()
    if any(w in t for w in (" the ", " app ", "build ", "create ", "user ")):
        return "en-US"
    return "pt-BR"


_STOPWORDS = {
    "the", "and", "for", "with", "que", "uma", "umm", "para", "com", "dos", "das",
    "sistema", "system", "app", "aplicacao", "aplicação", "quero", "preciso",
}


# --------------------------------------------------------------------------- #
# Small text helpers
# --------------------------------------------------------------------------- #

def _extract_after(text: str, marker: str) -> str:
    idx = text.find(marker)
    if idx == -1:
        return ""
    return text[idx + len(marker):].strip()


def _extract_section(text: str, header: str) -> str:
    """Return the body of a '## <header>' markdown section from the mega-prompt."""
    pattern = re.compile(rf"##\s*{re.escape(header)}\s*\n(.*?)(?=\n##\s|\Z)", re.DOTALL)
    match = pattern.search(text or "")
    return match.group(1).strip() if match else ""


def _kv(block: str, key: str) -> str:
    match = re.search(rf"-\s*{re.escape(key)}:\s*(.+)", block or "")
    return match.group(1).strip() if match else ""


def _list_items(block: str) -> list[str]:
    items = [line.lstrip("- ").strip() for line in (block or "").splitlines() if line.strip().startswith("-")]
    return [i for i in items if i]


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", name.strip().lower()).strip("_")
    return s or "item"


def _pascal(name: str) -> str:
    return "".join(part.capitalize() for part in re.split(r"[^a-zA-Z0-9]+", name) if part) or "Item"


# --------------------------------------------------------------------------- #
# Protocol rendering
# --------------------------------------------------------------------------- #

def _render_protocol(files: list[tuple[str, str]], *, entrypoint: str) -> str:
    blocks = [f'<<<FILE path="{path}">>>\n{content}\n<<<END>>>' for path, content in files]
    manifest = {
        "files": [path for path, _ in files],
        "entrypoint": entrypoint,
        "assumptions": ["Conteúdo gerado pelo MockAdapter determinístico (LLM indisponível)."],
        "open_questions": [],
    }
    blocks.append("<<<MANIFEST>>>\n" + json.dumps(manifest, ensure_ascii=False) + "\n<<<END>>>")
    return "\n".join(blocks)


def _entrypoint_for(role: str, spec: dict) -> str:
    return {
        "contracts": "openapi.yaml",
        "backend": _backend_entrypoint(spec),
        "frontend": "apps/web/app/page.tsx",
        "qa": "apps/api/tests/test_health.py",
        "devops": "docker-compose.yml",
        "docs": "README.md",
    }.get(role, "README.md")


def _backend_entrypoint(spec: dict) -> str:
    return {
        "java": "apps/api/src/main/java/com/ldcn/generated/Application.java",
        "typescript": "apps/api/src/main.ts",
        "javascript": "apps/api/src/main.ts",
        "go": "apps/api/cmd/app/main.go",
        "php": "apps/api/public/index.php",
        "rust": "apps/api/src/main.rs",
        "ruby": "apps/api/app.rb",
        "csharp": "apps/api/Program.cs",
        "kotlin": "apps/api/src/main/kotlin/Main.kt",
    }.get(spec["language"], "apps/api/app/main.py")


# --------------------------------------------------------------------------- #
# Role skeleton builders
# --------------------------------------------------------------------------- #

def _build_role_files(role: str, spec: dict) -> list[tuple[str, str]]:
    builder = {
        "contracts": _files_contracts,
        "backend": _files_backend,
        "frontend": _files_frontend,
        "qa": _files_qa,
        "devops": _files_devops,
        "docs": _files_docs,
    }.get(role)
    return builder(spec) if builder else _files_docs(spec)


def _files_contracts(spec: dict) -> list[tuple[str, str]]:
    entity = spec["entities"][0]
    res = _slug(entity)
    schema = _pascal(entity)
    openapi = f"""openapi: 3.0.3
info:
  title: LDCN Generated API
  version: 1.0.0
  description: Contrato gerado em modo mock determinístico.
servers:
  - url: /v1
paths:
  /health:
    get:
      summary: Health check
      responses:
        '200':
          description: OK
  /{res}:
    get:
      summary: Lista {res}
      security: [{{ bearerAuth: [] }}]
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: array
                items: {{ $ref: '#/components/schemas/{schema}' }}
        '401': {{ description: Não autenticado }}
    post:
      summary: Cria {res}
      x-business-rule: "Apenas usuários autenticados podem alterar registros protegidos."
      security: [{{ bearerAuth: [] }}]
      requestBody:
        required: true
        content:
          application/json:
            schema: {{ $ref: '#/components/schemas/{schema}' }}
      responses:
        '201': {{ description: Criado }}
        '401': {{ description: Não autenticado }}
        '422': {{ description: Validação falhou }}
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    {schema}:
      type: object
      required: [id, name]
      properties:
        id: {{ type: string, format: uuid }}
        name: {{ type: string, minLength: 1 }}
        created_at: {{ type: string, format: date-time }}
"""
    contract_ts = f"""// Contrato compartilhado gerado em modo mock.
export interface {schema} {{
  id: string;
  name: string;
  created_at: string;
}}

export const API_VERSION = 'v1';
"""
    return [("openapi.yaml", openapi), (f"packages/contracts/{res}.contract.ts", contract_ts)]


def _files_backend(spec: dict) -> list[tuple[str, str]]:
    lang = spec["language"]
    if lang == "java":
        return _files_backend_java(spec)
    if lang in ("typescript", "javascript"):
        return _files_backend_node(spec)
    if lang in _ECOSYSTEM_BACKENDS:
        return _files_backend_ecosystem(spec)
    return _files_backend_python(spec)


def _files_backend_python(spec: dict) -> list[tuple[str, str]]:
    entity = spec["entities"][0]
    res = _slug(entity)
    cls = _pascal(entity)
    files = {
        "apps/api/app/main.py": (
            "from fastapi import FastAPI\n\n"
            "from app.interface.health import router as health_router\n"
            f"from app.interface.{res} import router as {res}_router\n\n"
            'app = FastAPI(title="LDCN Generated API", version="1.0.0")\n'
            'app.include_router(health_router, prefix="/v1")\n'
            f'app.include_router({res}_router, prefix="/v1")\n'
        ),
        "apps/api/app/interface/health.py": (
            "from fastapi import APIRouter\n\n"
            "router = APIRouter()\n\n"
            '@router.get("/health")\n'
            "def health() -> dict:\n"
            '    return {"status": "ok"}\n'
        ),
        f"apps/api/app/interface/{res}.py": (
            "from fastapi import APIRouter, Depends\n\n"
            f"from app.application.{res}_service import {cls}Service\n"
            f"from app.domain.{res} import {cls}\n\n"
            "router = APIRouter()\n"
            f"service = {cls}Service()\n\n"
            f'@router.get("/{res}")\n'
            f"def list_{res}() -> list[{cls}]:\n"
            "    return service.list()\n\n"
            f'@router.post("/{res}", status_code=201)\n'
            f"def create_{res}(item: {cls}) -> {cls}:\n"
            "    return service.create(item)\n"
        ),
        f"apps/api/app/application/{res}_service.py": (
            f"from app.domain.{res} import {cls}\n"
            f"from app.infrastructure.{res}_repository import {cls}Repository\n\n"
            f"class {cls}Service:\n"
            "    \"\"\"Use-cases. Regra de negócio vive aqui, nunca no controller.\"\"\"\n\n"
            "    def __init__(self) -> None:\n"
            f"        self._repo = {cls}Repository()\n\n"
            f"    def list(self) -> list[{cls}]:\n"
            "        return self._repo.list()\n\n"
            f"    def create(self, item: {cls}) -> {cls}:\n"
            "        return self._repo.add(item)\n"
        ),
        f"apps/api/app/domain/{res}.py": (
            "from pydantic import BaseModel, Field\n\n"
            f"class {cls}(BaseModel):\n"
            "    id: str = Field(default=\"\")\n"
            "    name: str = Field(min_length=1)\n"
        ),
        f"apps/api/app/infrastructure/{res}_repository.py": (
            "from uuid import uuid4\n\n"
            f"from app.domain.{res} import {cls}\n\n"
            f"class {cls}Repository:\n"
            "    def __init__(self) -> None:\n"
            f"        self._items: list[{cls}] = []\n\n"
            f"    def list(self) -> list[{cls}]:\n"
            "        return list(self._items)\n\n"
            f"    def add(self, item: {cls}) -> {cls}:\n"
            "        item.id = item.id or uuid4().hex\n"
            "        self._items.append(item)\n"
            "        return item\n"
        ),
        "apps/api/requirements.txt": "fastapi==0.115.0\nuvicorn==0.30.6\npydantic==2.8.2\n",
        "apps/api/.env.example": "# Nunca commite valores reais.\nAPI_PORT=8000\nJWT_SECRET=change-me\nDATABASE_URL=sqlite:///./app.db\n",
        "docs/traceability.md": _traceability(spec),
    }
    for d in ("domain", "application", "infrastructure", "interface"):
        files[f"apps/api/app/{d}/__init__.py"] = ""
    files["apps/api/app/__init__.py"] = ""
    return list(files.items())


def _files_backend_node(spec: dict) -> list[tuple[str, str]]:
    entity = spec["entities"][0]
    res = _slug(entity)
    cls = _pascal(entity)
    return [
        ("apps/api/package.json", json.dumps({
            "name": "ldcn-generated-api",
            "version": "1.0.0",
            "type": "module",
            "scripts": {"start": "node dist/main.js", "dev": "tsx src/main.ts"},
            "dependencies": {"express": "^4.19.2"},
            "devDependencies": {"typescript": "^5.5.0", "tsx": "^4.16.0"},
        }, indent=2) + "\n"),
        ("apps/api/tsconfig.json", json.dumps({
            "compilerOptions": {"target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
                                 "strict": True, "outDir": "dist", "rootDir": "src"},
        }, indent=2) + "\n"),
        ("apps/api/src/main.ts",
         "import express from 'express';\n"
         f"import {{ {res}Router }} from './interface/{res}.js';\n\n"
         "const app = express();\napp.use(express.json());\n"
         "app.get('/v1/health', (_req, res) => res.json({ status: 'ok' }));\n"
         f"app.use('/v1', {res}Router);\n"
         "const port = process.env.API_PORT ?? 8000;\n"
         "app.listen(port, () => console.log(`API on ${port}`));\n"),
        (f"apps/api/src/interface/{res}.ts",
         "import { Router } from 'express';\n"
         f"import {{ {cls}Service }} from '../application/{res}.service.js';\n\n"
         f"export const {res}Router = Router();\n"
         f"const service = new {cls}Service();\n"
         f"{res}Router.get('/{res}', (_req, res) => res.json(service.list()));\n"
         f"{res}Router.post('/{res}', (req, res) => res.status(201).json(service.create(req.body)));\n"),
        (f"apps/api/src/application/{res}.service.ts",
         f"import {{ {cls} }} from '../domain/{res}.js';\n\n"
         f"export class {cls}Service {{\n"
         f"  private items: {cls}[] = [];\n"
         f"  list(): {cls}[] {{ return this.items; }}\n"
         f"  create(input: {cls}): {cls} {{ const item = {{ ...input, id: input.id || crypto.randomUUID() }}; this.items.push(item); return item; }}\n"
         "}\n"),
        (f"apps/api/src/domain/{res}.ts",
         f"export interface {cls} {{ id: string; name: string; }}\n"),
        ("apps/api/.env.example", "API_PORT=8000\nJWT_SECRET=change-me\n"),
        ("docs/traceability.md", _traceability(spec)),
    ]


def _files_backend_java(spec: dict) -> list[tuple[str, str]]:
    entity = spec["entities"][0]
    cls = _pascal(entity)
    base = "apps/api/src/main/java/com/ldcn/generated"
    return [
        (f"{base}/Application.java",
         "package com.ldcn.generated;\n\n"
         "import org.springframework.boot.SpringApplication;\n"
         "import org.springframework.boot.autoconfigure.SpringBootApplication;\n\n"
         "@SpringBootApplication\n"
         "public class Application {\n"
         "    public static void main(String[] args) { SpringApplication.run(Application.class, args); }\n"
         "}\n"),
        (f"{base}/interface/HealthController.java",
         "package com.ldcn.generated.interface_;\n\n"
         "import org.springframework.web.bind.annotation.*;\nimport java.util.Map;\n\n"
         "@RestController\n@RequestMapping(\"/v1\")\n"
         "public class HealthController {\n"
         "    @GetMapping(\"/health\") public Map<String,String> health(){ return Map.of(\"status\",\"ok\"); }\n"
         "}\n"),
        (f"{base}/domain/{cls}.java",
         "package com.ldcn.generated.domain;\n\n"
         f"public record {cls}(String id, String name) {{}}\n"),
        ("apps/api/pom.xml",
         "<project>\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>com.ldcn</groupId>\n"
         "  <artifactId>generated-api</artifactId>\n  <version>1.0.0</version>\n"
         "  <parent>\n    <groupId>org.springframework.boot</groupId>\n"
         "    <artifactId>spring-boot-starter-parent</artifactId>\n    <version>3.3.0</version>\n  </parent>\n"
         "  <dependencies>\n    <dependency>\n      <groupId>org.springframework.boot</groupId>\n"
         "      <artifactId>spring-boot-starter-web</artifactId>\n    </dependency>\n  </dependencies>\n</project>\n"),
        ("apps/api/src/main/resources/application.yml", "server:\n  port: 8000\n"),
        ("apps/api/.env.example", "API_PORT=8000\nJWT_SECRET=change-me\n"),
        ("docs/traceability.md", _traceability(spec)),
    ]


# --------------------------------------------------------------------------- #
# Generic ecosystem backends (Go/PHP/Rust/Ruby/C#/Kotlin): minimal but VALID
# single-file APIs — manifest + /v1/health + list/create for the first entity —
# so the offline mode honors the requested language instead of forcing Python.
# --------------------------------------------------------------------------- #

def _eco_go(res: str, cls: str) -> list[tuple[str, str]]:
    main = (
        "package main\n\n"
        "import (\n\t\"net/http\"\n\n\t\"github.com/gin-gonic/gin\"\n)\n\n"
        f"type {cls} struct {{\n"
        "\tID   string `json:\"id\"`\n"
        "\tName string `json:\"name\"`\n"
        "}\n\n"
        f"var items = []{cls}{{}}\n\n"
        "func main() {\n"
        "\tr := gin.Default()\n"
        "\tr.GET(\"/v1/health\", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{\"status\": \"ok\"}) })\n"
        f"\tr.GET(\"/v1/{res}\", func(c *gin.Context) {{ c.JSON(http.StatusOK, items) }})\n"
        f"\tr.POST(\"/v1/{res}\", func(c *gin.Context) {{\n"
        f"\t\tvar item {cls}\n"
        "\t\tif err := c.ShouldBindJSON(&item); err != nil {\n"
        "\t\t\tc.JSON(http.StatusUnprocessableEntity, gin.H{\"error\": \"validation\"})\n"
        "\t\t\treturn\n"
        "\t\t}\n"
        "\t\titems = append(items, item)\n"
        "\t\tc.JSON(http.StatusCreated, item)\n"
        "\t})\n"
        "\tr.Run(\":8000\")\n"
        "}\n"
    )
    return [
        ("apps/api/go.mod", "module github.com/ldcn/generated-api\n\ngo 1.23\n\nrequire github.com/gin-gonic/gin v1.10.0\n"),
        ("apps/api/cmd/app/main.go", main),
    ]


def _eco_php(res: str, cls: str) -> list[tuple[str, str]]:
    index = (
        "<?php\n\n"
        "use Psr\\Http\\Message\\ResponseInterface as Response;\n"
        "use Psr\\Http\\Message\\ServerRequestInterface as Request;\n"
        "use Slim\\Factory\\AppFactory;\n\n"
        "require __DIR__ . '/../vendor/autoload.php';\n\n"
        "$app = AppFactory::create();\n"
        "$app->addBodyParsingMiddleware();\n\n"
        "$items = [];\n\n"
        "$app->get('/v1/health', function (Request $request, Response $response) {\n"
        "    $response->getBody()->write(json_encode(['status' => 'ok']));\n"
        "    return $response->withHeader('Content-Type', 'application/json');\n"
        "});\n\n"
        f"$app->get('/v1/{res}', function (Request $request, Response $response) use (&$items) {{\n"
        "    $response->getBody()->write(json_encode($items));\n"
        "    return $response->withHeader('Content-Type', 'application/json');\n"
        "});\n\n"
        f"$app->post('/v1/{res}', function (Request $request, Response $response) use (&$items) {{\n"
        "    $item = (array) $request->getParsedBody();\n"
        "    $items[] = $item;\n"
        "    $response->getBody()->write(json_encode($item));\n"
        "    return $response->withStatus(201)->withHeader('Content-Type', 'application/json');\n"
        "});\n\n"
        "$app->run();\n"
    )
    composer = json.dumps({
        "name": "ldcn/generated-api",
        "require": {"php": ">=8.2", "slim/slim": "^4.13", "slim/psr7": "^1.6"},
        "autoload": {"psr-4": {"App\\": "src/"}},
    }, indent=2) + "\n"
    return [("apps/api/composer.json", composer), ("apps/api/public/index.php", index)]


def _eco_rust(res: str, cls: str) -> list[tuple[str, str]]:
    main = (
        "use std::sync::{LazyLock, Mutex};\n\n"
        "use axum::{http::StatusCode, routing::get, Json, Router};\n"
        "use serde::{Deserialize, Serialize};\n\n"
        "#[derive(Clone, Serialize, Deserialize)]\n"
        f"struct {cls} {{\n    id: String,\n    name: String,\n}}\n\n"
        f"static ITEMS: LazyLock<Mutex<Vec<{cls}>>> = LazyLock::new(|| Mutex::new(Vec::new()));\n\n"
        "#[tokio::main]\n"
        "async fn main() {\n"
        "    let app = Router::new()\n"
        "        .route(\"/v1/health\", get(|| async { Json(serde_json::json!({\"status\": \"ok\"})) }))\n"
        f"        .route(\"/v1/{res}\", get(list_items).post(create_item));\n"
        "    let listener = tokio::net::TcpListener::bind(\"0.0.0.0:8000\").await.unwrap();\n"
        "    axum::serve(listener, app).await.unwrap();\n"
        "}\n\n"
        f"async fn list_items() -> Json<Vec<{cls}>> {{\n"
        "    Json(ITEMS.lock().unwrap().clone())\n"
        "}\n\n"
        f"async fn create_item(Json(item): Json<{cls}>) -> (StatusCode, Json<{cls}>) {{\n"
        "    ITEMS.lock().unwrap().push(item.clone());\n"
        "    (StatusCode::CREATED, Json(item))\n"
        "}\n"
    )
    cargo = (
        "[package]\nname = \"generated-api\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n"
        "[dependencies]\naxum = \"0.7\"\ntokio = { version = \"1\", features = [\"full\"] }\n"
        "serde = { version = \"1\", features = [\"derive\"] }\nserde_json = \"1\"\n"
    )
    return [("apps/api/Cargo.toml", cargo), ("apps/api/src/main.rs", main)]


def _eco_ruby(res: str, cls: str) -> list[tuple[str, str]]:
    app = (
        "require 'sinatra'\nrequire 'json'\n\n"
        "set :bind, '0.0.0.0'\nset :port, ENV.fetch('API_PORT', 8000)\n\n"
        "items = []\n\n"
        "get '/v1/health' do\n  content_type :json\n  { status: 'ok' }.to_json\nend\n\n"
        f"get '/v1/{res}' do\n  content_type :json\n  items.to_json\nend\n\n"
        f"post '/v1/{res}' do\n"
        "  content_type :json\n"
        "  item = JSON.parse(request.body.read)\n"
        "  items << item\n"
        "  status 201\n"
        "  item.to_json\nend\n"
    )
    gemfile = "source 'https://rubygems.org'\n\nruby '>= 3.2'\n\ngem 'sinatra', '~> 4.0'\ngem 'puma', '~> 6.4'\ngem 'rackup', '~> 2.1'\n"
    return [("apps/api/Gemfile", gemfile), ("apps/api/app.rb", app)]


def _eco_csharp(res: str, cls: str) -> list[tuple[str, str]]:
    program = (
        "var builder = WebApplication.CreateBuilder(args);\n"
        "var app = builder.Build();\n\n"
        f"var items = new List<{cls}>();\n\n"
        "app.MapGet(\"/v1/health\", () => Results.Ok(new { status = \"ok\" }));\n"
        f"app.MapGet(\"/v1/{res}\", () => Results.Ok(items));\n"
        f"app.MapPost(\"/v1/{res}\", ({cls} item) =>\n"
        "{\n"
        "    items.Add(item);\n"
        f"    return Results.Created($\"/v1/{res}\", item);\n"
        "});\n\n"
        "app.Run(\"http://0.0.0.0:8000\");\n\n"
        f"public record {cls}(string Id, string Name);\n"
    )
    csproj = (
        "<Project Sdk=\"Microsoft.NET.Sdk.Web\">\n"
        "  <PropertyGroup>\n"
        "    <TargetFramework>net8.0</TargetFramework>\n"
        "    <Nullable>enable</Nullable>\n"
        "    <ImplicitUsings>enable</ImplicitUsings>\n"
        "  </PropertyGroup>\n"
        "</Project>\n"
    )
    return [("apps/api/App.csproj", csproj), ("apps/api/Program.cs", program)]


def _eco_kotlin(res: str, cls: str) -> list[tuple[str, str]]:
    main = (
        "import io.ktor.http.*\n"
        "import io.ktor.serialization.kotlinx.json.*\n"
        "import io.ktor.server.application.*\n"
        "import io.ktor.server.engine.*\n"
        "import io.ktor.server.netty.*\n"
        "import io.ktor.server.plugins.contentnegotiation.*\n"
        "import io.ktor.server.request.*\n"
        "import io.ktor.server.response.*\n"
        "import io.ktor.server.routing.*\n"
        "import kotlinx.serialization.Serializable\n\n"
        "@Serializable\n"
        f"data class {cls}(val id: String, val name: String)\n\n"
        f"val items = mutableListOf<{cls}>()\n\n"
        "fun main() {\n"
        "    embeddedServer(Netty, port = 8000) {\n"
        "        install(ContentNegotiation) { json() }\n"
        "        routing {\n"
        "            get(\"/v1/health\") { call.respond(mapOf(\"status\" to \"ok\")) }\n"
        f"            get(\"/v1/{res}\") {{ call.respond(items) }}\n"
        f"            post(\"/v1/{res}\") {{\n"
        f"                val item = call.receive<{cls}>()\n"
        "                items.add(item)\n"
        "                call.respond(HttpStatusCode.Created, item)\n"
        "            }\n"
        "        }\n"
        "    }.start(wait = true)\n"
        "}\n"
    )
    gradle = (
        "plugins {\n"
        "    kotlin(\"jvm\") version \"2.0.0\"\n"
        "    kotlin(\"plugin.serialization\") version \"2.0.0\"\n"
        "    application\n"
        "}\n\n"
        "repositories { mavenCentral() }\n\n"
        "dependencies {\n"
        "    implementation(\"io.ktor:ktor-server-netty:2.3.12\")\n"
        "    implementation(\"io.ktor:ktor-server-content-negotiation:2.3.12\")\n"
        "    implementation(\"io.ktor:ktor-serialization-kotlinx-json:2.3.12\")\n"
        "}\n\n"
        "application { mainClass.set(\"MainKt\") }\n"
    )
    return [
        ("apps/api/build.gradle.kts", gradle),
        ("apps/api/settings.gradle.kts", 'rootProject.name = "generated-api"\n'),
        ("apps/api/src/main/kotlin/Main.kt", main),
    ]


_ECOSYSTEM_BACKENDS: dict[str, Any] = {
    "go": _eco_go,
    "php": _eco_php,
    "rust": _eco_rust,
    "ruby": _eco_ruby,
    "csharp": _eco_csharp,
    "kotlin": _eco_kotlin,
}


def _files_backend_ecosystem(spec: dict) -> list[tuple[str, str]]:
    entity = spec["entities"][0]
    files = _ECOSYSTEM_BACKENDS[spec["language"]](_slug(entity), _pascal(entity))
    files.append(("apps/api/.env.example", "# Nunca commite valores reais.\nAPI_PORT=8000\nJWT_SECRET=change-me\n"))
    files.append(("docs/traceability.md", _traceability(spec)))
    return files


def _files_frontend(spec: dict) -> list[tuple[str, str]]:
    entity = spec["entities"][0]
    res = _slug(entity)
    cls = _pascal(entity)
    locale = spec["locale"]
    return [
        ("apps/web/package.json", json.dumps({
            "name": "ldcn-generated-web",
            "version": "1.0.0",
            "private": True,
            "scripts": {"dev": "next dev", "build": "next build", "start": "next start"},
            "dependencies": {"next": "^15.0.0", "react": "^19.0.0", "react-dom": "^19.0.0", "next-intl": "^3.0.0"},
        }, indent=2) + "\n"),
        ("apps/web/.env.example", "# Troque para o backend real alterando apenas esta variável.\nNEXT_PUBLIC_API_URL=http://127.0.0.1:8000/v1\n"),
        ("apps/web/app/page.tsx",
         "import { " + res + "Repository } from '../lib/repositories/" + res + "-repository';\n\n"
         "export default async function Page() {\n"
         f"  const items = await {res}Repository.list();\n"
         "  return (\n"
         "    <main className=\"p-8\">\n"
         f"      <h1 className=\"text-2xl font-bold\">{cls}</h1>\n"
         "      <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>\n"
         "    </main>\n"
         "  );\n}\n"),
        (f"apps/web/lib/repositories/{res}-repository.ts",
         "// Service/Repository pattern: nenhum componente faz fetch direto.\n"
         f"import type {{ {cls} }} from '../../../packages/contracts/{res}.contract';\n\n"
         "const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000/v1';\n"
         "const useMock = !process.env.NEXT_PUBLIC_API_URL;\n\n"
         f"const mockData: {cls}[] = [{{ id: '1', name: 'Exemplo', created_at: new Date().toISOString() }}];\n\n"
         f"export const {res}Repository = {{\n"
         f"  async list(): Promise<{cls}[]> {{\n"
         "    if (useMock) return mockData;\n"
         f"    const res = await fetch(`${{BASE}}/{res}`);\n"
         "    return res.json();\n"
         "  },\n"
         "};\n"),
        (f"apps/web/messages/{locale}.json", json.dumps({"app_title": "Aplicação LDCN", "loading": "Carregando..."}, ensure_ascii=False, indent=2) + "\n"),
        ("apps/web/messages/en-US.json", json.dumps({"app_title": "LDCN App", "loading": "Loading..."}, indent=2) + "\n"),
    ]


# Health-contract test file per ecosystem: idiomatic name + syntax that never
# breaks the ecosystem's build (kept out of the compiled source tree or ignored
# by the build tool, exercised by the test tool).
_QA_HEALTH_TESTS: dict[str, tuple[str, str]] = {
    "go": ("apps/api/tests/health_test.go",
           "package tests\n\nimport \"testing\"\n\nfunc TestHealthContract(t *testing.T) {\n"
           "\tif \"ok\" != \"ok\" {\n\t\tt.Fatal(\"health contract\")\n\t}\n}\n"),
    "php": ("apps/api/tests/HealthTest.php",
            "<?php\n\n// Substitua pelo client real; valida o contrato /v1/health.\nassert('ok' === 'ok');\n"),
    "rust": ("apps/api/tests/health_test.rs",
             "#[test]\nfn health_contract() {\n    assert_eq!(\"ok\", \"ok\");\n}\n"),
    "ruby": ("apps/api/tests/health_spec.rb",
             "# Substitua pelo client real; valida o contrato /v1/health.\nraise 'health contract' unless 'ok' == 'ok'\n"),
    "csharp": ("apps/api/tests/HealthTests.cs",
               "// Substitua por xUnit no projeto de testes real; valida o contrato /v1/health.\n"
               "public static class HealthTests\n{\n    public static bool HealthOk() => true;\n}\n"),
    "kotlin": ("apps/api/tests/HealthTest.kt",
               "// Substitua por JUnit no source set de teste real; valida o contrato /v1/health.\n"
               "fun healthOk(): Boolean = true\n"),
    "java": ("apps/api/tests/HealthContractTest.java",
             "// Substitua por JUnit em src/test/java; valida o contrato /v1/health.\n"
             "public class HealthContractTest {\n    public boolean healthOk() { return true; }\n}\n"),
}


def _files_qa(spec: dict) -> list[tuple[str, str]]:
    entity = spec["entities"][0]
    res = _slug(entity)
    health_path, health_content = _QA_HEALTH_TESTS.get(
        spec["language"],
        ("apps/api/tests/test_health.py",
         "def test_health_contract():\n"
         "    # Substitua pelo client real; valida o contrato /v1/health.\n"
         "    expected = {\"status\": \"ok\"}\n"
         "    assert expected[\"status\"] == \"ok\"\n"),
    )
    return [
        (health_path, health_content),
        (f"apps/api/tests/test_{res}_auth.py" if spec["language"] not in _QA_HEALTH_TESTS else f"apps/api/tests/{res}_auth_notes.md",
         "def test_requires_auth():\n"
         "    # 401 sem token (regra: apenas autenticados alteram registros).\n"
         "    assert 401 == 401\n"
         if spec["language"] not in _QA_HEALTH_TESTS
         else f"# Cobertura de auth para {res}\n\nGaranta um teste real de 401 sem token no framework de teste do ecossistema.\n"),
        ("deploy/postman/collection.json", json.dumps({
            "info": {"name": "LDCN Generated API", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
            "item": [{"name": "health", "request": {"method": "GET", "url": "{{baseUrl}}/v1/health"}}],
        }, indent=2) + "\n"),
        ("docs/security_review.md",
         "# Security Review (mock)\n\n"
         "| Severidade | Achado | Arquivo |\n|---|---|---|\n"
         "| info | Esqueleto gerado offline; revisar antes de produção. | (gerado) |\n"
         "\nChecklist OWASP: validação de entrada, JWT, rate limit, headers, sem segredos em texto puro.\n"),
    ]


_DOCKER_RUNTIMES: dict[str, tuple[str, str]] = {
    "java": ("eclipse-temurin:21-jre-alpine", 'CMD ["java", "-jar", "app.jar"]'),
    "typescript": ("node:20-alpine", 'CMD ["node", "dist/main.js"]'),
    "javascript": ("node:20-alpine", 'CMD ["node", "dist/main.js"]'),
    "go": ("golang:1.23-alpine", 'CMD ["go", "run", "./cmd/app"]'),
    "php": ("php:8.3-cli-alpine", 'CMD ["php", "-S", "0.0.0.0:8000", "-t", "public"]'),
    "rust": ("rust:1.80-slim", 'CMD ["cargo", "run", "--release"]'),
    "ruby": ("ruby:3.3-alpine", 'CMD ["ruby", "app.rb"]'),
    "csharp": ("mcr.microsoft.com/dotnet/sdk:8.0", 'CMD ["dotnet", "run", "--urls", "http://0.0.0.0:8000"]'),
    "kotlin": ("gradle:8-jdk17", 'CMD ["gradle", "run"]'),
}


def _files_devops(spec: dict) -> list[tuple[str, str]]:
    base_img, run = _DOCKER_RUNTIMES.get(
        spec["language"],
        ("python:3.12-slim", 'CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]'),
    )
    dockerfile = (
        f"FROM {base_img}\n"
        "WORKDIR /app\nCOPY . .\n"
        "RUN addgroup -S app 2>/dev/null || true && adduser -S app 2>/dev/null || true\n"
        "USER app\nEXPOSE 8000\n"
        "HEALTHCHECK CMD wget -qO- http://localhost:8000/v1/health || exit 1\n"
        f"{run}\n"
    )
    compose = (
        "services:\n  api:\n    build: ./apps/api\n    ports:\n      - \"8000:8000\"\n"
        "    environment:\n      - JWT_SECRET=${JWT_SECRET:-change-me}\n"
        "    depends_on:\n      - db\n  db:\n    image: postgres:16-alpine\n"
        "    environment:\n      - POSTGRES_PASSWORD=${DB_PASSWORD:-change-me}\n"
    )
    k8s = (
        "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ldcn-api\n"
        "spec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: ldcn-api\n"
        "  template:\n    metadata:\n      labels:\n        app: ldcn-api\n    spec:\n"
        "      containers:\n        - name: api\n          image: ldcn-api:latest\n"
        "          ports:\n            - containerPort: 8000\n"
        "          readinessProbe:\n            httpGet:\n              path: /v1/health\n              port: 8000\n"
        "          livenessProbe:\n            httpGet:\n              path: /v1/health\n              port: 8000\n"
    )
    ci = (
        "name: ci\non: [push, pull_request]\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
        "    steps:\n      - uses: actions/checkout@v4\n      - run: echo lint\n"
        "      - run: echo test\n      - run: echo build\n"
    )
    return [
        ("Dockerfile", dockerfile),
        ("docker-compose.yml", compose),
        ("deploy/k8s/deployment.yaml", k8s),
        (".github/workflows/ci.yml", ci),
        ("COMMITS.md", "# Conventional Commits\n\n`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.\n"),
    ]


def _files_docs(spec: dict) -> list[tuple[str, str]]:
    stack = f"{spec['language']}/{spec['framework']}"
    readme = (
        f"# {spec['intent'][:80]}\n\n"
        "> Projeto gerado pela LDCN OS Meta-Factory em **modo mock** (LLM indisponível). "
        "Estrutura fiel; revise a lógica antes de produção.\n\n"
        f"## Stack\n- {stack} ({spec['architecture']})\n\n"
        "## Como rodar (real)\n```bash\ndocker compose up --build\n```\n\n"
        "## Como rodar (mock no frontend)\nNão defina `NEXT_PUBLIC_API_URL`: o repositório usa dados mockados tipados.\n\n"
        "## Variáveis de ambiente\nVeja os `.env.example` em `apps/api` e `apps/web`.\n\n"
        "## Rastreabilidade\nVeja `docs/traceability.md`.\n"
    )
    arch = (
        "# ARCHITECTURE\n\n"
        "Monólito modular, Clean Architecture:\n\n"
        "`interface -> application(use-cases) -> domain <- infrastructure`\n\n"
        "Fluxo de uma requisição: controller (interface) valida e delega ao use-case "
        "(application), que aplica a regra de negócio sobre o domínio e persiste via "
        "repositório (infrastructure).\n"
    )
    return [("README.md", readme), ("ARCHITECTURE.md", arch)]


def _traceability(spec: dict) -> str:
    rows = "\n".join(
        f"| {entity} | criar/listar {_slug(entity)} | test_{_slug(entity)}_auth |"
        for entity in spec["entities"]
    )
    return (
        "# Matriz de Rastreabilidade\n\n"
        "| Regra de negócio / Entidade | Use-case | Teste |\n|---|---|---|\n"
        f"{rows}\n"
    )
