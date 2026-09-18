import { expect, test } from '@playwright/test';

import { mockApi, showDeveloperDetails, useEnglish } from './mock-api';

const MISSION = '/p/room_5b9e2c71a0d4/missions/genjob_9f14c7b2e08a55';
const FAILED = '/p/room_5b9e2c71a0d4/missions/genjob_2c81f0e9a47d13';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('the mission replays its stream and says where it would resume', async ({ page }) => {
  await page.goto(MISSION);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nova Commerce');
  const live = page.getByLabel('Live console');
  await expect(live).toContainText('Backend stage started');
  await expect(live).toContainText('backend/app/routes/invoices.py written');
  await expect(live).toContainText('exit 0');
  // The frames carried ids, so the interface can say what it would resume from.
  await expect(page.getByText(/resumes from event ev_4|Stream closed on a terminal status/).first()).toBeVisible();
});

test('the console filters by what the event actually is', async ({ page }) => {
  await page.goto(MISSION);
  const live = page.getByLabel('Live console');
  await live.getByRole('button', { name: 'Repairs' }).click();
  await expect(live).toContainText('Deterministic repair applied');
  await expect(live).not.toContainText('Backend stage started');
});

test('the pipeline is read from stageStatuses, not from the granular status', async ({ page }) => {
  await page.goto(MISSION);
  const map = page.getByRole('group', { name: 'Mission map' });
  await expect(map).toContainText('contracts');
  await expect(map).toContainText('running');
  await expect(map).toContainText('skipped');
  // The running stage is in focus; its checkpoints are the granular ones and its artefacts the logical ones.
  await expect(page.getByText('Stage backend')).toBeVisible();
  await expect(page.getByText('retry after a truncated response')).toBeVisible();
  await expect(page.getByText('backend/app/routes/invoices.py', { exact: true })).toBeVisible();
});

test('a stage that is running cannot be retried, and one that failed can', async ({ page }) => {
  await page.goto(MISSION);
  await expect(page.getByRole('button', { name: 'Retry partitioned' })).toBeDisabled();

  await page.goto(FAILED);
  const retried = page.waitForRequest((request) => request.url().includes('/stages/backend/retry') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Retry partitioned' }).click();
  const request = await retried;
  expect(request.postDataJSON()).toEqual({ mode: 'partitioned' });
});

test('a failed mission shows both decisions it raises, each naming its field', async ({ page }) => {
  await showDeveloperDetails(page);
  await page.goto(FAILED);
  await expect(page.getByText('Continue with the warnings of this stage')).toBeVisible();
  await expect(page.getByText('The build was skipped after a failure')).toBeVisible();
  await expect(page.getByText('status · NEEDS_USER_ACTION')).toBeVisible();
  await expect(page.getByText('buildStatus · SKIPPED_AFTER_FAILURE')).toBeVisible();
  await expect(page.getByText('Two files failed validation after the repair attempt.')).toBeVisible();
  await expect(page.getByText('1 / 2 / 3')).toBeVisible();

  const continued = page.waitForRequest((request) => request.url().endsWith('/continue') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Continue with warnings' }).click();
  await continued;
});

test('nothing in a healthy mission is presented as waiting on a person', async ({ page }) => {
  await page.goto(MISSION);
  await expect(page.getByText('Nothing in this mission needs you')).toBeVisible();
  // Per-mission tokens have no source: the screen says so instead of estimating.
  await expect(page.getByText('The platform does not report tokens or cost for a single mission')).toBeVisible();
});

test('pausing a running mission posts the pause the backend expects', async ({ page }) => {
  await page.goto(MISSION);
  const paused = page.waitForRequest((request) => request.url().includes('/pause') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Pause' }).click();
  await paused;
});

test('a mission that answers nothing says so', async ({ page }) => {
  await page.goto('/p/room_5b9e2c71a0d4/missions/genjob_missing');
  await expect(page.getByText('This mission did not answer')).toBeVisible();
});

test('the mission map reads every station from its own source and never rounds a gap up to proof', async ({ page }) => {
  await page.goto(MISSION);
  const map = page.getByRole('group', { name: 'Mission map' });
  // Define, from the room.
  await expect(map.getByRole('button', { name: 'Definition: META_FACTORY_RUNNING' })).toBeVisible();
  await expect(map.getByRole('button', { name: 'Architecture: V3' })).toBeVisible();
  // The run, from the job, the kernel and the delivery decision of the project this mission generated.
  await expect(map.getByRole('button', { name: 'Generation: BACKEND_GENERATING' })).toBeVisible();
  await expect(map.getByRole('button', { name: 'Quality gate: 2 BLOCKER' })).toBeVisible();
  await expect(map.getByRole('button', { name: 'Delivery: BLOCKED' })).toBeVisible();
});

test('selecting a station opens its inspector, and selecting a stage drives the stage panel', async ({ page }) => {
  await page.goto(MISSION);
  const map = page.getByRole('group', { name: 'Mission map' });
  await map.getByRole('button', { name: 'Quality gate: 2 BLOCKER' }).click();
  const inspector = page.getByRole('complementary', { name: 'Quality gate' });
  await expect(inspector).toBeVisible();
  // The station was read for this mission's project, so it opens the evidence of that project, not the latest one.
  await expect(inspector.getByRole('link', { name: 'Open Quality gate' })).toHaveAttribute('href', '/p/room_5b9e2c71a0d4/evidence?mission=genjob_9f14c7b2e08a55');
  await inspector.getByRole('button', { name: 'Close' }).click();
  await expect(inspector).toHaveCount(0);

  await map.getByRole('button', { name: 'Stage contracts: Succeeded' }).click();
  await expect(page.getByText('Stage contracts', { exact: true })).toBeVisible();
});

test('a phone gets the mission path as a column instead of the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(MISSION);
  await expect(page.getByRole('group', { name: 'Mission map' })).toBeHidden();
  const path = page.getByRole('list', { name: 'Mission path' });
  await expect(path).toBeVisible();
  await expect(path).toContainText('BACKEND_GENERATING');
  await path.getByRole('button', { name: /contracts/ }).click();
  await expect(page.getByText('Stage contracts', { exact: true })).toBeVisible();
});
