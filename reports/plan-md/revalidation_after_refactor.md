# Revalidation After Refactor — Before vs After

## Flow
`POST /modernize/{id}/revalidate` re-analyzes the **materialized + repaired** project
(`modernize_analysis_engine.score_root`, via `CodebaseIngestService.register_root`) and returns
a `RevalidationReport`:
- `before` — the scores captured at analysis time (the original codebase).
- `after` — the scores of the project after the approved auto-refactor.
- `deltas` — per-dimension `after - before` (e.g., `Segurança 42 → 78`, `DevOps 30 → 75`).

`GET /modernize/{id}/diff` returns a `CodeDiffSummary` (changed paths from the repair + score
deltas) so the UI can render Antes vs Depois.

## Honesty
Auto-refactor only fixes the safe class (docs/env/gitignore/health/scripts/secret-file removal),
so deltas reflect real, applied changes. Dimensions it can't safely improve (deep security in
code, architecture, tests) stay flat and remain in the report for human follow-up. Revalidation
never regresses quality (verified by test).

## Endpoints + audit
`POST .../revalidate` (`revalidation_started` / `revalidation_completed`), `GET .../diff`.

## Tests
`test_full_pipeline_revalidation_and_diff`: `after.overall >= before.overall`; diff
`changed_paths` ≥ 1 after apply-fixes.
