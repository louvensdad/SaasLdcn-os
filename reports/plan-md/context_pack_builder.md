# Context Pack Builder

**File:** `app/engines/context_pack_builder.py` · **Date:** 2026-06-28

Pure text shaping (no LLM calls) that gives each agent a small, clean, deduplicated, focused context.

## Per-role packs
`build_agent_context(role, mega_prompt, *, contract_summary, emitted_files, budget_chars) -> (context, diagnostics)`:
1. **Section selection** — keeps only the Mega-Prompt `## sections` the role needs (`ROLE_SECTIONS`). Backbone (Intent/Summary/Stack/Localization/Business rules) is always kept.
2. **Blueprint area filtering** — keeps only the decision lines for the areas the role owns (`ROLE_BLUEPRINT_AREAS`): e.g. Frontend never receives the `database`/`deploy` decisions; Backend never receives the `frontend` decision.
3. **Contract summary** — attaches the compact contract map (for Backend/Frontend/QA/DevOps/Docs), never the raw bodies.
4. **Emitted files** — only QA/DevOps/Docs get the file list, capped at 60 with a `+N` note.
5. **Budget** — if the assembled context exceeds the role budget, it is compressed (see below) and the steps are recorded.

Builders requested by the task map to roles: `buildBackendContextPack` → `build_agent_context("backend", …)`, and likewise contracts/frontend/qa/devops/docs/security.

## Role budgets (chars)
contracts 60k · backend 52k · frontend 48k · qa 44k · devops 32k · docs 40k · security 36k · repair 52k. `estimate_tokens(text) ≈ len/4`.

## Contract summarization
`summarize_contract(raw)` parses the `<<<FILE>>>` blocks and, per file, extracts endpoint paths, operation count, and schema/DTO names (capped, with `+N`). No markers → bounded truncation. This is the single biggest payload reduction.

## Dedupe + compression (`compress_to_budget`)
Progressive, lossless-first: `dedupe` (drop duplicate bullets/headings, collapse blank runs) → `cap_lists:24/12/6` (cap long bullet runs with `+N itens omitidos … IDs/rastreabilidade preservados`) → `hard_truncate` only as a last resort. IDs and traceability lines are preserved ahead of any omission note.

## Diagnostics
`ContextPackDiagnostics`: role, chars, estimated_tokens, budget_chars, sections_kept, blueprint_areas, contract_summarized, compressed, compression_steps, over_budget.

## Tests
`tests/test_meta_factory_413.py`: focused backend pack, frontend excludes backend-only areas, dedupe, contract summarized < ⅕, traceability preserved, token estimate.
