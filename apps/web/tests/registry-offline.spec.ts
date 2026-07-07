import { expect, test } from '@playwright/test';
import { authenticateWizardSession } from './wizard-flow-helpers';

test('wizard shows explicit offline state when backend is unavailable', async ({ page, request }) => {
  await authenticateWizardSession(page, request);
  // Everything except auth is unreachable -- auth is already mocked above,
  // and a truly logged-out session would just redirect to /login instead of
  // showing this offline state, which isn't what this test means to exercise.
  await page.route('**/api/**', async (route) => {
    if (route.request().url().includes('/api/auth/')) return route.fallback();
    await route.abort('failed');
  });
  await page.goto('http://127.0.0.1:3000/wizard');

  await expect(page.getByText('Technology graph unavailable')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Backend is offline or unreachable.')).toBeVisible({ timeout: 15000 });
});
