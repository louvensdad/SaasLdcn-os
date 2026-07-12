# Deep Engineering Mode

## Problem
Generation/modernization finished almost instantly, which made the platform feel "fake" and
unsafe — not like a real software-engineering system. The product promises premium engineering;
the experience must reflect that, with class and security.

## Approach
A reusable **Deep Engineering pre-flight analysis** that runs *before* any code is produced. It
is **real computation derived from the spec** (not theatre), and it is streamed stage-by-stage
with a deliberate pace so the user sees the system genuinely reasoning through the project.

### Engine — `apps/api/app/engines/deep_engineering_engine.py`
`DeepEngineeringEngine.analyze(spec, blueprint)` produces a `DeepEngineeringAnalysis` with eight
substantive stages, each derived from the real `ProjectSpec`:
1. **Requisitos** — entities/users/rules/workflows counted and restated; assumptions & open questions.
2. **Arquitetura** — language/framework/architecture decisions with rationale, alternatives, trade-offs.
3. **Domínio e dados** — per-entity tables, constraints, indexes, relationships.
4. **API** — endpoints enumerated (CRUD per entity + one per workflow), auth, error envelope.
5. **Segurança** — OWASP, per-role authorization, secret policy, LGPD when sensitive data is detected.
6. **Riscos e complexidade** — risk level, complexity band, effort estimate from the total surface.
7. **Plano de build** — what each agent (contracts/backend/frontend/qa/devops/docs) will produce.
8. **Critérios de validação** — the gates the result must pass (Quality Gate, completeness,
   traceability, secret scan, mandatory docs).

Aggregates: entity/endpoint/workflow/rule/component counts, complexity, risk level, effort,
confidence, architecture decisions, security considerations, validation criteria.

`iter_deep_analysis(spec, blueprint, pace=True)` streams `deep_stage_started` →
(deliberate minimum think time) → `deep_stage_completed` per stage, then a `deep_analysis`
sentinel. The pace is the only "slow" part and is **disabled in tests** (`pace=False`); the
content is identical either way.

### API — `routes/deep_engineering.py`
- `POST /api/deep-engineering/analyze` — synchronous full analysis (no pacing). Reusable by the
  project room and Modernize to render the analysis without a live animation.
- `POST /api/deep-engineering/analyze/stream` — paced SSE for the live thinking experience.

### UI — Meta-Factory
Before the generation stage loop, the page runs `deepAnalyzeStream(spec, blueprint)` and renders
a **"Análise de engenharia profunda"** panel: each stage appears deliberately with its substance
(decisions, endpoints, security, risk), followed by complexity/risk/effort/components chips. A
failed pre-flight never blocks generation.

## Why this fixes the perception honestly
- It is **real**: every line is derived from the actual spec (entities, rules, stack, NFRs).
- It is **deliberate**: a minimum pace per stage replaces the instant flash with visible reasoning.
- It reinforces **security & trust**: explicit security and validation stages show the system
  holding itself to standards before it builds.

## Reuse across all three flows
A shared React panel `components/engineering/deep-analysis-panel.tsx` renders the staged thinking
(driven by any SSE `run` function), used by:
- **Meta-Factory generation** — inline phase before the agent loop.
- **Project creation room** (`/project-rooms/[roomId]`) — at `BLUEPRINT_READY` / `ENGINEERING_REVIEW`,
  via `metaFactoryClient.deepAnalyzeStream(spec, blueprint)` (the spec-based `/deep-engineering/analyze/stream`).
- **Modernize** (`/modernize`) — after ingestion, via
  `metaFactoryClient.deepAnalyzeModernizeStream(ingest_id)`.

### Modernize (codebase-based) analysis
Because Modernize has a codebase, not a spec, the engine gained
`analyze_codebase(inventory, diagnosis, plan, stats)` / `iter_codebase_analysis(...)` producing
codebase-appropriate stages — **inventário, stack/arquitetura detectada, smells, segurança
(achados reais), dependências, risco/complexidade, plano de modernização, validação** — derived
from the real inventory/diagnosis/plan. Exposed at
`POST /api/modernize/deep-analyze/stream` (paced SSE, keyed by `ingest_id`).

## Validation
- `apps/api/tests/test_deep_engineering.py` (9): spec-based analysis substance, decisions with
  rationale/alternatives/trade-offs, sensitive domain raises security+risk, streaming 8 stages +
  sentinel, empty spec, sync route, unpaced stream route, **codebase analysis derived from
  inventory/diagnosis**, and the **`/modernize/deep-analyze/stream` route**.
- Fast backend suite: **344 passed, 1 skipped, 1 deselected**.
- `tsc` clean · `next build` ✓ (`/meta-factory`, `/project-rooms/[roomId]`, `/modernize`).

## Note
Mid-task, a parallel "Modernize cockpit" refactor had left the Modernize route/page/contract
referencing schema/contract types that didn't yet exist (the app failed to import). Those types
were reconciled (schema + contract now define `ModernizeExecutiveSummary`, `ModernizeScoreMetric`,
`ModernizeFindingSummary`, `ModernizeDetectedTechnology`); the deep-analysis wiring sits cleanly on
top of the repaired cockpit.
