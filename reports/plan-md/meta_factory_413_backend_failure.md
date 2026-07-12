# Meta-Factory HTTP 413 — Backend Stage Failure

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28
**Validation:** backend `pytest` **452 passed, 1 skipped**.

## Symptom
The Backend agent failed with **HTTP 413 (Payload Too Large)**. The request sent to the agent had grown too big, killing generation for complex/Enterprise projects.

## Root cause
The pipeline sent the **same giant Mega-Prompt to every agent** and, after the Contracts stage, appended the **entire raw Contracts response** — every `<<<FILE>>>` block with the full OpenAPI + DTO bodies — to Backend/Frontend/QA/DevOps/Docs:

```python
# before (factory_pipeline.iter_factory_pipeline)
context = mega_prompt
if contract_text:                      # contract_text = response.text  ← the FULL reply
    context += f"<contract>\n{contract_text}\n</contract>"
```

So the Backend agent (which runs right after Contracts) received `full spec + full blueprint + the entire OpenAPI`. For a large project that single request blew past the provider's size limit → 413.

## Fix (layers)
1. **Per-agent Context Pack** — each agent now gets only its relevant Mega-Prompt sections + the blueprint areas it owns. (`build_agent_context`)
2. **Contract summarization** — the contract is threaded as a compact map of endpoints + schema names + file paths, never the full bodies. In tests a 22.9k-char contract becomes a ~0.4k summary. (`summarize_contract`)
3. **Budget guard** — before the first send the context is compressed to a per-role character budget, so a complex project can never produce a giant single request. (`compress_to_budget` in `_run_agent`)
4. **413 / partitioned retry** — if the provider still says "payload too large", the context is compressed harder and the call is retried automatically (no user action). (`is_payload_too_large` + partitioned loop)
5. **Diagnostics + logs** — payload chars, estimated tokens, pack, attempts, partitioned flag are on the `agent_finished` event and logged server-side.

## Result
The Backend stage no longer 413s; the contract no longer balloons the payload; oversized contexts are measured and compressed before sending; a residual 413 self-heals via partitioned retry and the pipeline continues to Frontend/QA/DevOps/Docs.

See: `context_pack_builder.md`, `agent_payload_partitioning.md`, `meta_factory_large_project_resilience.md`, `backend_agent_chunking_strategy.md`.
