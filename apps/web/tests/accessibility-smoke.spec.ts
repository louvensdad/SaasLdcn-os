import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

test('login has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');

  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});