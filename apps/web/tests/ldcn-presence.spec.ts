import { expect, test } from '@playwright/test';

test('ldcn presence layer stays visible and does not block navigation', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/dashboard');

  await expect(page.getByRole('banner').getByLabel('LDCN observing')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('LDCN presence layer')).toBeVisible();

  await page.getByRole('link', { name: 'Enter architecture journey' }).click();
  await expect(page).toHaveURL(/\/wizard$/);
  await expect(page.getByText('LDCN context rail')).toBeVisible();
  await expect(page.getByLabel('1. Language')).toBeVisible({ timeout: 15000 });
});
