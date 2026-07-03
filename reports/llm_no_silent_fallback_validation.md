# LLM No-Silent-Fallback Validation

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28
**Backend tests:** `apps/api/tests/test_global_llm_orchestration.py` — **29 passed**.

## Rule
No module may use the deterministic path (or `MockAdapter`) silently when a valid global provider exists. Every deterministic resolution must (1) explain why, (2) emit an audit event, (3) be visibly marked as degraded.

## Where the guarantee lives (server)
`app/services/llm_settings_service.py → LlmSettingsService.resolve()`:

| Situation | Result | Audit event | Reason text |
|-----------|--------|-------------|-------------|
| Valid provider, no explicit deterministic request | `mode=llm`, `fallbackUsed=False` | `LLM_PROVIDER_CONFIRMED` | — |
| User explicitly chose deterministic | `mode=deterministic`, `fallbackUsed=True` | `LLM_FALLBACK_DETERMINISTIC_USED` | "Modo determinístico escolhido explicitamente…" |
| No provider configured | `mode=deterministic` | (state explained) | "Nenhum LLM configurado; confirmação de fallback…" |
| Key missing/expired/invalid | `mode=deterministic`, `keyStatus=expired` | `LLM_PROVIDER_FAILED` | "A chave de {provider} está ausente ou expirada." |

A valid provider therefore **cannot** resolve to deterministic unless the user explicitly asked — this is asserted by tests.

## Where it shows (UI)
- `LlmConfirmationGate` always renders the amber **deterministic fallback warning** ("preview degradado, sem IA real").
- `DeterministicBadge` ("Preview determinístico") marks degraded output (wired into `DeepAnalysisPanel` when the user picks deterministic; Project Room already shows `room.degraded`).
- The `failed` state surfaces the reason + recovery actions (Testar novamente / Atualizar chave / Escolher outro LLM).

## Tests mapping (acceptance items #8, #10, #12)
- **#8 valid provider blocks silent fallback** — `test_valid_provider_never_falls_back_silently`, `test_every_capability_resolves_the_same_active_provider` (14 capabilities, all `mode=llm`, `fallbackUsed=False`), `test_switching_default_updates_global_resolution`.
- **#10 provider error shows recovery** — `test_expired_key_is_explicit_and_never_silently_ready` (mode=deterministic, keyStatus=expired, explicit reason).
- **#12 audit logs fallback** — `test_deterministic_choice_is_audited` (asserts `LLM_FALLBACK_DETERMINISTIC_USED` in the user's audit export).

## Honest caveat
The guarantee is enforced and tested at the **resolver** level: any capability that calls `resolve()` is covered. Frontend actions still listed as "Pending" in `llm_visual_gate_coverage.md` route through this same resolver (so they are never silently deterministic), but do not yet render the confirmation gate before running. Closing those is UI-only work; the no-silent-fallback invariant already holds for them server-side.
