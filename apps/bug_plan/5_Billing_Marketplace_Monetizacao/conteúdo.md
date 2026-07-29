# Área 5 — Billing / Marketplace / Monetização

Área **muito recente** — "BYOK commercial model v1.0, marketplace premium redesign, billing rebuild" chegou nos últimos 49 commits puxados do remoto. Boa aposta para bugs "de estreia" recém-nascidos.

## Frontend
- `apps/web/app/pricing/page.tsx` + `layout.tsx` ("Planos e Assinatura")
- `apps/web/app/(app)/marketplace/page.tsx`
- `apps/web/components/billing/` (6 arquivos)
- `apps/web/components/marketplace/` (9 arquivos)

## Backend — rotas
| Arquivo | Linhas |
|---|---|
| `routes/marketplace.py` | 92 |
| `routes/billing_catalog.py` | 57 |
| `routes/student_eligibility.py` | 56 |
| `routes/billing.py` | 41 |

## Backend — services
| Arquivo | Linhas | O que faz |
|---|---|---|
| `services/marketplace_service.py` | 235 | Regras de negócio do marketplace |
| `services/plan_access_engine.py` | 139 | Verifica acesso por plano (nega com erro comercial padronizado: code/message/details/correlation_id) |
| `services/student_document_storage.py` | 101 | Armazenamento de documento para elegibilidade estudantil |
| `services/billing_service.py` | 47 | Serviço de cobrança |
| `services/student_eligibility_service.py` | 22 | Elegibilidade de desconto estudantil |

## Models / Repositórios
| Arquivo | Linhas |
|---|---|
| `repositories/billing_repository.py` | 252 |
| `repositories/marketplace_repository.py` | 172 |
| `repositories/student_repository.py` | 139 |
| `models/billing.py` | 80 |
| `models/marketplace.py` | 71 |
| `models/student.py` | 38 |

## Schemas
`billing.py`, `billing_catalog.py`, `marketplace.py`, `student_eligibility.py`

## Testes (apps/api/tests)
`test_billing_catalog.py`, `test_billing_routes.py`, `test_marketplace.py`, `test_student_eligibility.py`, `test_template_marketplace.py`

## Contexto (commits recentes relevantes)
- `92fb469` feat(api,web): BYOK commercial model v1.0, marketplace premium redesign, billing rebuild
- `050b1e3` feat(api,web): monetization/billing (vault 56), marketplace, e i18n completeness
- `44105a1` fix(api,web): resolve billing "Failed to fetch" e reconstrói Planos e Assinatura
- Migrations novas: `billing_catalog`, `marketplace`, `student_and_subscription_history`, `user_ai_key_vault`, `metering`

## Ponto de atenção
Já existiu um bug real e corrigido nessa área ("Failed to fetch" no billing) — sinal de que a integração frontend↔backend aqui ainda está instável. Bom lugar para procurar problemas de contrato entre `apps/web/lib/api` e as rotas de billing/marketplace.
