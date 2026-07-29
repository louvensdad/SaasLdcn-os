# Analytics — Dirty Data Stress Test

**Branch:** `feat/premium-foundation` · **Date:** 2026-07-07
**Goal:** seed a large, deliberately corrupted dataset directly at the storage layer and confirm `GET /api/analytics/overview` survives it without ever losing legitimate data.

## What was seeded

New test: `apps/api/tests/test_analytics_dirty_data_stress.py`. Not mocked — writes straight into the real SQLite tables (`project_rooms`, `audit_logs`, `projects`) bypassing API validation, the way a bad migration, a crashed write, or a hand-edited row could, then drives the real `AnalyticsService` through the real endpoint.

- **300 dirty `project_rooms`** — empty/60k-char/mojibake/emoji/control-character/`<script>`/SQLi-lookalike titles, unknown status values, unparseable `spec_json`/`generation_handoff_json`, non-ISO/garbage `created_at`, a title with an embedded `api_key=sk-…` secret.
- **300 dirty `audit_logs`** — unknown event codes, empty/garbage timestamps.
- **60 dirty `projects`** — unparseable `technology_graph_json`, non-dict language/framework shapes, huge/script-injection project names.
- Plus a targeted single-row test: one room with truncated JSON (`{not json at all`) alongside one legitimately created room, asserting the good room still appears.

## Bug found and fixed

**One corrupted JSON column silently blanked out an owner's entire `project_rooms`/`projects` list.**

`ProjectRoomRepository._loads()` and `ProjectRepository._deserialize_json()` called `json.loads()` on a stored column with no error handling. A single malformed `spec_json`/`technology_graph_json` value raised `JSONDecodeError` inside the list comprehension in `list_for_owner()`/`list_projects()`; that exception propagated up and was caught by `AnalyticsService._load()`'s broad per-source `try/except`, which degrades the **entire** source to `[]` on any failure. The intended fault isolation was per-collector, not per-row — so 299 healthy rooms disappeared from analytics because of 1 corrupted one, with no error surfaced anywhere (the endpoint still returned a clean 200).

**Fix** (`apps/api/app/repositories/project_room_repository.py`, `apps/api/app/repositories/project_repository.py`):
- `_loads`/`_deserialize_json` now catch `(TypeError, ValueError)` from `json.loads`, log a warning, and return `None` instead of raising.
- `list_for_owner()`/`list_projects()` now convert each row inside a `try/except` per iteration, skipping (and logging) only the unreadable row instead of the whole loop failing outward.

Net effect: a corrupted row is now dropped/degraded in isolation; every other real room or project the owner has still shows up in Analytics.

## Result

- `pytest tests/test_analytics_dirty_data_stress.py` → **8 passed** (volume survival, all filter combos, redaction, single-corrupt-row isolation).
- `pytest tests/test_analytics.py tests/test_analytics_dirty_data_stress.py` → **27 passed**.
- Full backend suite after the fix → **766 passed, 1 skipped, 1 deselected** (up from 741 pre-existing; no regressions).
- Confirmed still true under load: no 500s, every section status ∈ `{available, empty, error}`, secrets (`api_key=sk-…`) never reach the response body, SQLi-lookalike strings round-trip as inert data (parameterized queries hold).

The dirty-data test is left in the suite as a permanent regression guard — analytics now has a standing "clean under garbage input" proof, not just a one-off manual check.
