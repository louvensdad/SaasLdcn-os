# Área 6 — Analytics / Observabilidade / Presença

Telemetria, custos de infraestrutura, presença de engenharia em tempo real e o dashboard geral.

## Frontend
- `apps/web/app/(app)/analytics/page.tsx`
- `apps/web/app/(app)/system-status/page.tsx`
- `apps/web/app/(app)/dashboard/page.tsx`
- `apps/web/components/analytics/` (2 arquivos)

## Backend — rotas
| Arquivo | Linhas |
|---|---|
| `routes/analytics.py` | 48 |
| `routes/observability.py` | 42 |
| `routes/system_presence.py` | 32 |
| `routes/infra_cost.py` | 25 |
| `routes/system_status.py` | 14 |

## Backend — engines
| Arquivo | Linhas | O que faz |
|---|---|---|
| `engines/system_design_visualization_engine.py` | 294 | Visualização do design do sistema |
| `engines/runtime_profile_engine.py` | 291 | Perfil de runtime do projeto |
| `engines/infra_cost_estimation_engine.py` | 152 | Estimativa de custo de infraestrutura |
| `engines/global_state_mapping.py` | 108 | Máquina de estados global (nota: o próprio código documenta que esse modelo abstrato de 12 estados foi considerado problemático) |
| `engines/runtime_metrics_engine.py` | 107 | Métricas de runtime |
| `engines/engineering_presence_engine.py` | 99 | Presença de engenharia em tempo real |
| `engines/system_status_engine.py` | 67 | Status geral do sistema |

## Backend — services
| Arquivo | Linhas | O que faz |
|---|---|---|
| `services/analytics_service.py` | 614 | Serviço central de analytics — maior arquivo da área |
| `services/platform_runtime_config_service.py` | 55 | Configuração de runtime da plataforma |
| `services/presence_event_service.py` | 27 | Eventos de presença |

## Schemas
`analytics.py`, `observability.py`, `system_status.py`, `system_presence.py`, `infra_cost.py`, `system_design_visualization.py`, `runtime.py`

## Testes (apps/api/tests)
`test_analytics.py`, `test_analytics_dirty_data_stress.py`, `test_engineering_presence.py`, `test_engineering_presence_phase2.py`, `test_infra_cost_estimation.py`, `test_llm_decision_observability.py`, `test_observability.py`, `test_runtime_metrics.py`, `test_system_design_visualization.py`

## Ponto de atenção
Existe um teste chamado `test_analytics_dirty_data_stress.py` — sugere que já houve (ou ainda há) problemas de dados "sujos" corrompendo métricas de analytics. Bom ponto de partida para procurar edge cases não cobertos.
