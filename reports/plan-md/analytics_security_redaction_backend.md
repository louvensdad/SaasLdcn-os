# Analytics — Security & Redaction (Backend)

**Date:** 2026-06-28
**Tests:** `test_redacts_secrets_in_records`, `test_never_returns_api_keys` (passing).

## Layers of protection

1. **Source data is already redacted.** Project Room specs/messages/handoffs are stored through `redact_value` (`app/repositories/redaction.py`), so secrets in user input never reach SQLite in the clear.
2. **Audit log carries no secrets.** `AuditLogRepository` stores only `user_id`, an allow-listed `event_code`, and `created_at` — never values, tokens, or keys.
3. **Active provider exposes a label only.** `llm_settings_service.active()` returns `providerLabel`/`model`/`status`; the API key stays in the persistent encrypted, owner-scoped vault and is never read by the analytics service.
4. **Service-level redaction net.** Before leaving `AnalyticsService.overview()`:
   - `redact_section()` runs `redact_value` over every drill-down record (recursive: masks `secret|token|password|api_key|private_key|credential` keys and inline `key: value` secrets).
   - `redact_metric()` runs `redact_text` over every metric label.
   - Series labels are passed through `redact_text`.
5. **Frontend redaction (defense in depth).** `redactAnalyticsPayload` in `lib/api/analytics.ts` strips `api_key|token|secret|password|credential|authorization|prompt|raw_log` keys client-side.

## Explicit guarantees
- ✅ LLM API key never appears in any field, casing, or nested record.
- ✅ No `.env`, raw logs, or full PromptMaster bodies are emitted — analytics returns counts, statuses, and short safe fields (`name`, `status`, `event`, dates), never `prompt_master_md`.
- ✅ Error reasons are sanitized: a failing collector returns a fixed `reason="collector_error"` and logs only the exception **type name** (`logger.warning("...%s", type(exc).__name__)`), never the message or a traceback that could carry data.

## What is intentionally NOT included
PromptMaster content, chat messages, spec bodies, raw audit metadata, tokens, and keys are excluded by construction — the collectors only read counts and a small allow-list of safe fields.
