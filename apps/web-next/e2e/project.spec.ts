import { expect, test } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const NOVA = '/p/room_5b9e2c71a0d4';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('the cockpit shows every station with the word its own source returned', async ({ page }) => {
  await page.goto(NOVA);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nova Commerce');
  const line = page.getByRole('group', { name: 'Evidence Line' });
  await expect(line).toContainText('META_FACTORY_RUNNING');
  await expect(line).toContainText('V3');
  await expect(line).toContainText('APPROVED');
  await expect(line).toContainText('BACKEND_GENERATING');
  // The kernel says two blockers and the delivery is blocked: neither is rounded up to proof.
  await expect(line).toContainText('2 BLOCKER');
  await expect(line).toContainText('BLOCKED');
  await expect(page.getByText('Conceptual state: GENERATING')).toBeVisible();
});

test('the cockpit reads the kernel and the delivery decision as they are', async ({ page }) => {
  await page.goto(NOVA);
  await expect(page.getByText('The mission is still generating; two quality blockers are open from the previous attempt.')).toBeVisible();
  await expect(page.getByText('no — no build has been verified')).toBeVisible();
  await expect(page.getByText('2 / 4')).toBeVisible();
  await expect(page.getByText('The mission has not finished yet.')).toBeVisible();
});

test('a key that answers nothing says so instead of rendering an empty project', async ({ page }) => {
  await page.goto('/p/room_does_not_exist');
  await expect(page.getByText('No project answers for this key')).toBeVisible();
});

test('missions list the attempts of this project and archiving posts to the backend', async ({ page }) => {
  await page.goto(`${NOVA}/missions`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every mission of this project');
  // The archived failed attempt is hidden until asked for.
  await expect(page.getByRole('row', { name: /genjob_9f14c7b2e08a55/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /genjob_2c81f0e9a47d13/ })).toHaveCount(0);
  await page.getByText('Show archived (1)').click();
  await expect(page.getByRole('row', { name: /genjob_2c81f0e9a47d13/ })).toBeVisible();

  const patched = page.waitForRequest((request) => request.url().includes('/archive') && request.method() === 'PATCH');
  await page.getByRole('row', { name: /genjob_9f14c7b2e08a55/ }).getByRole('button', { name: 'Archive' }).click();
  await patched;
});

test('deleting a mission asks first and says what archiving does instead', async ({ page }) => {
  await page.goto(`${NOVA}/missions`);
  const row = page.getByRole('row', { name: /genjob_9f14c7b2e08a55/ });
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Delete for good' })).toBeVisible();
  const deleted = page.waitForRequest((request) => request.method() === 'DELETE' && request.url().includes('/api/meta-factory/jobs/'));
  await row.getByRole('button', { name: 'Delete for good' }).click();
  await deleted;
  await expect(page.getByText('Archiving keeps the mission and its evidence')).toBeVisible();
});

test('the project scope nav carries the project name', async ({ page }) => {
  await page.goto(NOVA);
  const nav = page.getByRole('navigation', { name: 'Project' });
  await expect(nav).toContainText('Nova Commerce');
  await nav.getByRole('link', { name: 'Missions' }).click();
  await expect(page).toHaveURL(new RegExp(`${NOVA}/missions$`));
});
