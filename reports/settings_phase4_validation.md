# Settings Enterprise Phase 4 — Validation

## Delivered

- Git provider connections and repository records now use composite workspace/user/provider scope, encrypted tokens, composite primary keys, workspace/user foreign keys and workspace indexes.
- Git routes resolve and authorize the requested workspace through tenant membership; personal workspace fallback is explicit and deterministic.
- Git cache keys, connect, validate, disconnect, repository create/list, initial commit, push and last-commit operations propagate workspace scope.
- Activity Feed queries and event detail/export are workspace-scoped and the duplicate export route was removed.
- The staging harness now requires `LDCN_STAGING_WORKSPACE_ID` and appends it to every Git operation. It remains opt-in and never prints credentials or provider response bodies.
- Runtime frontend has an authenticated streaming consumer with reconnect, exponential backoff, heartbeat/activity-based liveness, stale detection, polling fallback and an accessible transport indicator.
- The certification matrix was upgraded to version 4 and records workspace isolation and SSE resilience separately.

## Local validation

- Git provider focused suite: 9 passed.
- Frontend typecheck: passed.
- Python compile checks for changed API modules: passed.

## External certification status

Live GitHub/GitLab staging mutation was not executed because no technical staging credentials and workspace ID were supplied. This is intentionally not marked certified. Run the staging harness only with a dedicated technical staging account and CI secret store.

## Remaining evidence

- Full Alembic upgrade must be run against the deployment database before rollout; the migration copies legacy records into the first membership workspace and uses a deterministic personal-workspace fallback.
- Runtime collectors remain deployment-dependent. Components without evidence stay `UNKNOWN`; no CPU/RAM/container/autoscaling values are fabricated by this phase.
- A browser E2E scenario for SSE interruption and polling fallback remains to be added; local unit/type checks do not claim that certification.