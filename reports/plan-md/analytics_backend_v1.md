# Analytics Backend V1

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28
**Status:** `GET /api/analytics/overview` implemented, registered, and tested with **real data only**.

## What was built
| File | Role |
|------|------|
| `apps/api/app/schemas/analytics.py` | Response contracts mirroring the frontend types in `apps/web/lib/api/analytics.ts`. |
| `apps/api/app/services/analytics_service.py` | `AnalyticsService` + 8 fault-isolated collectors. |
| `apps/api/app/routes/analytics.py` | `GET /api/analytics/overview` with all 11 filters. |
| `apps/api/app/main.py` | Router registered (protected). |
| `apps/api/tests/test_analytics.py` | 15 tests (the 10 acceptance scenarios + extras). |

## Endpoint
`GET /api/analytics/overview` — protected (auth required), owner-scoped to the caller's `user_id`.

Accepts: `period, workspace, project_type, provider, stack, status, module, severity, agent, language, framework`. Unsupported filters are ignored safely (see `analytics_missing_data_sources.md`).

Returns (frontend-compatible):
```jsonc
{
  "generated_at": "...",
  "period_start": null,
  "period_end": null,
  "metrics": [ { "id", "label", "value", "severity", "source", "drilldown_count" } ],
  "sections": [ { "id", "title", "status", "reason", "metrics", "series", "records", "columns" } ],
  "filters": { "statuses": [], "languages": [], "frameworks": [], "agents": [], ... }
}
```

## Collectors (all real, all isolated)
1. **project_rooms** — totals, by-status, PromptMasters generated/approved, Blueprints, Engineering Reviews approved, sent-to-Meta-Fábrica. Drill-down records per room.
2. **llm** — active provider **label** (never key), actions, deterministic/fallback, provider failures, confirmations — from the LGPD audit log.
3. **meta_factory** — runs/completed/failed derived from room handoff + lifecycle status; per-run records.
4. **modernize** — uploads/imports/analyses/plans/auto-fixes/exports from audit events; empty when none.
5. **documentation** — generated-project candidates (no persistent doc store → mostly empty).
6. **quality** — quality-gate / auto-repair / revalidation / blocked-export from audit events.
7. **technology_trends** — languages/frameworks/project-types from real generated projects' technology graph.
8. **laboratory** — `empty` / `no_data_source` (no persistent backend).

## Guarantees met
- ✅ `GET /api/analytics/overview` exists and is registered.
- ✅ Frontend `/analytics` consumes it unchanged (field names match).
- ✅ No fake metrics, billing, heatmap, geography, or revenue.
- ✅ Sections without data are explicitly `empty` with `reason="no_data_source"` (never a 500).
- ✅ A failing collector yields a `status="error"` section; the endpoint still returns 200.
- ✅ Secrets redacted; LLM keys never returned.

## Validation
`pytest tests/test_analytics.py` → **15 passed**. Full-suite + frontend results in `analytics_endpoint_validation.md`.
