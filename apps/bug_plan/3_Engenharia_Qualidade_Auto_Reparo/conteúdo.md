# Área 3 — Engenharia, Qualidade e Auto-reparo

A camada "isso que foi gerado realmente funciona?" — validação, gates de qualidade, repair loop, testes de runtime. É a área com mais arquivos do backend.

## Frontend
- `apps/web/app/(app)/engineering-review/page.tsx`
- `apps/web/app/(app)/engineering-laboratory/page.tsx`
- `apps/web/app/(app)/auto-fix/page.tsx`

## Backend — rotas
| Arquivo | Linhas |
|---|---|
| `routes/engineering_lab.py` | 51 |
| `routes/deep_engineering.py` | 43 |
| `routes/engineering_readiness.py` | 40 |
| `routes/test_runner.py` | 17 |
| `routes/generated_project_quality.py` | 17 |
| `routes/gatekeeper.py` | 16 |

## Backend — engines (maiores primeiro)
| Arquivo | Linhas |
|---|---|
| `engines/functional_completeness_engine.py` | 852 |
| `engines/gatekeeper_engine.py` | 664 |
| `engines/generated_project_quality_engine.py` | 592 |
| `engines/deep_engineering_engine.py` | 511 |
| `engines/engineering_readiness_engine.py` | 448 |
| `engines/context_pack_builder.py` | 446 |
| `engines/engineering_lab_engine.py` | 427 |
| `engines/engineering_review_engine.py` | 392 |
| `engines/functional_coverage_engine.py` | 360 |
| `engines/quality_gate_engine.py` | 351 |
| `engines/auto_repair_engine.py` | 340 |
| `engines/verification_engine.py` | 228 |
| `engines/repair_engineer.py` | 202 |
| `engines/pipeline_recovery_orchestrator.py` | 176 |
| `engines/llm_repair_engine.py` | 165 |
| `engines/ground_truth_engine.py` | 164 |
| `engines/frontend_artifact_gate.py` | 164 |
| `engines/frontend_artifact_contract_planner.py` | 162 |
| `engines/frontend_authenticity_gate.py` | 156 |
| `engines/cause_validator.py` | 155 |
| `engines/project_memory_engine.py` | 147 |
| `engines/warning_policy.py` | 141 |
| `engines/engineering_kernel_engine.py` | 141 |
| `engines/root_cause_investigator.py` | 140 |
| `engines/work_estimation_engine.py` | 138 |
| `engines/product_certification_engine.py` | 125 |
| `engines/completeness_review_engine.py` | 123 |
| `engines/execution_plan_engine.py` | 115 |
| `engines/global_state_mapping.py` | 108 |
| `engines/evolution_engine.py` | 89 |
| `engines/performance_review_engine.py` | 77 |

## Backend — services
| Arquivo | Linhas | O que faz |
|---|---|---|
| `services/build_validation_service.py` | 1168 | Valida build do projeto gerado — maior service da área |
| `services/dependency_research_service.py` | 625 | CVE/vulnerabilidades via OSV.dev (8 ecossistemas) |
| `services/runtime_functional_test_service.py` | 512 | Testes funcionais reais via browser (backend+frontend rodando) |
| `services/dependency_registry.py` | 381 | Registro de dependências permitidas/bloqueadas |
| `services/test_runner_service.py` | 290 | Executa pytest/npm test de verdade |
| `services/build_error_classifier.py` | 268 | Classifica erros de build |
| `services/tailwind_theme_guard.py` | 192 | Garante consistência do tema Tailwind gerado |
| `services/runtime_api_audit_service.py` | 186 | Auditoria de API em runtime (real para Python/FastAPI) |
| `services/execution_reality_guard.py` | 164 | Impede resultado "fake"/mockado passar como real |
| `services/preview_inspector.py` | 124 | Inspeciona preview do projeto gerado |
| `services/build_metrics_collector.py` | 43 | Coleta métricas de build |

## Schemas
`completeness.py`, `functional_completeness.py`, `functional_coverage.py`, `auto_repair.py`, `authenticity.py`, `engineering_kernel.py`, `engineering_lab.py`, `engineering_readiness.py`, `deep_engineering.py`, `gatekeeper.py`, `generated_project_quality.py`, `quality_gate.py`, `performance_review.py`, `product_certification.py`, `runtime_api_audit.py`, `runtime_functional_test.py`, `test_runner.py`, `work_estimate.py`, `execution_plan.py`, `frontend_artifact_contract.py`, `pipeline_recovery.py`

## Testes (apps/api/tests)
`test_deep_engineering.py`, `test_dependency_research.py`, `test_engineering_kernel_engine.py`, `test_engineering_lab.py`, `test_engineering_readiness.py`, `test_execution_plan_engine.py`, `test_frontend_artifact_contract.py`, `test_frontend_artifact_gate.py`, `test_frontend_authenticity_gate.py`, `test_functional_completeness_engine.py`, `test_functional_coverage_engine.py`, `test_gatekeeper.py`, `test_generated_project_quality.py`, `test_ground_truth_guard.py`, `test_pipeline_recovery.py`, `test_preview_inspector.py`, `test_product_certification_authenticity.py`, `test_product_certification_engine.py`, `test_quality_gate_authenticity_wiring.py`, `test_quality_gate_auto_repair.py`, `test_runtime_api_audit_service.py`, `test_runtime_functional_test_responsive_a11y.py`, `test_runtime_functional_test_service.py`, `test_tailwind_theme_guard.py`, `test_test_runner.py`, `test_verification_engine.py`, `test_work_estimation_engine.py`

## Pontos de atenção conhecidos (de auditorias internas, `reports/plan-md/`)
- Estado da "Engineering Kernel" está fragmentado em 3 enums diferentes (`ProjectRoomStatus`, `StackApproval.status`, `CompletenessStatus`/`GenerationJobStatus`) em vez de um único kernel de 9 estados — parcialmente unificado, não totalmente.
- `FrontendResourceCoverage` não tinha campo de "delete" (parece ter sido fechado em commit recente — `4dc6255`/`baf46b4` — vale conferir se cobre Mobile também).
- Documentation Auditor cobre só 3 sinais hardcoded (docker, postgres, JWT) — não valida prosa do README contra endpoints reais.
