# Modernize Codebase — LLM Provider Flow

**Status:** backend implemented + green. Premium stepped UI is the next pass.

## Choose your AI
`GET /modernize/llm/providers` returns provider cards (mirrors the spec):
| Card | vault id | recommended for |
|---|---|---|
| GPT / OpenAI | `openai` | Arquitetura e documentação |
| Claude / Anthropic | `anthropic` | Refatoração de codebase |
| Gemini / Google | `google` | Análise ampla |
| DeepSeek | `openrouter` | Análise de código (via OpenRouter) |
| OpenRouter | `openrouter` | Flexibilidade de modelos |
| Ollama Local | `ollama` | Offline / local (keyless) |

Each card carries `status` = `ready` (key in session, or keyless) | `not_configured`.

## Paste key + test connection
- Key is stored in the ephemeral vault via `POST /user-ai-keys/session {provider, api_key}`
  (encrypted in RAM, masked, **TTL = `user_key_ttl_seconds`, default 3600s**).
- `POST /modernize/llm/test {provider}` does a tiny real round-trip with the session key:
  - success → `{ ok: true, model, message: "Conexão validada. LLM pronto." }` (LLM_READY).
  - failure → `{ ok: false, message }` — **the key is never in the message**.
  - Ollama → `{ ok: true, degraded: true }` (keyless local; not probed).
- Audited: `llm_provider_selected`, `llm_connection_tested`.

## Feature flags (`GET /modernize/config`)
`modernize_enabled, modernize_git_import, modernize_zip_upload, modernize_auto_refactor,
modernize_user_llm_key, modernize_export` — a disabled action returns 403.

## Tests
`test_select_provider_marks_ready` (GPT/DeepSeek/Gemini/Claude), `test_llm_test_invalid_key_fails`.
