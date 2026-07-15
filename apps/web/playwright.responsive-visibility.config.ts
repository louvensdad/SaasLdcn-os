import { randomUUID } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? '3100';
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const API_PORT = process.env.PLAYWRIGHT_API_PORT ?? '8101';
const API_URL = `http://127.0.0.1:${API_PORT}`;
const e2eRunId = `e2e-test-responsive-${randomUUID().replaceAll('-', '')}`;

export default defineConfig({
  testDir: './tests',
  testMatch: 'responsive-visibility.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/start-e2e-api.mjs',
      cwd: '.',
      env: { LDCN_E2E_RUN_ID: e2eRunId, PLAYWRIGHT_API_PORT: API_PORT },
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --hostname 127.0.0.1 --port ${WEB_PORT}`,
      cwd: '.',
      env: { NEXT_DIST_DIR: '.next-responsive', NEXT_PUBLIC_API_URL: API_URL },
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});