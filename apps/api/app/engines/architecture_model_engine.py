from __future__ import annotations

from typing import Any

# Builds the deterministic ArchitectureModel (structured views) from the real spec +
# blueprint. Honest by construction: a view that has no evidence comes back empty /
# `available=False`, and the UI renders "sem evidências suficientes" rather than a
# fabricated diagram. No LLM is involved — `deterministic=True`.


def build_architecture_model(room: dict[str, Any]) -> dict[str, Any] | None:
    blueprint = room.get("architecture_blueprint") or {}
    decisions = [d for d in (blueprint.get("decisions") or []) if isinstance(d, dict)]
    if not decisions:
        return None

    spec = room.get("spec") or {}
    areas = {d.get("area") for d in decisions}
    by_area = {d.get("area"): d for d in decisions}
    entities = [e for e in (spec.get("entities") or []) if isinstance(e, str)]
    nf = spec.get("non_functional") or {}
    has_payments = any("pag" in e.lower() or "payment" in e.lower() for e in entities) or any(
        "pag" in str(k).lower() or "payment" in str(k).lower() for k in nf
    )
    has_integrations = "integrations" in areas and "nenhuma" not in str(by_area.get("integrations", {}).get("choice", "")).lower()

    return {
        "deterministic": True,
        "context_diagram": _context_diagram(areas, has_integrations),
        "bounded_contexts": _bounded_contexts(areas, entities, has_payments, has_integrations),
        "data_flow": _data_flow(areas),
        "auth_flow": _auth_flow(areas),
        "dependencies": _dependencies(decisions),
        "events": _events(has_integrations, has_payments),
        "cache_strategy": _cache_strategy(nf, entities),
        "deploy_strategy": _deploy_strategy(by_area.get("deploy")),
        "disaster_recovery": _disaster_recovery(areas),
    }


def _context_diagram(areas: set, has_integrations: bool) -> dict[str, Any]:
    nodes = [
        {"id": "user", "label": "Usuário", "kind": "actor"},
        {"id": "frontend", "label": "Frontend", "kind": "layer"},
        {"id": "api", "label": "API", "kind": "layer"},
        {"id": "backend", "label": "Serviços", "kind": "layer"},
        {"id": "db", "label": "Banco", "kind": "store"},
    ]
    edges = [
        {"from_id": "user", "to_id": "frontend", "label": "usa"},
        {"from_id": "frontend", "to_id": "api", "label": "HTTP"},
        {"from_id": "api", "to_id": "backend", "label": "invoca"},
        {"from_id": "backend", "to_id": "db", "label": "lê/grava"},
    ]
    if "mobile" in areas:
        nodes.append({"id": "mobile", "label": "App Mobile", "kind": "layer"})
        edges.append({"from_id": "user", "to_id": "mobile", "label": "usa"})
        edges.append({"from_id": "mobile", "to_id": "api", "label": "HTTP"})
    if has_integrations:
        nodes.append({"id": "external", "label": "Serviços externos", "kind": "external"})
        edges.append({"from_id": "backend", "to_id": "external", "label": "integra"})
    if "observability" in areas:
        nodes.append({"id": "obs", "label": "Observabilidade", "kind": "node"})
        edges.append({"from_id": "backend", "to_id": "obs", "label": "logs/métricas"})
    return {"nodes": nodes, "edges": edges}


def _bounded_contexts(areas: set, entities: list[str], has_payments: bool, has_integrations: bool) -> list[dict[str, Any]]:
    contexts: list[dict[str, Any]] = []

    def ctx(name: str, responsibility: str, ents: list[str], rels: list[str], evidence: str) -> dict[str, Any]:
        return {"name": name, "responsibility": responsibility, "entities": ents, "relationships": rels, "evidence": evidence}

    # Auth/Identity is present whenever auth was decided.
    if "auth" in areas or "authorization" in areas:
        user_entities = [e for e in entities if any(t in e.lower() for t in ("user", "usuar", "conta", "account", "perfil", "profile"))]
        contexts.append(ctx("Identity & Access", "Autenticação, papéis e permissões.", user_entities, ["Todos os contextos (autoriza acesso)"], "auth/authorization decididos"))
    # Billing only when there is real payment evidence.
    if has_payments:
        pay_entities = [e for e in entities if any(t in e.lower() for t in ("pag", "payment", "invoice", "fatura", "assinat", "subscription"))]
        contexts.append(ctx("Billing", "Cobrança, pagamentos e reconciliação.", pay_entities, ["Identity & Access", "Notification"], "entidade(s)/NFR de pagamento na spec"))
    # Notification when integrations exist (e-mail/webhook surface).
    if has_integrations:
        contexts.append(ctx("Notification", "Envio de notificações e webhooks.", [], ["Billing", "Identity & Access"], "integrações externas decididas"))
    # Files when an upload/file-like entity exists.
    file_entities = [e for e in entities if any(t in e.lower() for t in ("file", "arquivo", "document", "anexo", "media", "imagem", "image"))]
    if file_entities:
        contexts.append(ctx("Files", "Upload, armazenamento e acesso a arquivos.", file_entities, ["Identity & Access"], "entidade(s) de arquivo na spec"))
    # Core domain — the remaining entities not already claimed.
    claimed = {e for c in contexts for e in c["entities"]}
    core_entities = [e for e in entities if e not in claimed]
    if core_entities:
        contexts.append(ctx("Core Domain", "Entidades e regras centrais do negócio.", core_entities, ["Identity & Access"], "entidades do domínio na spec"))
    return contexts


