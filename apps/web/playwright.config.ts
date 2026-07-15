import { randomUUID } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const e2eRunId = `e2e-test-${randomUUID().replaceAll('-', '')}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/start-e2e-api.mjs',
      cwd: '.',
      env: { LDCN_E2E_RUN_ID: e2eRunId },
      url: 'http://127.0.0.1:8001/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
      cwd: '.',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
