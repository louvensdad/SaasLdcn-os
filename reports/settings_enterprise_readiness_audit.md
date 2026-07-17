# Settings — Enterprise readiness audit

Date: 2026-07-16

## Delivered in this pass

- Added a backend-driven Settings control-plane overview with real health, backend/API, active-module and active-engine signals.
- Added URL-synchronized Settings tabs (`/settings?tab=...`) while preserving keyboard roving navigation and reduced-motion behavior.
- Removed Git `Coming Soon` sub-tabs from the visible navigation; unsupported provider capabilities are no longer presented as working controls.
- Added durable preference categories for personal, Git, advanced and locale settings.
- Added REST read/write endpoints for the new categories:
  - `GET/PUT /api/users/me/preferences/{category}`
  - supported categories: `personal`, `git`, `advanced`, `locale`
- Added SQLAlchemy fields, repository/service accessors and Alembic migration `20260716_o1_settings_preference_categories`.
- Reworked the frontend sync hook to hydrate and debounce-persist all user-owned preference categories after authentication.
- Preserved localStorage as the fast offline cache and backend persistence as the authenticated durable source of truth.
- Increased shared toggle hit targets to the 44px accessibility minimum and labelled runtime number inputs.
- Added localized overview labels to all supported dictionaries.

## Existing real backend coverage confirmed

- Account: profile, avatar, password, sessions/devices, 2FA, workspace and data/activity export.
- AI: provider key sessions, active provider/model, usage windows, latency, token counts, cache statistics, estimated cost and per-model usage.
- Runtime: CPU, memory, disk, uptime, worker pool and job queue metrics; admin runtime configuration.
- Git: real GitHub/GitLab connections, validation, encrypted token persistence and repository creation/export flows.
- Registry/Advanced: real language, framework, architecture and archetype registry queries.

## Validation

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed with 38 pre-existing warnings and 0 errors.
- `npm run audit:locales:check`: passed.
- `python -m compileall -q apps/api/app apps/api/alembic/versions`: passed.
- Focused backend tests: 21 passed.

## Remaining gaps that require product/backend scope

These are intentionally not represented as fake data:

- GitHub/GitLab repository listing, branch/PR/issue/webhook/deploy-key/SSH-key/pipeline history APIs are not present in the current backend. Bitbucket, Azure DevOps and Gitea transports are also not implemented.
- Runtime sandbox/container/thread/ETA/average-duration/autoscaling telemetry does not exist in the current runtime engine.
- Advanced dependency/import/blueprint/raw-prompt/raw-output/artifact/log views need dedicated authenticated APIs and pagination contracts; existing project-level APIs can be reused but are not Settings-level feeds.
- Backend activity-feed, notification-stream and Settings audit-feed endpoints are not present; the existing notification center is client-foundation UI only.
- Full E2E execution was blocked because ports `3000` and `8001` were already occupied by existing processes. No processes were terminated.
- Root-level pytest collection is currently polluted by generated projects containing duplicate `test_health.py` module names; run `pytest -q apps/api/tests` after fixing that repository-level collection configuration.

## Performance snapshot

- Settings production route First Load JS: approximately 393 kB after this pass.
- The new overview adds one deduplicated health query and one 30-second system-status query; it does not introduce polling or uncontrolled request loops.
- Preference writes are debounced at 800ms per category.