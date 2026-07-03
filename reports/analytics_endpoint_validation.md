# Analytics — Endpoint Validation

**Date:** 2026-06-28

## Commands run
| Command | Result |
|---------|--------|
| `pytest tests/test_analytics.py` | **15 passed** |
| `pytest` (full backend suite) | **402 passed, 1 skipped, 1 deselected** |
| `npx tsc --noEmit` (web) | **clean (0 errors)** |
| `npx next build` (web) | **clean — 26/26 routes, `/analytics` compiled** |

## Acceptance scenarios → tests
| # | Scenario | Test |
|---|----------|------|
| 1 | `/api/analytics/overview` returns 200 | `test_overview_returns_200` |
| 2 | Returns expected structure | `test_overview_has_expected_structure` |
| 3 | Includes real Project Room metrics | `test_includes_real_project_room_metrics` |
| 4 | Redacts secrets | `test_redacts_secrets_in_records` |
| 5 | Empty section for module without real source | `test_empty_section_has_reason` (laboratory) |
| 6 | A failing collector doesn't break the endpoint | `test_failing_collector_is_isolated` |
| 7 | Filters are accepted | `test_filters_are_accepted` (4 variants) + `test_module_filter_narrows_sections` |
| 8 | Technology Trends uses real data | `test_technology_trends_real_or_empty` |
| 9 | Never returns API keys | `test_never_returns_api_keys` |
| 10 | Frontend-compatible response | `test_response_is_frontend_compatible` |

Extra: `test_service_unit_isolation_returns_overview` (service-level construction with empty repos).

## Manual contract check
The response field names (`generated_at`, `metrics[].{id,label,value,severity,...}`, `sections[].{id,title,metrics,series,records,columns}`, `filters.{statuses,languages,frameworks,agents,...}`) match `apps/web/lib/api/analytics.ts` exactly. The `/analytics` page builds without changes and the route is rendered (`9.75 kB`).

## Approval criteria status
- ✅ `GET /api/analytics/overview` exists · ✅ router registered · ✅ frontend consumes real data
- ✅ no fake metrics · ✅ empty sections explicit · ✅ secrets redacted
- ✅ endpoint survives a collector failure · ✅ tests pass · ✅ reports honest
