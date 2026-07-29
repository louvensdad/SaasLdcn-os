import { expect, test } from '@playwright/test';
import { authenticateWizardSession } from './wizard-flow-helpers';

test('ldcn presence layer stays visible and does not block navigation', async ({ page, request }) => {
  await authenticateWizardSession(page, request);
  await page.goto('http://127.0.0.1:3000/dashboard');

  await expect(page.getByRole('banner').getByLabel('LDCN observing')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('LDCN presence layer')).toBeVisible();

  await page.getByRole('link', { name: 'Enter architecture journey' }).click();
  await expect(page).toHaveURL(/\/wizard$/);
});
