import { expect, test, type Page } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const ROOM = '/p/room_5b9e2c71a0d4';
const TEST_ROOM = `${ROOM}/evidence/test-room`;

const fact = (page: Page, label: string) => page.locator('.fact', { has: page.locator('.label', { hasText: label }) });
const gatePanel = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('the Test Room reads the latest session gate by gate, down to the evidence each gate recorded', async ({ page }) => {
  await page.goto(TEST_ROOM);
  await expect(page.getByRole('heading', { level: 1, name: 'Test Room' })).toBeVisible();
  await expect(fact(page, 'Status')).toContainText('failed');
  await expect(fact(page, 'Stopped at')).toContainText('api');
  // Another session passed every gate, but a later one failed: this is not the session on record.
  await expect(fact(page, 'Proof on record')).toContainText('Not the passing session');
  await expect(page.getByRole('group', { name: 'Gates of session trs_88a1' })).toBeVisible();

  const api = gatePanel(page, 'API');
  await expect(api).toContainText('POST /invoices');
  await expect(api).toContainText('HTTP 500');
  // A step that produced no result says why, next to the step.
  await expect(gatePanel(page, 'Health')).toContainText('The API gate failed first, so the health check was never reached.');
  const tests = gatePanel(page, 'Tests');
  await expect(tests).toContainText('pytest -q');
  await expect(tests).toContainText('exit 0');
  // The backend records the runner's exit code, not a result per test, and the room says so instead of drawing one.
  await expect(tests).toContainText('not a result per test');
});

test('every step sits on the run in the order it was observed', async ({ page }) => {
  await page.goto(TEST_ROOM);
  const run = page.getByRole('list', { name: 'Steps of session trs_88a1 in the order they were observed' });
  await expect(run.getByRole('listitem')).toHaveCount(4);
  await expect(run.getByRole('listitem').nth(0)).toContainText('Build');
  await expect(run.getByRole('listitem').nth(3)).toContainText('Health');
  const positions = await run.getByRole('listitem').evaluateAll((items) => items.map((item) => Number.parseFloat((item as HTMLElement).style.getPropertyValue('--x'))));
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  expect(positions[0]).toBeGreaterThan(0);
  expect(positions[3]).toBeLessThan(100);
});

test('an earlier session is opened from the history, and the passing session on record is marked', async ({ page }) => {
  await page.goto(TEST_ROOM);
  const history = page.getByRole('navigation', { name: 'Sessions' });
  await expect(history.getByRole('link')).toHaveCount(2);
  await expect(history.locator('[aria-current="true"]')).toContainText('trs_88a1');
  const earlier = history.getByRole('link', { name: /trs_5c20e7a1/ });
  await expect(earlier).toContainText('the passing session on record');
  await earlier.click();

  await expect(page).toHaveURL(/\/evidence\/test-room\?session=trs_5c20e7a1$/);
  await expect(fact(page, 'Status')).toContainText('passed');
  await expect(fact(page, 'Proof on record')).toContainText('Passed, then a later session failed');
  const running = gatePanel(page, 'Running');
  await expect(running).toContainText('uvicorn app.main:app --host 0.0.0.0 --port 8080');
  await expect(running).toContainText('handle: bg_41c7');
  await expect(gatePanel(page, 'Healthy')).toContainText('HTTP 200');
});

test('a session this project did not record is named, and never replaced by another', async ({ page }) => {
  await page.goto(`${TEST_ROOM}?session=trs_000000000000`);
  const state = page.getByRole('status').filter({ hasText: 'No session trs_000000000000 was recorded for this project' });
  await expect(state).toBeVisible();
  await expect(page.getByRole('group', { name: /^Gates of session/ })).toHaveCount(0);
  await state.getByRole('link', { name: 'Show the latest session' }).click();
  await expect(page.getByRole('group', { name: 'Gates of session trs_88a1' })).toBeVisible();
});

test('running again shows what the run returned, including the application output', async ({ page }) => {
  await page.goto(TEST_ROOM);
  await page.getByRole('button', { name: 'Run again' }).click();
  const output = page.getByRole('region', { name: 'What this run returned' });
  await expect(output).toContainText('Uvicorn running on http://0.0.0.0:8080');
  await expect(output).toContainText('passed');
});

test('evidence, verification, the runtime chain and a mission all open the Test Room of the same session', async ({ page }) => {
  await page.goto(`${ROOM}/evidence`);
  await page.locator('section.panel', { has: page.getByRole('heading', { name: 'Test room', exact: true }) }).getByRole('link', { name: 'Open Test Room' }).click();
  await expect(page).toHaveURL(/\/evidence\/test-room\?session=trs_88a1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Test Room' })).toBeVisible();

  await page.goto(`${ROOM}/engineering/verification`);
  await page.locator('section.panel', { has: page.getByRole('heading', { name: 'trs_5c20e7a1' }) }).getByRole('link', { name: 'Open in Test Room' }).click();
  await expect(page).toHaveURL(/\/evidence\/test-room\?session=trs_5c20e7a1$/);

  await page.goto(`${ROOM}/runtime`);
  await page.getByRole('group', { name: 'Runtime proof chain' }).getByRole('button', { name: 'API: failed' }).dblclick();
  await expect(page).toHaveURL(/\/evidence\/test-room\?session=trs_88a1$/);

  await page.goto(`${ROOM}/evidence`);
  const graph = page.getByRole('group', { name: 'Evidence graph' });
  await page.getByRole('button', { name: 'Show all evidence' }).click();
  await graph.getByRole('button', { name: 'API: failed' }).dblclick();
  await expect(page).toHaveURL(/\/evidence\/test-room\?session=trs_88a1$/);

  await page.goto(`${ROOM}/missions/genjob_2c81f0e9a47d13`);
  await page.locator('section.panel', { has: page.getByRole('heading', { name: 'Runtime and evidence' }) }).getByRole('link', { name: 'Open Test Room' }).click();
  await expect(page).toHaveURL(/\/evidence\/test-room\?mission=genjob_2c81f0e9a47d13$/);
  // The earlier mission's project is the one read, and the screen says it is not the latest.
  await expect(page.locator('.page-head .eyebrow .chip.mono')).toHaveText('nova-commerce_8e21d4c7a0b9');
  await expect(page.getByRole('status').filter({ hasText: 'The project an earlier mission generated' })).toBeVisible();
});
