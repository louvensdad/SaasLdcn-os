# Documentation Generation — Validation

Generated documents are validated by the **same** Documentation Library validator that grades
existing files, so AI-written docs and hand-written docs are judged identically.

## At generation (preview)
Each previewed document carries:
- `mode`: `llm` (real provider) or `deterministic` (honest fallback).
- `safe`: false if a secret-like value survived sanitization (it shouldn't — sanitize runs first).
- `issues`: the human-readable problems found.

## At save
`save()` re-sanitizes and re-scans every approved document, then writes it (copy-to-docs:
README at root, others under `/docs`, ADR under `docs/adr/`), refusing to overwrite an existing
file without `overwrite=true`. It returns the new Documentation Score from a fresh
`DocumentationEngine.analyze()` run over the real files.

## Round-trip guarantee
A full deterministic generation, saved into a project, then re-analyzed:
- produces all seven required documents → `missing_required == []`,
- contains no secrets → `safe == true`,
- scores `>= 80`.

This is asserted by `test_save_writes_approved_docs_and_validates`.

## Acceptance check
The documents read like a senior engineer's work-product (justified decisions, real
endpoints/entities, concrete commands), not a generic template — driven by the project's actual
Blueprint/PromptMaster facts in both the LLM prompt and the deterministic builders.

## Tests
`apps/api/tests/test_documentation_ai_writer.py` (8) + `test_documentation.py` (11).
Full backend suite: 323 passed, 1 skipped. Web: `tsc` clean · `next build` ✓
(`/documentation` 6.39 kB).
