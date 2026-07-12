# Auto-Repair Engine — Foundation

**Engine:** `apps/api/app/engines/auto_repair_engine.py` (`AutoRepairEngine`)
**Status:** backend implemented + green. UI card is the next pass.

## What it does
Deterministic, safe auto-repair for the Meta-Factory: reads a `QualityGateReport`, fixes the
auto-fixable issues, and reports a diff — **no LLM, no shell**. Every write/delete goes through
`ProjectWriter` (path-allowlisted, stays inside the project root).

## Fixers (deterministic)
| Issue | Action |
|---|---|
| `readme_missing` | create `README.md` (setup/run/structure) |
| `readme_no_run` | append a run section to `README.md` |
| `env_example_missing` | create `.env.example` (safe placeholders) |
| `requirements_missing` | create `requirements.txt` (Python) |
| `tsconfig_missing` | create `tsconfig.json` (TS) |
| `pom_missing` | create a minimal `pom.xml` (Java) |
| `package_scripts_missing` | merge `dev/build/start` into `package.json` |
| `health_endpoint_missing` | create a FastAPI `/health` route file |
| `src_missing` | create `src/.gitkeep` |
| `real_env_file:<path>` | **delete** the real `.env`/secret file (`ProjectWriter.delete`) |

## Honestly NOT auto-fixed (left to the heavy build / user)
Build failures, hardcoded secrets inside code, path traversal/symlink escapes, missing entry
files, empty placeholders, "route imported but not created", and import/path errors are marked
`auto_fixable=false` with a clear `suggested_fix`. The factory never silently "fixes" a BLOCKER
it cannot fix safely.

## Output
`RepairResult { actions[], applied_count, failed_count, skipped_count, diff_summary }`. The
diff summary lists **paths only** — never file contents or secrets.

## Tests
`tests/test_quality_gate_auto_repair.py`: creates README/.env.example, removes a real `.env`,
refuses path traversal, and the repair endpoint applies + audits. 10/10 green.
