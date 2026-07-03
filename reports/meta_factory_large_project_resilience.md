# Meta-Factory — Large Project Resilience

**Date:** 2026-06-28 · **Validation:** `pytest` 452 passed, 1 skipped.

## Goal
An Enterprise project (hundreds of entities/rules/endpoints) must pass the Backend stage and the whole pipeline without failing on payload size.

## What guarantees it now
| Guarantee | Mechanism | Test |
|-----------|-----------|------|
| Backend never gets the whole project | per-role Context Pack (sections + owned blueprint areas) | `test_backend_context_is_focused_not_everything` |
| Payload bounded before send | `compress_to_budget` budget guard in `_run_agent` | `test_payload_compressed_to_budget_before_send` |
| Contract never shipped whole | `summarize_contract` (endpoints + schemas) | `test_contract_is_summarized_not_full` |
| Irrelevant content excluded | blueprint area filtering per role | `test_frontend_pack_excludes_backend_only_areas` |
| 413 self-heals | automatic partitioned retry | `test_413_triggers_partitioned_retry_and_continues` |
| Pipeline continues after retry | retry loop returns files, run proceeds | same test (`agent_finished.partitioned` + files) |
| Traceability preserved | owned blueprint decisions + contract reference kept | `test_traceability_preserved` |
| Size measured & logged | `payload_chars`/`estimated_tokens` per attempt + server log | `test_diagnostics_record_size_and_pack` |

## End-to-end
For a synthetic project with 400 entities + 400 long business rules + a blueprint, the Backend pack compresses to within its 52k-char budget (`over_budget=True, compressed=True, steps=[dedupe, cap_lists:…]`) while keeping the backbone, the backend/database/auth/apis decisions, and the contract summary. The full pipeline (`test_pipeline_runs_all_agents_and_threads_contract`) runs all six agents with the summarized contract threaded through.

## Honest limits
- The budget numbers are character-based with a `len/4` token estimate, not exact provider tokenizer counts — deliberately conservative.
- True multi-call intra-stage chunking (split Backend into structure→entities→DTOs→controllers→… as separate generations) is **not** implemented; the platform already exposes per-stage generation and each stage's payload is now bounded. See `backend_agent_chunking_strategy.md`.
- A reference-resolution protocol where agents fetch `promptMasterRef`/`blueprintRef` by id is partially realized: the contract is now a summary/reference rather than raw content; full ref-fetch is a follow-up.
