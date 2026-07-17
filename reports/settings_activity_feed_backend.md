# Settings Phase 2 — Activity Feed Backend

Status: foundation implemented.

- Added `activity_events` model, migration `20260716_p1_activity_feed`, repository, service, schemas and protected `GET /api/activity-feed`.
- Cursor pagination and filters: category, status, from, to, limit.
- Metadata redacts token/secret/password/credential/API-key/authorization/prompt/private-key fields and caps oversized values/lists.
- User isolation is enforced in the repository query; no credentials are returned.
- Preference, Git connect/disconnect and Runtime config success events are wired.
- Focused redaction tests: 2 passed.
- Remaining: broader event coverage for every legacy destructive/export/sync path should be wired as those paths are exercised; no event is fabricated for unavailable actions.