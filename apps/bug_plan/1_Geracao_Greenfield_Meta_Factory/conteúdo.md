# Área 1 — Geração Greenfield (Meta-Factory)

Fluxo: ideia → Wizard → Project Room → PromptMaster → Blueprint (Architect) → Meta-Factory (geração via SSE) → Handoff.

## Frontend
- `apps/web/app/(app)/wizard/page.tsx`, `/new/page.tsx`, `/[missionId]/page.tsx`
- `apps/web/app/(app)/project-rooms/page.tsx`, `/new`, `/import`, `/[roomId]`
- `apps/web/app/(app)/meta-factory/page.tsx`
- `apps/web/app/(app)/architect/page.tsx`
- Componentes: `components/wizard/`, `components/project/`, `components/generation/` (19 arquivos)

## Backend — rotas
| Arquivo | Linhas |
|---|---|
| `routes/meta_factory.py` | 1386 |
| `routes/project_rooms.py` | 522 |
| `routes/local_generation.py` | 74 |
| `routes/meta_factory_job_helpers.py` | 64 |
| `routes/backend_generation.py` | 49 |
| `routes/meta_factory_stream_helpers.py` | 33 |
| `routes/prompt_master.py` | 28 |
| `routes/blueprints.py` | 14 |

## Backend — engines
| Arquivo | Linhas | O que faz |
|---|---|---|
| `engines/generation_job_engine.py` | 2280 | Orquestra o job de geração ponta a ponta — maior arquivo da área |
| `engines/backend_generation_engine.py` | 1131 | Geração de código backend |
| `engines/agent_prompts.py` | 746 | Prompts dos agentes (BACKEND_RULES etc.) |
| `engines/blueprint_engine.py` | 714 | Constrói o blueprint de arquitetura |
| `engines/prompt_master_engine.py` | 510 | Transforma spec em PromptMaster |
| `engines/factory_pipeline.py` | 500 | Pipeline principal do Meta-Factory |
| `engines/prompt_master_md_engine.py` | 448 | Autoria do `.md` do PromptMaster |
| `engines/architect_engine.py` | 438 | Agente arquiteto — spec → decisões de arquitetura |
| `engines/generation_handoff_engine.py` | 331 | Entrega final do projeto gerado |
| `engines/local_generation_engine.py` | 327 | Fallback de geração local sem IA |
| `engines/generation_job_helpers.py` | 182 | Helpers do job engine |
| `engines/generation_pipeline_policy.py` | 108 | Regras de política do pipeline |
| `engines/generation_validation_engine.py` | 59 | Validação de geração |
| `engines/agent_executor.py` | 74 | Executa agentes individuais |
| `engines/generation_usage.py` | 24 | Tracking de uso/tokens |
| `engines/orchestrator_engine.py` | — | Helpers de coerção/normalização do orquestrador |
| `engines/delivery_decision_engine.py` | — | Decide se/como entregar a geração (Git conectado ou não) |
| `engines/memory_engine.py` | — | Promove assumptions da spec a candidatos de memória |

## Schemas
`architecture_blueprint.py`, `architecture_manifest.py`, `architecture_model.py`, `backend_generation.py`, `blueprint.py`, `generation_handoff.py`, `generation_job.py`, `generation_notification.py`, `generation_validation.py`, `local_generation.py`, `project_room.py`, `prompt_master.py`

## Testes (apps/api/tests)
`test_meta_factory.py`, `test_meta_factory_413.py`, `test_meta_factory_stage.py`, `test_generation_job_pipeline.py`, `test_generation_job_sse.py`, `test_generation_job_leases.py`, `test_generation_job_recovery_wiring.py`, `test_generation_job_token_reservation.py`, `test_generation_job_token_reservation_postgres.py`, `test_generation_job_reserved_tokens_sql.py`, `test_generation_notifications.py`, `test_generation_pipeline_policy.py`, `test_generation_validation.py`, `test_generation_handoff.py`, `test_backend_generation.py`, `test_local_generation.py`, `test_architect_engine.py`, `test_blueprint_governance.py`, `test_blueprint_response_pipeline.py`, `test_blueprints.py`, `test_prompt_master.py`, `test_prompt_master_authoring.py`, `test_project_rooms.py`, `test_architecture_model.py`, `test_architecture_manifest_planner.py`, `test_architecture_consolidation_gate.py`, `test_architectural_graph.py`

## Ponto de atenção
`generation_job_engine.py` (2280 linhas) é o maior arquivo da área e um candidato claro a "god service" — viola a regra "no giant god services" da Master Requirements Ledger. Bom ponto de partida para entender responsabilidades antes de mexer no que está ao redor.
