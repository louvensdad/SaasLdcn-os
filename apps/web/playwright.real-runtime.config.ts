import { defineConfig, devices } from '@playwright/test';

// Separate config for the Phase 2 "Sala de Execução" real-runtime suite
// (live-preview-real-runtime.spec.ts). Deliberately NOT the standard
// run-e2e.mjs / start-e2e-api.mjs harness: that harness forces
// EXECUTION_RUNTIME=sandbox + ALLOW_HOST_EXECUTION=false specifically so CI
// never spawns real child processes -- which means live-preview always
// returns status="unsupported" under it. This config starts a SEPARATE,
// still test-isolated (own sqlite db, own ports) API instance with host
// execution explicitly enabled, since that real toggle is the whole point of
// this suite. Mirrors playwright.responsive-visibility.config.ts's pattern
// of a dedicated webServer pair rather than the shared runtime manager.

const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? '3300';
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const API_PORT = process.env.PLAYWRIGHT_API_PORT ?? '8301';
const API_URL = `http://127.0.0.1:${API_PORT}`;
// Deliberately NOT randomUUID(): Playwright re-evaluates this config's
// top-level code independently in each worker process, so a fresh random
// value here would differ between the process that spawns the webServer
// (and runs its `alembic upgrade head` against ITS computed db path) and the
// worker process actually running the spec (which would then point its
// fixture-creation script at a DIFFERENT, migration-less sqlite file --
// confirmed live: this produced a real "no such table: projects" failure).
// Fixed workers:1 above means only one run is ever active, so a stable id
// carries no collision risk.
const e2eRunId = 'e2e-test-real-runtime-fixed';

// test-urls.ts reads these at import time -- set before any spec module loads.
process.env.PLAYWRIGHT_BASE_URL = WEB_URL;
process.env.PLAYWRIGHT_API_URL = `${API_URL}/api`;
// The spec's beforeAll needs this to compute the SAME isolated sqlite db path
// start-real-runtime-api.mjs uses, so its fixture-creation script writes into
// the identical database the running API instance reads from.
process.env.LDCN_E2E_RUN_ID = e2eRunId;

export default defineConfig({
  testDir: './tests',
  testMatch: 'live-preview-real-runtime.spec.ts',
  fullyParallel: false,
  workers: 1,
  // Real npm install + uvicorn/next dev startup measured in minutes, not
  // seconds -- this is the whole reason the standard suite mocks it.
  timeout: 10 * 60 * 1000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-real-runtime', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/start-real-runtime-api.mjs',
      cwd: '.',
      // The dev-mode CORS default allowlist only covers ports 3000/3001/3100
      // (app/core/config.py's _DEV_DEFAULT_ORIGINS) -- WEB_PORT here doesn't
      // match any of those, so without this the browser's real login request
      // gets silently CORS-blocked and the app shows "Backend is offline or
      // unreachable" (confirmed live via screenshot: fixture creation and
      // the API's own /api/health both worked fine over plain HTTP -- only
      // the BROWSER's cross-origin fetch was rejected).
      env: { LDCN_E2E_RUN_ID: e2eRunId, PLAYWRIGHT_API_PORT: API_PORT, LDCN_ALLOWED_ORIGINS: WEB_URL },
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --hostname 127.0.0.1 --port ${WEB_PORT}`,
      cwd: '.',
      env: { NEXT_DIST_DIR: '.next-real-runtime', NEXT_PUBLIC_API_URL: API_URL },
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
