# Auto-Refactor — Safety Validation

## Approach: materialize + reuse
`POST /modernize/{id}/apply-fixes` materializes the ingested sandbox as a `ProjectWriter`
project (under `generated-projects`), then runs the **same** `quality_gate_engine` +
`auto_repair_engine` used by the Meta-Factory. No bespoke, unsafe write path.

## Guarantees (inherited + enforced)
- **Approval required** before any change (409 otherwise); only approved-phase auto-fixable
  issues are applied.
- **No shell, no LLM** in the repair; every write/delete goes through `ProjectWriter`
  (path-allowlisted, refuses `..`/absolute/marker, stays in the project root).
- **Ingest sandbox** already guards zip-slip, size/file limits, extension allowlist, and now
  **ignores `node_modules`/`dist`/`build`/`target`/`.git`** (counted as skipped, never read).
- **Safe fix set only** (initial): README, .env.example, .gitignore, requirements.txt,
  tsconfig.json, minimal pom.xml, package.json scripts, health endpoint, remove real
  .env/secret files. Advanced fixes (CORS/logs/imports, layering, tests) are
  `requires_extra_confirmation` / not auto — never applied silently.
- **No secrets written**; secret-bearing files are removed, not rewritten with values.
- **Diff-logged**: `RefactorResult.diff_summary` lists changed paths only (no contents/secrets).
- **Owner isolation** on every job access (foreign → 404).
- Every step audited (`auto_refactor_started` / `auto_refactor_completed`).

## Tests
`test_full_pipeline_revalidation_and_diff` (apply applies ≥1 fix), `test_apply_fixes_requires_approval`,
`test_ignores_node_modules_and_build`, `test_zip_path_traversal_blocked`, `test_workspace_isolation`.
