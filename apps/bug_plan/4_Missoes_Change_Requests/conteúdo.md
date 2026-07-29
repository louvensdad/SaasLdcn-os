# Área 4 — Missões / Change Requests / Agentes

Área mais nova (Agent Registry + Event Bus + notificações polimórficas chegaram nos últimos 49 commits puxados do remoto). Maior chance de bug "de estreia".

## Frontend
- `apps/web/app/(app)/change-requests/page.tsx`
- `apps/web/modules/mission-workspace/` (37 arquivos — workspace de execução de missão em tempo real)

## Backend — rotas
| Arquivo | Linhas |
|---|---|
| `routes/mission_deliverable_jobs.py` | 211 |
| `routes/missions.py` | 165 |
| `routes/change_requests.py` | 162 |
| `routes/agent_foundation.py` | 12 |

## Backend — engines
| Arquivo | Linhas | O que faz |
|---|---|---|
| `engines/mission_deliverable_job_engine.py` | 351 | Job assíncrono (SSE) de elaboração de entregável de missão |
| `engines/agent_foundation_engine.py` | 186 | Registro/status dos papéis de agente (Agent Registry) |
| `engines/change_classification_engine.py` | 158 | Classifica um Change Request |
| `engines/mission_generation_bridge.py` | 138 | Ponte entre respostas da missão e a geração |
| `engines/change_impact_engine.py` | 118 | Avalia impacto de uma mudança |
| `engines/change_patch_engine.py` | 108 | Gera o patch da mudança |
| `engines/mission_artifact_engine.py` | 99 | Artefatos gerados por uma missão |
| `engines/mission_field_action_engine.py` | 47 | Ações de campo dentro do workspace de missão |
| `engines/mission_execution_policy_registry.py` | 38 | Políticas de execução de missão |

## Backend — services
| Arquivo | Linhas | O que faz |
|---|---|---|
| `services/change_request_service.py` | 445 | Regras de negócio de Change Request |
| `services/mission_execution_handoff_service.py` | 266 | Handoff de execução de missão |
| `services/mission_service.py` | 161 | Serviço central de missões |
| `services/change_snapshot_service.py` | 106 | Snapshot de estado para diff de mudanças |
| `services/diff_service.py` | 54 | Cálculo de diff |

## Repositórios
`change_request_repository.py`, `mission_repository.py`, `mission_deliverable_job_repository.py`, `mission_execution_handoff_repository.py`

## Schemas
`change_request.py`, `mission.py`, `mission_deliverable_job.py`, `agent_foundation.py`

## Testes (apps/api/tests)
`test_agent_foundation.py`, `test_agent_registry.py`, `test_change_requests.py`, `test_mission_deliverable_jobs.py`, `test_mission_execution_handoff.py`, `test_missions_field_actions.py`, `test_missions_registry.py`, `test_orchestrator_preferred_language.py`, `test_rbac_permission_matrix.py`

## Contexto (commits recentes relevantes)
- `c4888a7` feat(api): Agent Registry — Phase 0 do LDCN Multi-Agent Runtime
- `362683a` → `88b5d55`: unificação de notificações do GenerationJob no Event Bus (Phases 1-5), incluindo polimorfismo de "subject" da notificação
- `f244af3` feat(web,api): comunicação real de status de GenerationJob + sistema de notificação
- `67331be` fix(api): corrige race condition de apply concorrente em Change Request
- `f4ca429` / `f59214f` / `8cf206e`: painel de execução em tempo real do Mission Workspace, job assíncrono via SSE, geração de artefato com revisão obrigatória do usuário
