import { expect, test } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const EVIDENCE = '/p/room_5b9e2c71a0d4/evidence';
const DELIVERY = '/p/room_5b9e2c71a0d4/delivery';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('every verdict is read from its own endpoint and none is inferred', async ({ page }) => {
  await page.goto(EVIDENCE);
  const graph = page.getByRole('group', { name: 'Evidence graph' });
  await expect(graph).toContainText('NOT_VERIFIED');
  await expect(graph).toContainText('2 BLOCKER');
  await expect(graph).toContainText('CHANGES_REQUIRED');
  await expect(graph).toContainText('BLOCKED');
  await expect(page.getByText('Two quality blockers and one requirement are still open')).toBeVisible();
  await expect(page.getByText('The latest session failed at the API gate')).toBeVisible();
});

test('evidence that was never recorded stays on the graph, and each pillar names what rests on it', async ({ page }) => {
  await page.goto(EVIDENCE);
  const graph = page.getByRole('group', { name: 'Evidence graph' });
  // Pillars fold their evidence until asked; the fold says how much rests on each.
  await expect(graph.getByRole('button', { name: 'Build log: available' })).toHaveCount(0);
  await expect(graph.getByRole('button', { name: 'Build: NOT_VERIFIED' })).toContainText('evidence 2');
  await graph.getByRole('button', { name: 'Show the evidence of Build' }).click();
  await expect(graph.getByRole('button', { name: 'Build log: available' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all evidence' }).click();
  // The kernel lists the test run with available: false: it is drawn, as not recorded.
  await expect(graph.getByRole('button', { name: 'Test run: not recorded' })).toBeVisible();
  // The latest Test Room session failed at the API gate: the gate says so in the backend's word.
  await expect(graph.getByRole('button', { name: 'API: failed' })).toBeVisible();
  await graph.getByRole('button', { name: 'Kernel verdict: GENERATING' }).click();
  await expect(page.getByRole('complementary', { name: 'Kernel verdict' })).toContainText('PARTIALLY_VERIFIED');
});

test('the quality gate findings are listed with what would fix them', async ({ page }) => {
  await page.goto(EVIDENCE);
  await expect(page.getByRole('row', { name: /Secret-looking string/ })).toContainText('BLOCKER');
  await expect(page.getByRole('row', { name: /Missing docstring/ })).toContainText('auto-fixable');
  await expect(page.getByText('2 / 3 / 1')).toBeVisible();
});

test('releasing anyway needs the exact Portuguese phrase the backend compares', async ({ page }) => {
  await page.goto(EVIDENCE);
  const action = page.getByRole('button', { name: 'Record the conscious release' });
  await expect(action).toBeDisabled();
  await page.getByLabel('Type exactly: LIBERAR COM RISCO').fill('liberar');
  await expect(action).toBeDisabled();
  await page.getByLabel('Type exactly: LIBERAR COM RISCO').fill('LIBERAR COM RISCO');
  await expect(action).toBeEnabled();
  const posted = page.waitForRequest((request) => request.url().includes('/force-release') && request.method() === 'POST');
  await action.click();
  const request = await posted;
  expect(request.postDataJSON()).toEqual({ confirmation: 'LIBERAR COM RISCO' });
});

test('delivery says what is true before shipping, field by field', async ({ page }) => {
  await page.goto(DELIVERY);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The last mile');
  await expect(page.getByText('The mission has not finished yet.')).toBeVisible();
  // The path to the gate: one backend field per station, and the gate itself stays the owner's choice.
  const gate = page.getByRole('group', { name: 'Path to the delivery gate' });
  await expect(gate).toContainText('build_verified: false');
  await expect(gate).toContainText('can_release: false');
  await expect(gate).toContainText('blocked: true');
  await expect(gate).toContainText('BLOCKED');
  const checklist = page.getByRole('listitem').first();
  await expect(checklist).toBeTruthy();
  await expect(page.getByText('A real build was verified')).toBeVisible();
  await expect(page.getByText('GET …/quality-report · can_release')).toBeVisible();
});

test('choosing a delivery mode records the preference and never gates the package', async ({ page }) => {
  await page.goto(DELIVERY);
  await expect(page.getByText('Download the project as a ZIP')).toBeVisible();
  await expect(page.getByText('The simplest path, with nothing to connect first.')).toBeVisible();
  const posted = page.waitForRequest((request) => request.url().endsWith('/delivery') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Choose this' }).first().click();
  const request = await posted;
  expect(request.postDataJSON()).toEqual({ delivery_mode: 'zip_only' });
  await expect(page.getByText('Choosing records a preference')).toBeVisible();
});

test('the package reports what it contains before it is downloaded', async ({ page }) => {
  await page.goto(DELIVERY);
  await page.getByRole('button', { name: 'Prepare the package' }).click();
  await expect(page.getByText('214')).toBeVisible();
  await expect(page.getByText('clean')).toBeVisible();
});

test('the export form sends the fields the backend declares', async ({ page }) => {
  await page.goto(DELIVERY);
  await page.getByLabel('Owner or group').fill('nova-labs');
  await page.getByLabel('Repository name').fill('nova-commerce');
  const posted = page.waitForRequest((request) => request.url().includes('/export/github') && request.method() === 'POST');
  await page.getByRole('button', { name: /Export to github/ }).click();
  const request = await posted;
  expect(request.postDataJSON()).toMatchObject({ namespace: 'nova-labs', repo_name: 'nova-commerce', branch: 'main', visibility: 'private' });
  await expect(page.getByText('https://github.com/nova-labs/nova-commerce')).toBeVisible();
});