def _data_flow(areas: set) -> list[dict[str, Any]]:
    steps = [
        ("Usuário", "Inicia a ação na interface."),
        ("Frontend", "Valida e envia a requisição tipada."),
        ("API", "Autentica, autoriza e roteia."),
        ("Service", "Aplica a regra de negócio."),
        ("Repository", "Acesso a dados isolado."),
        ("Banco", "Persistência transacional."),
    ]
    if "observability" in areas:
        steps.append(("Logs/Métricas", "Registro estruturado e observabilidade."))
    return [{"step": s, "detail": d} for s, d in steps]


def _auth_flow(areas: set) -> list[dict[str, Any]]:
    if "auth" not in areas and "authorization" not in areas:
        return []
    steps = [
        ("Login", "Credenciais verificadas (hash forte)."),
        ("JWT", "Emissão de access token."),
        ("Refresh Token", "Renovação sem novo login."),
    ]
    if "authorization" in areas:
        steps += [("RBAC", "Papel do usuário resolvido."), ("Permissões", "Checagem por recurso no servidor.")]
    steps.append(("Auditoria", "Registro de acessos sensíveis."))
    return [{"step": s, "detail": d} for s, d in steps]


def _dependencies(decisions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deps = []
    for d in decisions:
        depends_on = [x for x in (d.get("dependencies") or []) if isinstance(x, str)]
        if depends_on:
            deps.append({"module": d.get("area", ""), "depends_on": depends_on})
    return deps


def _events(has_integrations: bool, has_payments: bool) -> dict[str, Any]:
    if not (has_integrations or has_payments):
        return {"available": False, "summary": "Sem evidências de arquitetura orientada a eventos no escopo atual.", "items": []}
    return {
        "available": True,
        "summary": "Webhooks/eventos derivados das integrações do domínio.",
        "items": [
            "Origem: serviço externo (ex.: gateway de pagamento).",
            "Consumidor: handler idempotente no backend.",
            "Retries: backoff exponencial.",
            "Dead Letter: fila para eventos não processados.",
        ],
    }


def _cache_strategy(nf: dict, entities: list[str]) -> dict[str, Any]:
    perf = nf.get("performance") if isinstance(nf, dict) else None
    if not perf and len(entities) < 4:
        return {"available": False, "summary": "Cache não recomendado para a 1ª versão (sem requisito de performance explícito).", "items": []}
    return {
        "available": True,
        "summary": "Cache opcional (Redis) para leituras quentes — adotar sob evidência de carga.",
        "items": [
            "Tecnologia: Redis (opcional na v1).",
            "TTL: curto para dados voláteis, longo para referência.",
            "Chaves: por recurso + versão do dado.",
            "Invalidação: na escrita do recurso correspondente.",
        ],
    }


def _deploy_strategy(deploy_decision: dict[str, Any] | None) -> dict[str, Any]:
    if not deploy_decision:
        return {"available": False, "summary": "Estratégia de deploy ainda não decidida.", "items": []}
    items = [f"Escolha: {deploy_decision.get('choice', '')}", f"Justificativa: {deploy_decision.get('justification', '')}"]
    alternatives = deploy_decision.get("alternatives_considered") or []
    if alternatives:
        items.append("Alternativas: " + ", ".join(alternatives))
    return {"available": True, "summary": "Empacotamento reproduzível e entrega automatizada.", "items": items}


def _disaster_recovery(areas: set) -> dict[str, Any]:
    if "database" not in areas:
        return {"available": False, "backup": "", "restore": "", "rto": "", "rpo": "", "replication": ""}
    return {
        "available": True,
        "backup": "Backups automáticos diários do banco relacional.",
        "restore": "Restore testado a partir do último backup íntegro.",
        "rto": "Alvo qualitativo: baixo (restaurar serviço em horas, não dias).",
        "rpo": "Alvo qualitativo: perda máxima de ~1 dia (backup diário); reduzir com PITR.",
        "replication": "Réplica de leitura recomendada quando a carga/HA justificar.",
    }


architecture_model_engine = build_architecture_model
