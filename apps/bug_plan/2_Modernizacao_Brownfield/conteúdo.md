# Área 2 — Modernização Brownfield

Fluxo: upload ZIP/Git → ingestão em sandbox → diagnóstico → grafo de dependências/arquitetura → plano de migração → refactor.

## Frontend
- `apps/web/app/(app)/modernize/page.tsx`

## Backend — rotas
| Arquivo | Linhas |
|---|---|
| `routes/modernize.py` | 956 |
| `routes/dependency_graph.py` | 40 |
| `routes/architectural_graph.py` | 13 |

## Backend — engines
| Arquivo | Linhas | O que faz |
|---|---|---|
| `engines/dependency_graph_engine.py` | 971 | Grafo de dependências (nós/arestas), detecção de import quebrado |
| `engines/architectural_graph_engine.py` | 327 | Visualização/grafo de arquitetura do projeto ingerido |
| `engines/modernize_analysis_engine.py` | 247 | Diagnóstico do código ingerido |
| `engines/codebase_analysis_engine.py` | 219 | Análise estática do codebase importado |
| `engines/modernization_engine.py` | 162 | Orquestra o processo de modernização |
| `engines/modernization_plan_engine.py` | 130 | Gera o plano de migração |

## Backend — services / repositories
| Arquivo | Linhas | O que faz |
|---|---|---|
| `services/codebase_ingest_service.py` | 573 | Ingestão de ZIP/Git em sandbox (quotas, zip-bomb guard, hosts permitidos) |
| `services/import_graph_engine.py` | 210 | Análise de grafo de imports (JS/TS apenas) |
| `repositories/modernize_job_repository.py` | 76 | Persistência do job de modernização (sobrevive a restart) |

## Schemas
`modernize.py`, `dependency_graph.py`, `architectural_graph.py`

## Testes (apps/api/tests)
`test_modernize.py`, `test_modernize_ingest_enterprise.py`, `test_modernize_pipeline.py`, `test_dependency_graph_engine.py`, `test_architectural_graph.py`

## Pontos de atenção conhecidos (de auditorias internas)
- Grafo de imports é **JS/TS apenas** — Java/Python ficaram deferidos (docstring do próprio módulo admite isso).
- Detecção de pacote inexistente (404) é baseada em lista curada (`KNOWN_BAD_PACKAGES`), não proativa — só pega reativamente após `npm install` falhar.
- Sem detecção de módulo órfão (arquivo nunca referenciado).
