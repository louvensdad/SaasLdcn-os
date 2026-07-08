from __future__ import annotations

from datetime import UTC, datetime

from app.schemas.execution_plan import ExecutionPlan, ExecutionPlanPhase

# Execution Plan Engine (Engineering Employee Mode, section 3): a static,
# deterministic description of what each pipeline stage actually does. Takes
# the real ordered stage-id list as a parameter (rather than importing
# generation_job_engine.steps_for/logical_stages_for directly) to avoid a
# circular import -- generation_job_engine is the caller that wires this in.

_PHASE_DEFINITIONS: dict[str, dict[str, str]] = {
    "contracts": {
        "label": "Contratos",
        "objective": "Definir os contratos de API (endpoints, DTOs, schemas) antes de qualquer código.",
        "expected_input": "ProjectSpec e Blueprint já aprovados (Engineering Review + Stack Approval Gate).",
        "expected_output": "Especificação de contratos validada deterministicamente.",
        "risk": "Contratos incompletos ou inconsistentes se propagam em retrabalho no backend e no frontend.",
        "approval_criteria": "Validação determinística (CONTRACTS_VALIDATING); nenhuma aprovação humana extra.",
    },
    "database": {
        "label": "Banco de Dados",
        "objective": "Gerar o schema de banco de dados a partir do modelo de domínio.",
        "expected_input": "Entidades declaradas no ProjectSpec.",
        "expected_output": "Schema SQL gerado deterministicamente (sem chamada de LLM).",
        "risk": "Modelo de dados não reflete as regras de negócio reais do ProjectSpec.",
        "approval_criteria": "Validação determinística (DATABASE_VALIDATING).",
    },
    "backend": {
        "label": "Backend",
        "objective": "Gerar a implementação do backend: estrutura, entidades, controllers, services, repositories, auth, validação e testes.",
        "expected_input": "Contratos validados, stack aprovada e stack lock.",
        "expected_output": "Código backend completo e compilável.",
        "risk": "Maior superfície de geração do pipeline -- classes reais já encontradas incluem pacote Java nomeado com palavra reservada, árvores de backend duplicadas e SQL injection por concatenação de string.",
        "approval_criteria": "Validação de build (BACKEND_VALIDATING) + Quality Gate; bloqueios críticos impedem o release.",
    },
    "frontend": {
        "label": "Frontend",
        "objective": "Gerar a interface de usuário consumindo os contratos do backend.",
        "expected_input": "Resumo do contrato (não o payload OpenAPI completo) + Blueprint.",
        "expected_output": "Código frontend completo, com páginas de listagem/criação/edição por recurso.",
        "risk": "Cobertura de tela incompleta (ex.: só uma tela de Dashboard) -- já ocorreu em teste ao vivo.",
        "approval_criteria": "FRONTEND_VALIDATING + Functional Completeness Gate (nunca VERIFIED apenas por build passar).",
    },
    "mobile": {
        "label": "Mobile",
        "objective": "Gerar o app mobile (Expo/React Native) quando o delivery_type inclui mobile.",
        "expected_input": "Contratos + stack mobile aprovada (Expo confirmado; Flutter ainda não disponível).",
        "expected_output": "Código mobile completo: telas, navegação e cliente de API.",
        "risk": "Login sem persistência de token (tela de login que não autentica de fato) -- já ocorreu em teste ao vivo.",
        "approval_criteria": "MOBILE_VALIDATING + Functional Completeness Gate (login-only nunca é VERIFIED).",
    },
    "security": {
        "label": "Segurança",
        "objective": "Escanear segredos hardcoded e padrões inseguros no código já gerado.",
        "expected_input": "Todo o código gerado até este ponto do pipeline.",
        "expected_output": "Relatório de segurança (Quality Gate).",
        "risk": "Segredo real (chave de API, senha) vazado no código gerado.",
        "approval_criteria": "Nenhuma auto-aprovação -- qualquer achado crítico bloqueia o release (_require_verified).",
    },
    "tests": {
        "label": "Testes",
        "objective": "Gerar e executar a suíte de testes do projeto.",
        "expected_input": "Código backend e frontend já gerado.",
        "expected_output": "Relatório de execução de testes.",
        "risk": "Testes superficiais que não exercitam os fluxos de negócio reais.",
        "approval_criteria": "TESTS_RUNNING.",
    },
    "docs": {
        "label": "Documentação",
        "objective": "Gerar a documentação do projeto (README, guia de setup e execução).",
        "expected_input": "Código gerado + decisões de arquitetura do Blueprint.",
        "expected_output": "README.md e documentação de apoio.",
        "risk": "Documentação afirma algo que não foi de fato gerado (ex.: docker-compose inexistente).",
        "approval_criteria": "README Truth Guard (documentation_engine) confere a documentação contra o que existe de fato.",
    },
    "build": {
        "label": "Build",
        "objective": "Rodar o build real (npm/pip/mvn) do projeto, com auto-reparo limitado.",
        "expected_input": "Todo o código gerado.",
        "expected_output": "Relatório de build e status (PASSED ou SKIPPED_AFTER_FAILURE).",
        "risk": "Build falha após o limite de tentativas automáticas (máximo 2); guia manual de correção é necessário.",
        "approval_criteria": "Revisão humana obrigatória quando o build for SKIPPED_AFTER_FAILURE.",
    },
    "package": {
        "label": "Empacotamento",
        "objective": "Empacotar o projeto final para download ou exportação.",
        "expected_input": "Projeto já validado pelas etapas anteriores.",
        "expected_output": "Pacote pronto (zip ou push para repositório).",
        "risk": "Nenhum -- etapa determinística final.",
        "approval_criteria": "Coberto pelo gate de release (_require_verified); nenhuma etapa de aprovação separada.",
    },
}

_FALLBACK_PHASE = {
    "label": "Etapa",
    "objective": "Etapa do pipeline sem descrição registrada.",
    "expected_input": "Não documentado.",
    "expected_output": "Não documentado.",
    "risk": "Não avaliado.",
    "approval_criteria": "Não definido.",
}


def build_execution_plan(delivery_type: str, logical_stages: list[str]) -> ExecutionPlan:
    phases = [
        ExecutionPlanPhase(id=stage_id, **_PHASE_DEFINITIONS.get(stage_id, _FALLBACK_PHASE))
        for stage_id in logical_stages
    ]
    return ExecutionPlan(
        delivery_type=delivery_type,
        phases=phases,
        generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
    )
