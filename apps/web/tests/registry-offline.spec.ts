import { expect, test } from '@playwright/test';

test('wizard shows explicit offline state when backend is unavailable', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/wizard');

  await expect(page.getByText('Technology graph unavailable')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Backend is offline or unreachable.')).toBeVisible({ timeout: 15000 });
});
