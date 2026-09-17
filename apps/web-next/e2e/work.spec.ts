import { expect, test } from '@playwright/test';

import { mockApi, showDeveloperDetails, useEnglish } from './mock-api';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('the command center reads the running mission from the jobs endpoint', async ({ page }) => {
  await showDeveloperDetails(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A mission is generating');
  // The project is named on its own line, linked to the mission, never folded into the headline sentence.
  await expect(page.locator('.cc-project').getByRole('link', { name: 'Nova Commerce' })).toHaveAttribute('href', '/p/room_5b9e2c71a0d4/missions/genjob_9f14c7b2e08a55');
  const mission = page.locator('.panel', { hasText: 'BACKEND_GENERATING' }).first();
  await expect(mission.getByText('genjob_9f14c7b2e08a55')).toBeVisible();
  await expect(mission.getByText('48%')).toBeVisible();
  await expect(mission.getByText('GET /api/meta-factory/jobs · status, currentStage, progress')).toBeVisible();
  // The archived failed job is not the active mission and does not count as evidence.
  await expect(page.getByText('Mission finished READY')).toBeVisible();
  await expect(page.getByText('Mission failed at BACKEND_VALIDATING')).toHaveCount(0);
});

test('the signal strip keeps each signal whole: none runs over the next, and what does not fit is cut at the edge', async ({ page }) => {
  const at = (minute: number) => `2026-09-15T19:${String(minute).padStart(2, '0')}:00Z`;
  await page.route('**/api/activity-feed**', (route) => route.fulfill({
    json: {
      items: ['task_waiting_user', 'backend_generation', 'backend_generation', 'contracts_generation', 'preview'].map((action, index) => ({
        id: `evt_strip_${index}`, category: 'generation', action, status: 'success', project_id: 'nova-commerce_3f9a1c2b7d4e', occurred_at: at(50 - index * 9), metadata: {},
      })),
      next_cursor: null,
      has_more: false,
    },
  }));
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/');
  const items = page.locator('.strip-item');
  await expect(items).toHaveCount(5);
  const boxes = await items.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, fits: node.scrollWidth <= Math.ceil(box.width) };
  }));
  for (const [index, box] of boxes.entries()) {
    expect(box.fits, `signal ${index} is narrower than its text`).toBe(true);
    if (index > 0) expect(box.left, `signal ${index} starts inside signal ${index - 1}`).toBeGreaterThanOrEqual(boxes[index - 1]!.right);
  }
});

test('the missions board draws one line per project and links the decision that waits on it', async ({ page }) => {
  await page.goto('/');
  const board = page.getByRole('list', { name: 'Missions' });
  const nova = board.getByRole('listitem').filter({ hasText: 'Nova Commerce' });
  await expect(nova.getByRole('img', { name: /Nova Commerce: .*Generation BACKEND_GENERATING/ })).toBeVisible();
  const helios = board.getByRole('listitem').filter({ hasText: 'Helios Billing' });
  await expect(helios.getByRole('link', { name: 'Decide · PROMPT_READY' })).toHaveAttribute('href', '/p/room_88e3a1f5602c/define/requirements');
  // The list cannot read quality, certification or delivery without a request per project: it says so.
  await expect(page.getByText('a list cannot read them without one request per project (gap G5)')).toBeVisible();
});

test('the bar carries the decision count and the provider that is answering', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: '3 decisions waiting on you' })).toBeVisible();
  const provider = page.getByRole('link', { name: 'Provider ready' });
  await expect(provider).toBeVisible();
  await expect(provider).toContainText('DeepSeek');
  await expect(page.getByText('184')).toBeVisible();
  await expect(page.getByText('Tokens times the provider’s public price')).toBeVisible();
});

test('decisions are composed from three endpoints and each card names its source', async ({ page }) => {
  await showDeveloperDetails(page);
  await page.goto('/inbox');
  await expect(page.getByRole('heading', { name: '3 waiting on you' })).toBeVisible();
  await expect(page.getByText('Approve the PromptMaster of Helios Billing')).toBeVisible();
  await expect(page.getByText('Choose how to deliver Atlas Field Ops')).toBeVisible();
  await expect(page.getByText(/Review the change/)).toBeVisible();
  await expect(page.getByText('GET /api/change-requests · status').first()).toBeVisible();
  await expect(page.getByText('No backend endpoint lists pending decisions')).toBeVisible();

  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 waiting on you' })).toBeVisible();
  await expect(page.getByText('Approve the PromptMaster of Helios Billing')).toHaveCount(0);
});

