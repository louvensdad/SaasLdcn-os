import { expect, test } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const RUNTIME = '/p/room_5b9e2c71a0d4/runtime';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('the runtime chain is the gates a Test Room session recorded, then the live preview and its console', async ({ page }) => {
  await page.goto(RUNTIME);
  const chain = page.getByRole('group', { name: 'Runtime proof chain' });
  await expect(chain.getByRole('button', { name: 'Build: observed' })).toBeVisible();
  await expect(chain.getByRole('button', { name: 'API: failed' })).toBeVisible();
  // The health gate never ran because the API gate failed first: not executed is not proof.
  await expect(chain.getByRole('button', { name: 'Health: Not run', exact: true })).toBeVisible();
  await expect(chain.getByRole('button', { name: 'Live preview: running' })).toBeVisible();
  await expect(chain.getByRole('button', { name: 'Browser console: Errors: 1' })).toBeVisible();
  // What the backend does not report is named on the drawing instead of being drawn as an empty success.
  await expect(chain).toContainText('Not reported by the backend.');
});

test('a node is inspected from the keyboard and the inspector closes with Escape', async ({ page }) => {
  await page.goto(RUNTIME);
  const chain = page.getByRole('group', { name: 'Runtime proof chain' });
  const gate = chain.getByRole('button', { name: 'API: failed' });
  await gate.focus();
  await page.keyboard.press('Enter');
  const inspector = page.getByRole('complementary', { name: 'API' });
  await expect(inspector).toContainText('HTTP 500 in 1.2 s');
  await expect(inspector).toContainText('POST /invoices');
  await expect(gate).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(inspector).toHaveCount(0);
});

test('the canvas zooms with its own controls and fits the drawing back', async ({ page }) => {
  await page.goto(RUNTIME);
  const world = page.locator('.topo-canvas .g-world');
  const before = await world.evaluate((element) => getComputedStyle(element).transform);
  await page.getByRole('toolbar', { name: 'Canvas controls' }).getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => world.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before);
  await page.getByRole('toolbar', { name: 'Canvas controls' }).getByRole('button', { name: 'Fit to view' }).click();
  await expect.poll(() => world.evaluate((element) => getComputedStyle(element).transform)).toBe(before);
});
