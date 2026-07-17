# Settings Phase 2 — E2E Runtime Manager

Status: implemented and validated.

- Replaced fixed Playwright `webServer` entries with `scripts/e2e-runtime-manager.mjs` and `scripts/run-e2e.mjs`.
- Reuses healthy services, selects free ports when a service is unavailable, creates an atomic per-run lock, records run id/port/PID/source, waits on healthchecks, and cleans only spawned PIDs.
- Uses isolated E2E SQLite databases and Windows-safe `process.execPath`/`cmd.exe` launching.
- Full `tests/settings.spec.ts`: 8 passed in 16.3s on dynamic ports 3102/8103 while standard ports remained occupied.
- The current fixture validates UI behavior and persistence; provider-authenticated external Git flows remain integration tests, not synthetic E2E fixtures.