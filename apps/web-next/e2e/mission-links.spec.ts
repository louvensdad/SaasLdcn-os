import { expect, test, type Page } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const ROOM = '/p/room_5b9e2c71a0d4';
const LATEST = `${ROOM}/missions/genjob_9f14c7b2e08a55`;
/** The earlier, failed attempt: its generation wrote a project of its own. */
const EARLIER = `${ROOM}/missions/genjob_2c81f0e9a47d13`;

const proofPanel = (page: Page) => page.locator('section.panel', { has: page.getByRole('heading', { name: 'Runtime and evidence' }) });
/** The generated project a runtime or evidence screen reads, as its eyebrow names it. */
const readProject = (page: Page) => page.locator('.page-head .eyebrow .chip.mono');

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('a mission opens the runtime and the evidence of the project it generated, and each screen leads back', async ({ page }) => {
  await page.goto(LATEST);
  const panel = proofPanel(page);
  await expect(panel.getByRole('group', { name: 'Gates of the latest Test Room session' })).toBeVisible();
  await panel.getByRole('link', { name: 'Open runtime' }).click();
  await expect(page).toHaveURL(/\/runtime\?mission=genjob_9f14c7b2e08a55$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Runtime control room' })).toBeVisible();
  await expect(readProject(page)).toHaveText('nova-commerce_3f9a1c2b7d4e');
  // The latest mission's project is the one the project tabs open: there is nothing to warn about.
  await expect(page.getByText('The project an earlier mission generated')).toHaveCount(0);

  await page.getByRole('link', { name: 'Open evidence' }).click();
  await expect(page).toHaveURL(/\/evidence\?mission=genjob_9f14c7b2e08a55$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Why this project is where it is' })).toBeVisible();

  await page.getByRole('link', { name: 'Open runtime' }).click();
  await expect(page).toHaveURL(/\/runtime\?mission=genjob_9f14c7b2e08a55$/);
  await page.getByRole('link', { name: /^Mission started / }).click();
  await expect(page).toHaveURL(new RegExp(`${LATEST}$`));
});

test('an earlier mission opens the project it generated, not the latest one, and says so', async ({ page }) => {
  await page.goto(EARLIER);
  await proofPanel(page).getByRole('link', { name: 'Open runtime' }).click();
  await expect(page).toHaveURL(/\/runtime\?mission=genjob_2c81f0e9a47d13$/);
  await expect(readProject(page)).toHaveText('nova-commerce_8e21d4c7a0b9');
  await expect(page.getByRole('status').filter({ hasText: 'The project an earlier mission generated' })).toBeVisible();

  // Chief verifies a mission: on this evidence screen it is asked about the earlier mission, not the latest.
  const chief = page.waitForRequest(/\/api\/companies\/by-job\/genjob_2c81f0e9a47d13\/chief$/);
  await page.getByRole('link', { name: 'Open evidence' }).click();
  await chief;
  await expect(page).toHaveURL(/\/evidence\?mission=genjob_2c81f0e9a47d13$/);
  await expect(readProject(page)).toHaveText('nova-commerce_8e21d4c7a0b9');

  await page.getByRole('link', { name: 'Show the latest' }).click();
  await expect(page).toHaveURL(/\/evidence$/);
  await expect(readProject(page)).toHaveText('nova-commerce_3f9a1c2b7d4e');
  await expect(page.getByText('The project an earlier mission generated')).toHaveCount(0);
});

test('the evidence stations of a mission map open the evidence of that mission\'s project', async ({ page }) => {
  await page.goto(EARLIER);
  await page.getByRole('group', { name: 'Mission map' }).getByRole('button', { name: /^Quality gate: / }).dblclick();
  await expect(page).toHaveURL(/\/evidence\?mission=genjob_2c81f0e9a47d13$/);
  await expect(readProject(page)).toHaveText('nova-commerce_8e21d4c7a0b9');
});

test('a mission this project does not list is named, and never swapped for the latest', async ({ page }) => {
  await page.goto(`${ROOM}/runtime?mission=genjob_000000000000`);
  const state = page.getByRole('status').filter({ hasText: 'This mission is not listed for this project' });
  await expect(state).toContainText('No mission genjob_000000000000 was returned for this project');
  await expect(page.getByText('nova-commerce_3f9a1c2b7d4e')).toHaveCount(0);
  await state.getByRole('link', { name: 'Show the latest' }).click();
  await expect(page).toHaveURL(/\/runtime$/);
  await expect(readProject(page)).toHaveText('nova-commerce_3f9a1c2b7d4e');
});
