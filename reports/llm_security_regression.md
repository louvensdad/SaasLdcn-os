# LLM Security Regression

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28
**Backend tests:** `apps/api/tests/test_global_llm_orchestration.py` — **29 passed**.

## Invariant
The API key never crosses into anything the user, the frontend, logs, reports, generated projects, or exports can read.

## Surfaces checked

| Surface | Guarantee | Evidence |
|---------|-----------|----------|
| `GET /api/llm/settings/active` | returns provider/model/status only, never the secret | `test_configured_claude_is_the_safe_active_setting` asserts `apiKey`/`KEY` not in response text |
| `POST /api/llm/settings/confirm` | resolution payload + audit echo never contain the key | `test_confirm_response_never_leaks_the_api_key` asserts `KEY`, `api_key`, `apiKey` not in response |
| Frontend gate | reads only provider/model/status from `useActiveLlm()`; never requests or renders the key | code: `LlmConfirmationGate` has no key field; security note states the key stays server-side |
| Audit export (`/api/auth/me/export`) | logs event codes (e.g. `LLM_FALLBACK_DETERMINISTIC_USED`), not secrets | `test_deterministic_choice_is_audited` reads export, asserts event code present (no key) |

## Contract-level safety
`packages/contracts/llm-settings.contract.ts` — neither `ActiveLlmSettings` nor `LlmResolution` declares a key field. `hasKey: boolean` is the only key-related signal exposed. The frontend cannot accidentally render a secret because the type never carries one.

## Not regressed (by construction)
- **PromptMaster / generated project / ZIP / Git export** — these are produced from spec/blueprint data; the key lives only in the server-side session (`user_key_session`) used transiently by adapters at request time, and is never serialized into resolution responses or settings reads. No new code path in this change reads the raw key into any user-facing payload.
- **Error messages** — the `failed` gate state surfaces `reason` strings from the resolver ("chave ausente ou expirada", etc.), which describe status, not secret values.

## Honest scope
This report verifies the **gate/settings/confirm/audit** surfaces touched by this change and the contract types. It does not re-audit every historical export path end-to-end; it confirms that the new gate work introduces no surface that exposes the key, and that the settings/confirm endpoints are covered by passing leak tests.
