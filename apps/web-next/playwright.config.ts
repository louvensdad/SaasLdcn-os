import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3210);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Runs the built app with every backend call mocked in the browser: no real account is ever used. */
export default defineConfig({
  testDir: './e2e',
  /* The first request to a freshly started server pays for its route's first render, and six workers ask at
     once; 45 s was occasionally short on a cold start. Nothing here waits on a network or a model. */
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
