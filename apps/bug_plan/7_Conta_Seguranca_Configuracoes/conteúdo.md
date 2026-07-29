# Área 7 — Conta / Segurança / Configurações

Autenticação, sessões, 2FA, vault de chaves LLM do usuário (BYOK), preferências, RBAC/tenants. É a aba `/settings` (6 sub-abas: Conta, IA, Git, Interface, Runtime, Avançado) — área mais "assentada" do produto (recebeu vários ciclos de polimento pixel-fiel).

## Frontend
- `apps/web/app/(app)/settings/page.tsx`
- `apps/web/components/settings/` (20 arquivos — inclui `ai-providers-tab.tsx`)

## Backend — rotas
| Arquivo | Linhas |
|---|---|
| `routes/auth.py` | 348 |
| `routes/user_ai_keys.py` | 164 |
| `routes/tenants.py` | 108 |
| `routes/llm_settings.py` | 73 |
| `routes/user_preferences.py` | 72 |
| `routes/permissions.py` | 59 |
| `routes/language_model.py` | 33 |

## Backend — services
| Arquivo | Linhas | O que faz |
|---|---|---|
| `services/auth_service.py` | 596 | Login, sessões, refresh token, 2FA — maior arquivo da área |
| `services/llm_settings_service.py` | 244 | Configurações de LLM por usuário |
| `services/ai_key_vault_service.py` | 117 | Vault efêmero e criptografado de chaves de IA (BYOK) |
| `services/user_preferences_service.py` | 59 | Preferências de usuário |
| `services/llm_provider_registry.py` | 47 | Registro de providers de LLM |
| `services/ai_availability.py` | 43 | Detecta se há IA real disponível (server key ou user key) → `/api/ai-status` |

## Models / Repositórios
`models/user.py`, `models/user_preferences.py`, `models/tenant.py`, `models/workspace_permission_override.py`, `models/llm_decision_trace.py`, `models/llm_usage.py`
`repositories/user_repository.py`, `repositories/user_ai_key_repository.py`, `repositories/user_preferences_repository.py`, `repositories/tenant_repository.py`, `repositories/workspace_permission_repository.py`, `repositories/llm_active_selection_repository.py`, `repositories/llm_decision_trace_repository.py`, `repositories/llm_usage_repository.py`

## Schemas
`auth.py`, `permissions.py`, `tenant.py`, `user_ai_key.py`, `user_preferences.py`, `llm.py`, `llm_settings.py`

## Testes (apps/api/tests)
`test_auth_security_lgpd.py`, `test_auth_sessions_2fa.py`, `test_llm_provider_errors.py`, `test_oauth_login.py`, `test_tenants.py`, `test_user_ai_keys.py`, `test_rbac_permission_matrix.py`

## Nota
`SameSite=Lax` no cookie de refresh token é escopado para `localhost` — acessar o frontend via `127.0.0.1` quebra a autenticação silenciosamente em dev.
