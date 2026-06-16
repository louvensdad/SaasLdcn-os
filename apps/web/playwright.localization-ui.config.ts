import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'localization-select-ui.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  projects: [
    { name: 'Google Chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'Microsoft Edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'Firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
