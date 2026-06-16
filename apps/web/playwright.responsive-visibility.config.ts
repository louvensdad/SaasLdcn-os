import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? '3100';
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const API_PORT = process.env.PLAYWRIGHT_API_PORT ?? '8101';
const API_URL = `http://127.0.0.1:${API_PORT}`;

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
      command: `python -m uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: '../api',
      url: `${API_URL}/api/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `set NEXT_DIST_DIR=.next-responsive&& set NEXT_PUBLIC_API_URL=${API_URL}&& npm run dev -- --hostname 127.0.0.1 --port ${WEB_PORT}`,
      cwd: '.',
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
