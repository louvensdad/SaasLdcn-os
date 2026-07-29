# Área 8 — Infraestrutura de Plataforma

Registries canônicos (stacks, templates, skills, infraestrutura), execução em sandbox, exportação Git, documentação e roadmap. É a "base" que as outras áreas consultam.

## Frontend
- `apps/web/app/(app)/templates/page.tsx`
- `apps/web/app/(app)/skills/page.tsx`
- `apps/web/app/(app)/roadmap/page.tsx`
- `apps/web/app/(app)/platform/page.tsx`
- `apps/web/app/(app)/architecture/page.tsx`
- `apps/web/app/(app)/documentation/page.tsx`

## Backend — rotas
| Arquivo | Linhas |
|---|---|
| `routes/registry.py` | 120 |
| `routes/documentation.py` | 100 |
| `routes/sandbox_policy_exceptions.py` | 95 |
| `routes/templates.py` | 91 |
| `routes/skills.py` | 79 |
| `routes/git_providers.py` | 79 |
| `routes/runtime.py` | 60 |
| `routes/git_export.py` | 56 |
| `routes/infrastructure.py` | 54 |
| `routes/staging.py` | 51 |
| `routes/framework_specialists.py` | 50 |
| `routes/language_domains.py` | 41 |
| `routes/localization.py` | 36 |
| `routes/stacks.py` | 20 |
| `routes/roadmap.py` | 14 |
| `routes/downloads.py` | 14 |

## Backend — engines
| Arquivo | Linhas | O que faz |
|---|---|---|
| `engines/documentation_ai_writer.py` | 503 | Autoria de documentação via IA |
| `engines/documentation_engine.py` | 484 | Motor de documentação (inclui `_scan_consistency`) |
| `engines/skill_registry_engine.py` | 326 | Registro de skills |
| `engines/roadmap_engine.py` | 256 | Motor do roadmap |
| `engines/skill_execution_engine.py` | 163 | Execução de skills |
| `engines/git_export_engine.py` | 138 | Exportação para Git |
| `engines/template_registry_engine.py` | 131 | Registro de templates |
| `engines/backend_ownership_registry.py` | 89 | Ownership de módulos do backend gerado |
| `engines/template_metadata_engine.py` | 74 | Metadados de template |

## Backend — services
| Arquivo | Linhas | O que faz |
|---|---|---|
| `services/framework_specialist_service.py` | **2162** | Maior arquivo de TODO o backend — especialistas por framework |
| `services/execution_runtime.py` | 988 | Runtime de execução em sandbox |
| `services/infrastructure_registry_service.py` | 692 | Registro de infraestrutura (Stripe, SendGrid, etc.) |
| `services/stack_compatibility.py` | 595 | Compatibilidade entre stacks/dependências |
| `services/registry_service.py` | 507 | Serviço central de registries |
| `services/language_domain_service.py` | 443 | Domínios de linguagem |
| `services/git_provider_service.py` | 437 | Integração com provedores Git |
| `services/artifact_security.py` | 398 | Segurança de artefatos (zip-slip, path traversal, secret scan) |
| `services/staging_service.py` | 315 | Deploys de staging |
| `services/execution_terminal_service.py` | 237 | Terminal de execução (streamed via SSE) |
| `services/artifact_storage.py` | 219 | Armazenamento de artefatos |
| `services/localization_service.py` | 94 | i18n |
| `services/template_render_service.py` | 80 | Renderização de template |
| `services/download_service.py` | 60 | Download seguro/escopado |
| `services/catalog_service.py` | 48 | Catálogo geral |

## Schemas
`registry.py`, `stack.py`, `template.py`, `skill.py`, `infrastructure.py`, `language_domain.py`, `framework_specialist.py`, `git_export.py`, `git_provider.py`, `download.py`, `roadmap.py`, `staging.py`, `runtime.py`, `sandbox_policy.py`, `localization.py`, `secure_extensions.py`

## Testes (apps/api/tests)
`test_backend_ownership_registry.py`, `test_documentation.py`, `test_documentation_ai_writer.py`, `test_download_registry.py`, `test_framework_specialists.py`, `test_git_providers.py`, `test_infrastructure_contracts.py`, `test_infrastructure_registry.py`, `test_language_domains.py`, `test_localization.py`, `test_project_registry.py`, `test_registry.py`, `test_sandbox_policy_exceptions.py`, `test_skill_execution_engine.py`, `test_skill_system_foundation.py`, `test_stack_compatibility.py`, `test_stack_gate_and_build_repair.py`, `test_staging_routes.py`, `test_staging_service.py`

## Ponto de atenção
`framework_specialist_service.py` (2162 linhas) é o **maior arquivo de todo o backend** — maior até que `generation_job_engine.py` da Área 1. É o primeiro candidato a "god service" do projeto inteiro.
