import { defineConfig, devices } from '@playwright/test';

// One-off harness for the real, live-production QA validation cycle
// (spec: "VALIDAÇÃO COMPLETA DO LDCN OS EM PRODUÇÃO"). Deliberately separate
// from ../playwright.config.ts (the CI suite, which mocks all LLM routes) --
// this one drives https://aicodebase.com.br with a real account and a real,
// already-configured provider key, so it must never run as part of CI.
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'https://aicodebase.com.br',
    trace: 'on',
    screenshot: 'on',
  },
});
