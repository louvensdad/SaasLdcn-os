from __future__ import annotations

import time
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Any

from app.data.foundation import CONTRACT_VERSION
from app.schemas.orchestrator import ProjectSpec

# Deep Engineering analysis: BEFORE generation, the platform thinks through the
# project the way a senior engineer would — enumerating every entity, endpoint and
# rule, justifying the architecture, surfacing risks and security, and stating the
# validation criteria it will hold itself to. The content is REAL (derived from the
# spec), not theatre. A deliberate per-stage pace is applied only when streaming, so
# the experience reflects genuine engineering instead of an instant, "fake" result.

# Words that signal sensitive data / regulated domains -> raises the risk posture.
_SENSITIVE_MARKERS = (
    "lgpd", "gdpr", "privacid", "privacy", "senha", "password", "pagamento", "payment",
    "cartão", "card", "cpf", "cnpj", "saúde", "health", "médic", "financ",
    "banc", "credit", "pii", "pessoal", "personal",
)


class DeepEngineeringEngine:
    def __init__(self, *, min_stage_seconds: float = 1.1) -> None:
        # Deliberate minimum time a stage is "thought through" when streaming.
        self.min_stage_seconds = max(0.0, float(min_stage_seconds))

    # ------------------------------------------------------------------ public

    def analyze(self, spec: ProjectSpec, blueprint: dict[str, Any] | None = None) -> dict[str, Any]:
        ctx = self._context(spec, blueprint)
        stages = [
            self._stage_requirements(ctx),
            self._stage_architecture(ctx),
            self._stage_domain(ctx),
            self._stage_api(ctx),
            self._stage_security(ctx),
            self._stage_risk(ctx),
            self._stage_build_plan(ctx),
            self._stage_validation(ctx),
        ]
        return {
            "contractVersion": CONTRACT_VERSION,
            "title": ctx["title"],
            "product_summary": ctx["product_summary"],
            "entity_count": ctx["entity_count"],
            "endpoint_count": ctx["endpoint_count"],
            "workflow_count": ctx["workflow_count"],
            "rule_count": ctx["rule_count"],
            "component_count": ctx["component_count"],
            "complexity": ctx["complexity"],
            "risk_level": ctx["risk_level"],
            "effort_estimate": ctx["effort_estimate"],
            "confidence": ctx["confidence"],
            "decisions": ctx["decisions"],
            "stages": stages,
            "security_considerations": ctx["security_considerations"],
            "validation_criteria": ctx["validation_criteria"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def iter_deep_analysis(
        self,
        spec: ProjectSpec,
        blueprint: dict[str, Any] | None = None,
        *,
        pace: bool = True,
    ) -> Iterator[dict[str, Any]]:
        """Stream the analysis stage-by-stage with a deliberate pace, then a final
        sentinel carrying the full analysis. Set ``pace=False`` for tests."""
        return self._stream(self.analyze(spec, blueprint), pace=pace)

    # --------------------------------------------------------- modernize (codebase)

    def analyze_codebase(self, inventory: Any, diagnosis: Any, plan: Any = None, stats: Any = None) -> dict[str, Any]:
        """Deep analysis for an EXISTING codebase (Modernize). Substance is derived
        from the real inventory/diagnosis/plan — never invented."""
        ctx = self._codebase_context(inventory, diagnosis, plan, stats)
        stages = [
            self._cb_stage_inventory(ctx),
            self._cb_stage_stack(ctx),
            self._cb_stage_smells(ctx),
            self._cb_stage_security(ctx),
            self._cb_stage_dependencies(ctx),
            self._cb_stage_risk(ctx),
            self._cb_stage_plan(ctx),
            self._cb_stage_validation(ctx),
        ]
        return {
            "contractVersion": CONTRACT_VERSION,
            "title": ctx["title"],
            "product_summary": ctx["product_summary"],
            "entity_count": 0,
            "endpoint_count": 0,
            "workflow_count": 0,
            "rule_count": 0,
            "component_count": ctx["file_count"],
            "complexity": ctx["complexity"],
            "risk_level": ctx["risk_level"],
            "effort_estimate": ctx["effort_estimate"],
            "confidence": ctx["confidence"],
            "decisions": ctx["decisions"],
            "stages": stages,
            "security_considerations": ctx["security_considerations"],
            "validation_criteria": ctx["validation_criteria"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def iter_codebase_analysis(self, inventory: Any, diagnosis: Any, plan: Any = None, stats: Any = None, *, pace: bool = True) -> Iterator[dict[str, Any]]:
        return self._stream(self.analyze_codebase(inventory, diagnosis, plan, stats), pace=pace)

    def _stream(self, analysis: dict[str, Any], *, pace: bool) -> Iterator[dict[str, Any]]:
        total = len(analysis["stages"])
        for index, stage in enumerate(analysis["stages"], start=1):
            yield {"type": "deep_stage_started", "index": index, "total": total, "id": stage["id"], "title": stage["title"]}
            if pace and self.min_stage_seconds > 0:
                time.sleep(self.min_stage_seconds)
            yield {"type": "deep_stage_completed", "index": index, "total": total, "stage": stage}
        yield {"type": "deep_analysis", "analysis": analysis}

    # --------------------------------------------------------------- context

    def _context(self, spec: ProjectSpec, blueprint: dict[str, Any] | None) -> dict[str, Any]:
        entities = [str(e) for e in (spec.entities or []) if str(e).strip()]
        users = [str(u) for u in (spec.target_users or []) if str(u).strip()]
        rules = [str(r) for r in (spec.business_rules or []) if str(r).strip()]
        workflows = [str(w) for w in (spec.core_workflows or []) if str(w).strip()]
        nfr = self._nfr_list(spec.non_functional)
        endpoints = self._derive_endpoints(entities, workflows)

        entity_count = len(entities)
        endpoint_count = len(endpoints)
        workflow_count = len(workflows)
        rule_count = len(rules)
        component_count = entity_count + endpoint_count + workflow_count + len(nfr)

        stack = spec.suggested_stack
        decisions = self._decisions(stack)
        risk_level, risk_reasons = self._risk(rules, entities, workflows, nfr)
        security = self._security_considerations(users, rules, nfr)
        validation = self._validation_criteria(entity_count, endpoint_count, rule_count)

        return {
            "title": spec.product_summary or spec.system_type or spec.raw_intent or "Projeto",
            "product_summary": spec.product_summary or spec.raw_intent or "",
            "system_type": spec.system_type or "",
            "entities": entities,
            "users": users,
            "rules": rules,
            "workflows": workflows,
            "nfr": nfr,
            "endpoints": endpoints,
            "entity_count": entity_count,
            "endpoint_count": endpoint_count,
            "workflow_count": workflow_count,
            "rule_count": rule_count,
            "component_count": component_count,
            "complexity": self._complexity(component_count),
            "risk_level": risk_level,
            "risk_reasons": risk_reasons,
            "effort_estimate": self._effort(component_count),
            "confidence": float(spec.confidence or 0.0),
            "stack": stack,
            "decisions": decisions,
            "security_considerations": security,
            "validation_criteria": validation,
            "assumptions": [str(a) for a in (spec.assumptions or []) if str(a).strip()],
            "open_questions": [str(q) for q in (spec.open_questions or []) if str(q).strip()],
        }

    # ----------------------------------------------------------------- stages

    def _stage_requirements(self, c: dict[str, Any]) -> dict[str, Any]:
        details = [
            f"Resumo do produto: {c['product_summary']}" if c["product_summary"] else "Resumo do produto não informado.",
            f"{c['entity_count']} entidade(s), {c['workflow_count']} fluxo(s), {c['rule_count']} regra(s) de negócio, {len(c['users'])} perfil(is) de usuário.",
        ]
        if c["assumptions"]:
            details.append("Premissas assumidas: " + "; ".join(c["assumptions"][:5]))
        if c["open_questions"]:
            details.append("Pontos em aberto a confirmar: " + "; ".join(c["open_questions"][:5]))
        return self._stage(
            "requirements", "Analisando requisitos",
            "Lendo intenção, perfis, regras e fluxos para entender exatamente o que será construído.",
            details,
            {"entities": c["entity_count"], "workflows": c["workflow_count"], "rules": c["rule_count"], "users": len(c["users"])},
            status="attention" if c["open_questions"] else "passed",
        )

    def _stage_architecture(self, c: dict[str, Any]) -> dict[str, Any]:
        details = [f"Decisão: {d['decision']} — {d['rationale']}" for d in c["decisions"]]
        for d in c["decisions"]:
            if d["alternatives"]:
                details.append(f"Alternativas a {d['decision']}: {', '.join(d['alternatives'])} (trade-off: {d['trade_offs']}).")
        return self._stage(
            "architecture", "Raciocinando sobre a arquitetura",
            "Escolhendo linguagem, framework e arquitetura com justificativa, alternativas e trade-offs.",
            details or ["Stack a definir."],
            {"decisions": len(c["decisions"])},
        )

    def _stage_domain(self, c: dict[str, Any]) -> dict[str, Any]:
        details = [f"Entidade '{e}': chave primária, timestamps, constraints e índices de busca." for e in c["entities"][:12]]
        if not details:
            details = ["Nenhuma entidade explícita; o modelo de dados será inferido dos fluxos."]
        if len(c["entities"]) > 12:
            details.append(f"… e mais {len(c['entities']) - 12} entidade(s).")
        details.append("Relacionamentos e integridade referencial serão aplicados na camada de banco; migrações antes do start.")
        return self._stage(
            "domain_data", "Modelando domínio e dados",
            "Derivando tabelas, relacionamentos, constraints e índices a partir das entidades.",
            details,
            {"entities": c["entity_count"]},
        )

    def _stage_api(self, c: dict[str, Any]) -> dict[str, Any]:
        details = [f"{ep['method']} {ep['path']} — {ep['purpose']}" for ep in c["endpoints"][:14]]
        if len(c["endpoints"]) > 14:
            details.append(f"… e mais {len(c['endpoints']) - 14} endpoint(s).")
        details.append("Autenticação por token no header Authorization; envelope de erro padrão com código estável e mensagem.")
        return self._stage(
            "api_surface", "Projetando a superfície de API",
            "Enumerando endpoints (CRUD por entidade + fluxos), autenticação e contrato de erros.",
            details or ["Sem endpoints derivados ainda."],
            {"endpoints": c["endpoint_count"]},
        )

    def _stage_security(self, c: dict[str, Any]) -> dict[str, Any]:
        return self._stage(
            "security", "Revisando segurança",
            "Aplicando OWASP, controle de acesso por perfil, proteção de dados e política de segredos.",
            c["security_considerations"],
            {"users": len(c["users"]), "considerations": len(c["security_considerations"])},
            status="attention" if c["risk_level"] != "low" else "passed",
        )

    def _stage_risk(self, c: dict[str, Any]) -> dict[str, Any]:
        details = list(c["risk_reasons"]) or ["Sem riscos elevados detectados pela análise heurística."]
        details.append(f"Complexidade estimada: {c['complexity']}. Esforço estimado: {c['effort_estimate']}.")
        return self._stage(
            "risk_complexity", "Avaliando riscos e complexidade",
            "Medindo a superfície total do sistema e classificando risco, complexidade e esforço.",
            details,
            {"components": c["component_count"]},
            status="attention" if c["risk_level"] == "high" else "passed",
        )

    def _stage_build_plan(self, c: dict[str, Any]) -> dict[str, Any]:
        details = [
            f"Contracts: OpenAPI + tipos compartilhados para {c['endpoint_count']} endpoint(s).",
            f"Backend: domínio, serviços e persistência para {c['entity_count']} entidade(s) sob a arquitetura escolhida.",
            "Frontend: telas e fluxos consumindo o contrato.",
            f"QA: testes cobrindo {c['workflow_count']} fluxo(s) e as {c['rule_count']} regra(s) de negócio.",
            "DevOps: containerização, variáveis de ambiente e pipeline.",
            "Docs: README, ARCHITECTURE, API, SECURITY, DEPLOYMENT.",
        ]
        return self._stage(
            "build_plan", "Planejando o build",
            "Definindo o que cada agente vai produzir, alinhado ao contrato único.",
            details,
            {"agents": 6, "components": c["component_count"]},
        )

    def _stage_validation(self, c: dict[str, Any]) -> dict[str, Any]:
        return self._stage(
            "validation_criteria", "Definindo critérios de validação",
            "Estabelecendo os portões que o resultado precisa passar antes de ser entregue.",
            c["validation_criteria"],
            {"criteria": len(c["validation_criteria"])},
        )

    # ------------------------------------------------------- codebase context

    def _codebase_context(self, inventory: Any, diagnosis: Any, plan: Any, stats: Any) -> dict[str, Any]:
        file_count = int(getattr(inventory, "file_count", 0) or 0)
        total_bytes = int(getattr(inventory, "total_bytes", 0) or 0)
        languages = dict(getattr(inventory, "languages", {}) or {})
        lines = int(getattr(stats, "lines_of_code", 0) or 0)
        frameworks = list(getattr(stats, "frameworks", []) or [])
        detected_stack = str(getattr(diagnosis, "detected_stack", "") or "")
        primary = str(getattr(diagnosis, "primary_language", "") or "")
        smells = list(getattr(diagnosis, "smells", []) or [])
        findings = list(getattr(diagnosis, "security_findings", []) or [])
        dep_notes = list(getattr(diagnosis, "dependency_notes", []) or [])
        plan_steps = list(getattr(plan, "steps", []) or [])
        target_arch = str(getattr(plan, "target_architecture", "") or "")

        crit = sum(1 for f in findings if str(getattr(f, "severity", "")) in {"high", "critical"})
        risk_level = "high" if (crit >= 1 and len(smells) >= 2) or crit >= 3 else "medium" if (crit or len(smells) >= 2) else "low"
        complexity = str(getattr(stats, "complexity", "") or "") or self._complexity(file_count)

        decisions = []
        if detected_stack:
            decisions.append({"decision": f"Stack detectada: {detected_stack}", "rationale": "Identificada a partir de arquivos-marcadores e extensões reais.", "alternatives": [], "trade_offs": ""})
        if frameworks:
            decisions.append({"decision": "Frameworks: " + ", ".join(frameworks), "rationale": "Detectados nos manifests do projeto.", "alternatives": [], "trade_offs": ""})
        if target_arch:
            decisions.append({"decision": f"Arquitetura-alvo: {target_arch}", "rationale": "Recomendada pela análise de modernização.", "alternatives": [], "trade_offs": "Esforço de migração vs. ganho de manutenibilidade."})

        security_considerations = [
            f"{getattr(f, 'code', 'achado')} ({getattr(f, 'severity', '?')}) em {getattr(f, 'path', '?')}:{getattr(f, 'line', '') or ''}".strip(":")
            for f in findings[:8]
        ] or ["Nenhum segredo/achado crítico encontrado pela varredura heurística."]

        return {
            "title": detected_stack or "Codebase",
            "product_summary": f"Modernização de um codebase {primary or 'existente'} ({detected_stack}).",
            "file_count": file_count,
            "total_bytes": total_bytes,
            "languages": languages,
            "lines": lines,
            "frameworks": frameworks,
            "detected_stack": detected_stack,
            "primary": primary,
            "smells": smells,
            "findings": findings,
            "crit": crit,
            "dep_notes": dep_notes,
            "plan_steps": plan_steps,
            "target_arch": target_arch,
            "complexity": complexity,
            "risk_level": risk_level,
            "effort_estimate": self._effort(file_count),
            "confidence": 0.7,
            "decisions": decisions,
            "security_considerations": security_considerations,
            "validation_criteria": [
                "Quality Gate sobre o projeto modernizado: sem bloqueadores críticos.",
                "Revalidação: comparar scores antes/depois para provar melhoria real.",
                "Varredura de segredos: nenhum token/senha/.env real no resultado.",
                "Preservação de comportamento: regra de negócio existente mantida na migração.",
            ],
        }

    def _cb_stage_inventory(self, c):
        langs = ", ".join(f"{k} ({v})" for k, v in sorted(c["languages"].items(), key=lambda kv: -kv[1])[:8]) or "—"
        details = [
            f"{c['file_count']} arquivo(s) analisável(is) · {self._human_bytes(c['total_bytes'])} · {c['lines']:,} linhas.".replace(",", "."),
            f"Linguagens: {langs}.",
        ]
        return self._stage("inventory", "Mapeando o código", "Inventariando apenas os arquivos relevantes (o ruído já foi ignorado).", details, {"files": c["file_count"], "lines": c["lines"]})

    def _cb_stage_stack(self, c):
        details = [f"Stack: {c['detected_stack'] or 'desconhecida'} · linguagem principal: {c['primary'] or '—'}."]
        if c["frameworks"]:
            details.append("Frameworks: " + ", ".join(c["frameworks"]) + ".")
        return self._stage("stack", "Detectando stack e arquitetura", "Identificando linguagem, frameworks e arquitetura reais do projeto.", details, {"frameworks": len(c["frameworks"])})

    def _cb_stage_smells(self, c):
        details = [f"{getattr(s, 'code', '')}: {getattr(s, 'message', '')}" for s in c["smells"]] or ["Nenhum smell de arquitetura detectado pela heurística."]
        return self._stage("smells", "Detectando problemas de arquitetura", "Procurando acoplamento, ausência de testes/CI/containerização e regra no controller.", details, {"smells": len(c["smells"])}, status="attention" if c["smells"] else "passed")

    def _cb_stage_security(self, c):
        return self._stage("security", "Varredura de segurança", "Procurando segredos embutidos, chaves e práticas inseguras no código real.", c["security_considerations"], {"findings": len(c["findings"]), "critical": c["crit"]}, status="attention" if c["crit"] else "passed")

    def _cb_stage_dependencies(self, c):
        details = list(c["dep_notes"]) or ["Nenhuma dependência criticamente obsoleta detectada."]
        return self._stage("dependencies", "Avaliando dependências", "Verificando versões legadas e fora de suporte.", details, {"notes": len(c["dep_notes"])})

    def _cb_stage_risk(self, c):
        details = [f"Risco geral: {c['risk_level']}.", f"Complexidade: {c['complexity']}. Esforço estimado de modernização: {c['effort_estimate']}."]
        if c["crit"]:
            details.append(f"{c['crit']} achado(s) de segurança alto/crítico exigem atenção imediata.")
        return self._stage("risk_complexity", "Avaliando riscos e complexidade", "Classificando risco e esforço a partir de tamanho, smells e segurança.", details, {"files": c["file_count"]}, status="attention" if c["risk_level"] == "high" else "passed")

    def _cb_stage_plan(self, c):
        details = list(c["plan_steps"]) or ["Plano de modernização será detalhado na análise completa."]
        if c["target_arch"]:
            details.insert(0, f"Arquitetura-alvo: {c['target_arch']}.")
        return self._stage("build_plan", "Planejando a modernização", "Definindo os passos para migrar preservando a regra de negócio.", details, {"steps": len(c["plan_steps"])})

    def _cb_stage_validation(self, c):
        return self._stage("validation_criteria", "Definindo critérios de validação", "Estabelecendo os portões que o projeto modernizado precisa passar.", c["validation_criteria"], {"criteria": len(c["validation_criteria"])})

    def _human_bytes(self, n: int) -> str:
        value = float(n)
        for unit in ("B", "KB", "MB", "GB"):
            if value < 1024 or unit == "GB":
                return f"{value:.0f} {unit}" if unit == "B" else f"{value:.1f} {unit}"
            value /= 1024
        return f"{n} B"

    # ----------------------------------------------------------------- helpers

    def _decisions(self, stack: Any) -> list[dict[str, Any]]:
        decisions: list[dict[str, Any]] = []
        if getattr(stack, "language", ""):
            decisions.append({
                "decision": f"Linguagem: {stack.language}",
                "rationale": stack.language_reason or "Adequada ao domínio e ao ecossistema do time.",
                "alternatives": [],
                "trade_offs": "Curva de aprendizado vs. produtividade e suporte do ecossistema.",
            })
        if getattr(stack, "framework", ""):
            decisions.append({
                "decision": f"Framework: {stack.framework}",
                "rationale": stack.framework_reason or "Equilíbrio entre produtividade, performance e maturidade.",
                "alternatives": [],
                "trade_offs": "Convenção vs. flexibilidade; tamanho da comunidade.",
            })
        if getattr(stack, "architecture", ""):
            decisions.append({
                "decision": f"Arquitetura: {stack.architecture}",
                "rationale": stack.architecture_reason or "Separa responsabilidades e isola regra de negócio.",
                "alternatives": ["Monólito simples", "Microsserviços"],
                "trade_offs": "Simplicidade inicial vs. escalabilidade e isolamento de mudanças.",
            })
        return decisions

    def _derive_endpoints(self, entities: list[str], workflows: list[str]) -> list[dict[str, str]]:
        endpoints: list[dict[str, str]] = []
        for entity in entities:
            base = self._slug(entity)
            if not base:
                continue
            endpoints.extend([
                {"method": "GET", "path": f"/{base}", "purpose": f"Listar {entity}"},
                {"method": "POST", "path": f"/{base}", "purpose": f"Criar {entity}"},
                {"method": "GET", "path": f"/{base}/{{id}}", "purpose": f"Detalhar {entity}"},
                {"method": "PUT", "path": f"/{base}/{{id}}", "purpose": f"Atualizar {entity}"},
                {"method": "DELETE", "path": f"/{base}/{{id}}", "purpose": f"Remover {entity}"},
            ])
        for workflow in workflows:
            slug = self._slug(workflow)
            if slug:
                endpoints.append({"method": "POST", "path": f"/{slug}", "purpose": f"Fluxo: {workflow}"})
        return endpoints

    def _security_considerations(self, users: list[str], rules: list[str], nfr: list[str]) -> list[str]:
        items = [
            "Validação de entrada em toda a borda (OWASP A03 — Injeção).",
            "Segredos apenas em variáveis de ambiente; nunca no código nem no repositório.",
            "Autorização por perfil aplicada no servidor, não só na UI (OWASP A01 — Broken Access Control).",
        ]
        if users:
            items.append("Perfis de acesso: " + ", ".join(users[:6]) + " — cada rota declara o nível exigido.")
        if any(self._is_sensitive(r) for r in rules) or any(self._is_sensitive(n) for n in nfr):
            items.append("Dados sensíveis/regulados detectados: criptografia em repouso, minimização e trilha de auditoria (LGPD).")
        items.append("Tratamento de erros sem vazar stack trace ou dados internos ao cliente.")
        return items

    def _validation_criteria(self, entity_count: int, endpoint_count: int, rule_count: int) -> list[str]:
        return [
            "Quality Gate: estrutura, manifesto e segurança sem bloqueadores críticos.",
            f"Completude: cobertura das {entity_count} entidade(s) e {endpoint_count} endpoint(s) planejados.",
            f"Rastreabilidade: cada uma das {rule_count} regra(s) de negócio mapeada para código/teste.",
            "Varredura de segredos: nenhum token, senha ou .env real no resultado.",
            "Documentação obrigatória presente (README, ARCHITECTURE, API, SECURITY, DEPLOYMENT).",
        ]

    def _risk(self, rules, entities, workflows, nfr) -> tuple[str, list[str]]:
        reasons: list[str] = []
        sensitive = any(self._is_sensitive(x) for x in [*rules, *nfr])
        if sensitive:
            reasons.append("Domínio lida com dados sensíveis/regulados — exige controles de privacidade e auditoria.")
        size = len(entities) + len(workflows)
        if size >= 18:
            reasons.append("Superfície grande (muitas entidades/fluxos) — risco de acoplamento e regressões.")
        if not workflows:
            reasons.append("Fluxos de negócio não detalhados — risco de escopo ambíguo.")
        level = "high" if sensitive and size >= 12 else "medium" if (sensitive or size >= 12) else "low"
        return level, reasons

    def _nfr_list(self, non_functional: Any) -> list[str]:
        if isinstance(non_functional, dict):
            return [f"{k}: {v}" for k, v in non_functional.items()]
        if isinstance(non_functional, list):
            return [str(item) for item in non_functional if str(item).strip()]
        return []

    def _complexity(self, components: int) -> str:
        if components <= 0:
            return "Indefinida"
        if components < 8:
            return "Baixa"
        if components < 20:
            return "Média"
        if components < 50:
            return "Alta"
        return "Muito alta (Enterprise)"

    def _effort(self, components: int) -> str:
        if components < 8:
            return "1 sprint"
        if components < 20:
            return "1–2 sprints"
        if components < 50:
            return "2–4 sprints"
        return "4+ sprints (faseado)"

    def _is_sensitive(self, text: str) -> bool:
        lowered = str(text).lower()
        return any(marker in lowered for marker in _SENSITIVE_MARKERS)

    def _slug(self, text: str) -> str:
        out = []
        for ch in str(text).strip().lower():
            if ch.isalnum():
                out.append(ch)
            elif ch in {" ", "-", "_"} and out and out[-1] != "-":
                out.append("-")
        return "".join(out).strip("-")

    def _stage(self, stage_id, title, summary, details, metrics, *, status="passed") -> dict[str, Any]:
        return {"id": stage_id, "title": title, "summary": summary, "details": details, "metrics": metrics, "status": status}


deep_engineering_engine = DeepEngineeringEngine()