test('the action center shows system decisions and sends the mark-all-read the backend expects', async ({ page }) => {
  await page.goto('/inbox');
  await expect(page.getByText('Quality gate blocked the release of Nova Commerce')).toBeVisible();
  await expect(page.getByText('1 unread')).toBeVisible();
  const marked = page.waitForRequest((request) => request.url().includes('/api/notifications/read-all') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await marked;
});

test('activity shows each event with the status the backend recorded', async ({ page }) => {
  await showDeveloperDetails(page);
  await page.goto('/inbox/activity');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What happened');
  const row = page.getByRole('row', { name: /started/ });
  await expect(row).toContainText('preview');
  await expect(row).toContainText('success');
  await expect(page.getByText('GET /api/activity-feed · category, status, search, cursor')).toBeVisible();
});

test('the day map lanes events by category and groups an episode without hiding its events', async ({ page }) => {
  await page.route('**/api/activity-feed**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [
        { id: 'e1', category: 'preview', action: 'started', status: 'success', project_id: 'p1', occurred_at: '2026-09-15T10:00:00Z', metadata: {} },
        { id: 'e2', category: 'preview', action: 'stopped', status: 'success', project_id: 'p1', occurred_at: '2026-09-15T10:12:00Z', metadata: {} },
        { id: 'e3', category: 'build', action: 'finished', status: 'failed', project_id: 'p1', occurred_at: '2026-09-15T11:00:00Z', metadata: {} },
      ],
      next_cursor: null,
      has_more: false,
    }),
  }));
  await page.goto('/inbox/activity');
  await expect(page.getByRole('img', { name: /Day map of .*: 3 events in 2 categories/ })).toBeVisible();
  // Two preview events twelve minutes apart form one episode; each of the three events keeps its own mark.
  await expect(page.locator('.dm-episode')).toHaveCount(1);
  await expect(page.locator('.dm-mark')).toHaveCount(3);
  await expect(page.locator('.dm-mark.f-fault')).toHaveCount(1);
});

test('projects joins rooms with their missions and says the join happens here', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: '3 projects' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Nova Commerce/ })).toContainText('Project Room');
  await expect(page.getByRole('row', { name: /Helios Billing/ })).toContainText('PROMPT_READY');
  await expect(page.getByTitle('Joined in the browser: the backend has no project aggregate.')).toBeVisible();
});

test('a project row opens onto every mission behind its line', async ({ page }) => {
  await page.goto('/projects');
  const toggle = page.getByRole('button', { name: 'Show the missions of Nova Commerce' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Hide the missions of Nova Commerce' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: 'BACKEND_GENERATING' })).toHaveAttribute('href', '/p/room_5b9e2c71a0d4/missions/genjob_9f14c7b2e08a55');
  // The archived failed attempt is still one of this project's missions: the row does not hide it.
  await expect(page.getByRole('link', { name: 'FAILED' })).toHaveAttribute('href', '/p/room_5b9e2c71a0d4/missions/genjob_2c81f0e9a47d13');
});

test('the learn panel answers for the screen it is opened on', async ({ page }) => {
  await page.goto('/inbox');
  await page.getByRole('button', { name: 'Learn about this screen' }).click();
  await expect(page.getByText('What is blocked on me, why, and what happens if I decide?')).toBeVisible();
});

test('a decision that this app can take links here, and one it cannot says so', async ({ page }) => {
  await page.goto('/inbox');
  /* Definition and mission decisions carry the room id, so they route inside this app. */
  const definition = page.locator('article.decision', { hasText: 'Approve the PromptMaster' });
  await expect(definition.getByRole('link', { name: 'Take this decision' })).toHaveAttribute(
    'href',
    '/p/room_88e3a1f5602c/define/requirements',
  );
  const mission = page.locator('article.decision', { hasText: 'Choose how to deliver' });
  await expect(mission.getByRole('link', { name: 'Take this decision' })).toHaveAttribute(
    'href',
    '/p/room_1c7d40b8e932/delivery',
  );
  /* A change request names the generated project; the join through the missions list resolves this one. */
  const change = page.locator('article.decision', { hasText: 'Review the change' });
  await expect(change.getByRole('link', { name: 'Take this decision' })).toHaveAttribute(
    'href',
    '/p/room_5b9e2c71a0d4/engineering/changes/chg_6f0a4b12d7e9',
  );
});

test('endpoints stay hidden until developer details are turned on, and the switch remembers', async ({ page }) => {
  await page.goto('/inbox/activity');
  const source = page.getByText('GET /api/activity-feed · category, status, search, cursor');
  await expect(source).toBeAttached();
  await expect(source).toBeHidden();
  const toggle = page.getByRole('button', { name: 'Developer details: off' });
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Developer details: on' })).toHaveAttribute('aria-pressed', 'true');
  await expect(source).toBeVisible();
  await page.reload();
  await expect(page.getByText('GET /api/activity-feed · category, status, search, cursor')).toBeVisible();
});
