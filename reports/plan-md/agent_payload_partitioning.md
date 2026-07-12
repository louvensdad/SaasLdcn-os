# Agent Payload Partitioning & 413 Auto-Retry

**Files:** `app/engines/factory_pipeline.py`, `app/engines/context_pack_builder.py` · **Date:** 2026-06-28

## Measure before sending
Every agent call measures its payload (`payload_chars`, `estimated_tokens`) and records it in the per-attempt log. Before the **first** send, `_run_agent` runs `compress_to_budget(context, budget_for(role))` — the **budget guard** — so the request can never start oversized. The guard logs a `budget_guard` entry when it acts.

## 413 detection (provider-agnostic)
`is_payload_too_large(exc)` returns True for HTTP 413 or messages like `maximum context length`, `prompt is too long`, `context_length_exceeded`, `input is too long`, `reduce the length` — covering OpenAI/Anthropic/Gemini/etc. without importing any SDK.

## Partitioned retry (automatic — Phase 9)
On a payload-too-large error, `_run_agent`:
1. detects 413,
2. compresses the context harder (`~55%` of current size, then progressive),
3. re-routes the call,
4. marks the run `partitioned=True` and logs the step,
5. continues — up to the attempt budget.

The user does nothing. If files come back after a partitioned retry, a warning notes "(modo particionado por payload)".

## Diagnostics (Phase 8 data)
The `agent_finished` event carries `partitioned`, `context_pack` (role/chars/tokens/budget/sections/compression), and the full `attempts[]` log (each with `payload_chars`, `estimated_tokens`, `reason`, `partitioned`). Server logs one structured line per agent (`role, files, payload_chars, est_tokens, pack_chars, attempts, partitioned, parser`).

## Tests
`test_413_triggers_partitioned_retry_and_continues` (first call raises 413 → second succeeds, `partitioned=True`, files present, pipeline continues), `test_payload_compressed_to_budget_before_send`, `test_diagnostics_record_size_and_pack`, `test_payload_too_large_classifier`.

## Honest scope
- **Automatic** partitioned retry is implemented (Phase 9). The **manual** "Reexecutar em modo particionado" button (Phase 8) is a frontend follow-up — the backend already exposes everything it needs and the retry is automatic anyway.
- Partitioning here means *progressive context compression + retry*, not splitting one agent into many sub-calls — see `backend_agent_chunking_strategy.md` for that distinction.
