# Architect Engine — Refactor Premium

Data: 2026-06-26 · Branch: `feat/premium-foundation`

## De resumo → arquitetura

O Architect deixou de ser um resumo. Cada decisão agora carrega profundidade de
engenheiro sênior, e a página foi reorganizada em **abas premium** (Decisões · Modelo ·
Estratégias) com **acordeões** para manter a tela curta e expansível sob demanda.

## Campos por decisão (`BlueprintDecision`)

`apps/api/app/schemas/architecture_blueprint.py` + `app/engines/architect_engine.py`:

- decisão, justificativa, contexto, requisitos atendidos (`requirement_links`),
  trade-offs, alternativas consideradas;
- **impactos por dimensão**: `security_impact`, `scalability_impact`,
  `maintainability_impact`, `cost_impact` (**banda qualitativa**, não monetária);
- riscos, quando reconsiderar, dependências, **evidências utilizadas**;
- **confiança por decisão** (`confidence` 0..1 + `confidence_basis`).

## Confiança calculada (nunca inventada)

`_enrich_decision()` deriva a confiança de sinais **reais** da própria decisão:
criticidade da área (base), +bônus quando há requisitos citados/alternativas,
e **penalização honesta** para escolhas opcionais/condicionais (ex.: integrações
"Nenhuma…" ficam abaixo de database). Teste: `database.confidence > integrations.confidence`.

## Vistas estruturadas (determinísticas, honestas)

`app/engines/architecture_model_engine.py` (`architecture_model` no room):
Context Diagram, **Bounded Contexts** (derivados de entidades+áreas — Billing só
aparece com evidência real de pagamento), Data Flow, Auth Flow, Dependências,
Eventos, Cache, Deploy e **Disaster Recovery**. Cada vista vem vazia / `available:false`
quando não há base, e a UI mostra "sem evidências suficientes" — nunca um diagrama inventado.

> Escopo: vistas determinísticas estruturadas (sem renderizador C4 gráfico de 4 níveis,
> reservado para uma fase 2), conforme decisão de escopo.

## LLM

`ARCHITECT_SYSTEM_PROMPT` foi estendido para o LLM emitir todos os campos profundos
quando uma chave estiver ativa; sem LLM, o caminho determinístico preenche os mesmos
campos e é rotulado como preview degradado.

## Validação

`tsc` limpo · `npm run build` (/architect 6.49 kB) · `test_architect_engine.py` +
`test_architecture_model.py` verdes · Playwright `architect-premium.spec.ts` (3 testes).
