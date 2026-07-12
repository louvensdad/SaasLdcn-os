# Analytics — Missing / Deferred Data Sources

**Date:** 2026-06-28

Honest inventory of what V1 does **not** yet measure, and why. Nothing here is faked; these are returned as `empty` / `no_data_source` or accepted-but-ignored.

## Sections returned empty (no persistent source)
| Section | Reason | What it would need |
|---------|--------|--------------------|
| laboratory | `no_data_source` | The Engineering Laboratory has no persistent store of test runs, scans, terminal sessions, or auto-fixes. Needs a results table written by lab executions. |
| documentation | mostly `no_data_source` | Documentation Score/checks/missing/unsafe are computed on demand by the doc engine; there is no persisted per-project documentation record. V1 reports only generated-project candidates. Needs a documentation results store (or an opt-in on-demand recompute). |
| modernize | `no_data_source` when no audit events | Real once the user runs ingest/analyze/plan/refactor (those emit audit events). Deeper per-file metrics (files found/ignored/analyzable, complexity bands) live in ephemeral ingest dirs, not a queryable store. |
| quality | `no_data_source` when no audit events | Real once quality-gate/auto-repair events are recorded. Build/test pass-fail granularity needs a persisted validation-report store. |

## Filters accepted but not yet applied
| Filter | Status | Why |
|--------|--------|-----|
| `period` | **applied** | Cutoff on `created_at` for rooms/projects/audit. |
| `status` | **applied** | Filters Project Rooms. |
| `module` | **applied** | Narrows the response to one section. |
| `language`, `framework`, `project_type` | **applied** | Filter Technology Trends. |
| `provider` | ignored (safe) | The audit log records event codes, not the provider per event, so a per-provider breakdown isn't derivable yet. Needs provider metadata on LLM audit events. |
| `stack` | ignored (safe) | No distinct stack dimension separate from framework in current project metadata. |
| `severity` | ignored (safe) | Severity is a metric property, not a stored data dimension to filter rows by. |
| `agent` | ignored (safe) | Per-agent run records aren't persisted (the pipeline runs in-process); only the agent *list* is known. |
| `workspace` | ignored (safe) | There is no workspace/tenant model yet; rooms carry a nullable `workspace_id` that is currently unset. |

Ignored filters never error — they are simply not used, per the task's "ignore with safety and record in the report" rule.

## Explicitly out of scope for V1 (no real source — intentionally absent)
- **Billing / revenue** — no billing system exists; not invented.
- **Geography / heatmap** — no geo data collected; not invented.
- **Customer usage / multi-tenant** — no tenant model; analytics is single-owner.

## Recommended next steps (to light up the empty sections)
1. Persist Meta-Fábrica run records with real timings (started/completed per agent).
2. Add a documentation-results table (score, missing, unsafe, exported) written when the doc engine runs.
3. Add a laboratory-results table for test/scan/terminal executions.
4. Attach `provider` + `capability` metadata to LLM audit events to enable per-provider analytics and the `provider` filter.
5. Introduce a workspace model to enable the `workspace` filter and tenant scoping.
