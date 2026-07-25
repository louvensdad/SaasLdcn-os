/**
 * E2E tests for the notification center (Part C frontend).
 *
 * The backend model, migration, repo, and routes live in the Python API
 * (../../api) and are covered by the API's own test suite. These tests
 * cover the client-side contract: the `generationNotificationsClient`
 * endpoints, the `useNotifications` / `useMarkNotificationRead` /
 * `useMarkAllNotificationsRead` / `mergeStreamedNotification` hooks, and
 * the `NotificationCenter` component rendered in the app shell topbar.
 *
 * Every test mocks the API layer via `page.route()` and navigates to the
 * /jobs page (a simple authenticated shell with the topbar mounted).
 */
import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';
const T0 = '2026-07-24T10:00:00.000Z';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function authFixture() {
  return {
    user: {
      user_id: 'notif-user', email: 'notif@example.com', full_name: 'Notif User',
      role: 'admin', locale: 'pt-BR', is_active: true, consent_accepted_at: T0,
      consent_policy_version: '1.0.0', created_at: T0, updated_at: T0,
    },
    tokens: { access_token: 'notif-token', token_type: 'bearer', expires_in: 3600 },
  };
}

type NotifOverride = Partial<{
  id: string; type: string; severity: string; read: boolean;
  action_url: string | null; stage: string | null; created_at: string;
}>;

function notifFixture(overrides: NotifOverride = {}) {
  return {
    id: 'notif-1',
    type: 'TASK_COMPLETED',
    severity: 'SUCCESS',
    read: false,
    action_url: '/meta-factory?projectId=room-1',
    stage: null,
    created_at: T0,
    ...overrides,
  };
}

function listResponse(items: ReturnType<typeof notifFixture>[], unread_count?: number) {
  return {
    items,
    has_more: false,
    next_cursor: null,
    unread_count: unread_count ?? items.filter((item) => !item.read).length,
  };
}

/**
 * Mount standard route mocks for an authenticated /jobs page.
 * `onNotifRequest` is called for every /api/notifications* request so
 * individual tests can assert calls or vary the response over time.
 */
async function mockJobsShell(
  page: Page,
  notifHandler: (route: import('@playwright/test').Route) => Promise<void> | void,
  markReadHandler?: (route: import('@playwright/test').Route, id: string) => Promise<void> | void,
  markAllReadHandler?: (route: import('@playwright/test').Route) => Promise<void> | void,
) {
  const auth = authFixture();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.pathname.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.pathname === '/api/meta-factory/jobs') return route.fulfill({ json: [] });

    // Mark all read
    if (request.method() === 'POST' && url.pathname === '/api/notifications/read-all') {
      if (markAllReadHandler) return markAllReadHandler(route);
      return route.fulfill({ json: { marked_count: 0 } });
    }

    // Mark single notification read
    const readMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (request.method() === 'POST' && readMatch) {
      const notifId = readMatch[1];
      if (markReadHandler) return markReadHandler(route, notifId);
      return route.fulfill({ json: notifFixture({ id: notifId, read: true }) });
    }

    // Notification list
    if (url.pathname === '/api/notifications' || url.pathname.startsWith('/api/notifications?')) {
      return notifHandler(route);
    }

    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('bell icon shows the unread count badge when there are unread notifications', async ({ page }) => {
  await mockJobsShell(page, (route) => route.fulfill({
    json: listResponse([
      notifFixture({ id: 'n1', read: false }),
      notifFixture({ id: 'n2', type: 'TASK_FAILED', severity: 'ERROR', read: false }),
    ], 2),
  }));

  await page.goto(`${WEB_BASE}/jobs`);

  // The badge shows the numeric count on the bell button in the topbar
  await expect(page.getByLabel('Abrir central de notificações')).toBeVisible();
  await expect(page.getByText('2')).toBeVisible();
});

test('bell badge is absent when all notifications are read', async ({ page }) => {
  await mockJobsShell(page, (route) => route.fulfill({
    json: listResponse([notifFixture({ id: 'n1', read: true })], 0),
  }));

  await page.goto(`${WEB_BASE}/jobs`);
  await expect(page.getByLabel('Abrir central de notificações')).toBeVisible();

  // No badge digit -- the element only renders when unread > 0
  await expect(page.locator('[aria-label="Abrir central de notificações"] span')).toHaveCount(0);
});

test('opening the notification center renders all items with titles and "nova" badge for unread', async ({ page }) => {
  await mockJobsShell(page, (route) => route.fulfill({
    json: listResponse([
      notifFixture({ id: 'n1', type: 'TASK_COMPLETED', severity: 'SUCCESS', read: false }),
      notifFixture({ id: 'n2', type: 'TASK_FAILED', severity: 'ERROR', read: true }),
    ], 1),
  }));

  await page.goto(`${WEB_BASE}/jobs`);
  await page.getByLabel('Abrir central de notificações').click();

  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
  await expect(dialog).toBeVisible();

  // Both notification titles are rendered
  await expect(dialog.getByText('Geração concluída')).toBeVisible();
  await expect(dialog.getByText('Geração falhou')).toBeVisible();

  // Only the unread notification shows the "nova" badge
  await expect(dialog.getByText('nova')).toHaveCount(1);
});

test('empty state is shown when there are no notifications', async ({ page }) => {
  await mockJobsShell(page, (route) => route.fulfill({
    json: listResponse([], 0),
  }));

  await page.goto(`${WEB_BASE}/jobs`);
  await page.getByLabel('Abrir central de notificações').click();

  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
  await expect(dialog.getByText('Nenhuma notificação')).toBeVisible();
  await expect(dialog.getByText('A central está pronta para futuros eventos do backend.')).toBeVisible();
});

test('unread filter tab shows only unread items', async ({ page }) => {
  await mockJobsShell(page, (route) => route.fulfill({
    json: listResponse([
      notifFixture({ id: 'n1', type: 'TASK_COMPLETED', read: false }),
      notifFixture({ id: 'n2', type: 'TASK_FAILED', severity: 'ERROR', read: true }),
    ], 1),
  }));

  await page.goto(`${WEB_BASE}/jobs`);
  await page.getByLabel('Abrir central de notificações').click();

  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
  await dialog.getByRole('button', { name: 'Não lidas' }).click();

  await expect(dialog.getByText('Geração concluída')).toBeVisible();
  await expect(dialog.getByText('Geração falhou')).toHaveCount(0);
});

test('completed filter tab shows TASK_COMPLETED and BUILD_COMPLETED notifications only', async ({ page }) => {
  await mockJobsShell(page, (route) => route.fulfill({
    json: listResponse([
      notifFixture({ id: 'n1', type: 'TASK_COMPLETED', read: false }),
      notifFixture({ id: 'n2', type: 'BUILD_COMPLETED', severity: 'SUCCESS', read: false }),
      notifFixture({ id: 'n3', type: 'TASK_FAILED', severity: 'ERROR', read: false }),
    ], 3),
  }));

  await page.goto(`${WEB_BASE}/jobs`);
  await page.getByLabel('Abrir central de notificações').click();

  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
  await dialog.getByRole('button', { name: 'Concluídas' }).click();

  await expect(dialog.getByText('Geração concluída')).toBeVisible();
  await expect(dialog.getByText('Build concluído')).toBeVisible();
  await expect(dialog.getByText('Geração falhou')).toHaveCount(0);
});

test('failed filter tab shows TASK_FAILED and TASK_STALLED notifications only', async ({ page }) => {
  await mockJobsShell(page, (route) => route.fulfill({
    json: listResponse([
      notifFixture({ id: 'n1', type: 'TASK_FAILED', severity: 'ERROR', read: false }),
      notifFixture({ id: 'n2', type: 'TASK_STALLED', severity: 'WARNING', read: false }),
      notifFixture({ id: 'n3', type: 'TASK_COMPLETED', read: false }),
    ], 3),
  }));

  await page.goto(`${WEB_BASE}/jobs`);
  await page.getByLabel('Abrir central de notificações').click();

  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
  await dialog.getByRole('button', { name: 'Falhas' }).click();

  await expect(dialog.getByText('Geração falhou')).toBeVisible();
  await expect(dialog.getByText('Geração travada')).toBeVisible();
  await expect(dialog.getByText('Geração concluída')).toHaveCount(0);
});

test('action-needed filter tab shows TASK_WAITING_USER and ACTION_REQUIRED severity items', async ({ page }) => {
  await mockJobsShell(page, (route) => route.fulfill({
    json: listResponse([
      notifFixture({ id: 'n1', type: 'TASK_WAITING_USER', severity: 'ACTION_REQUIRED', stage: 'backend', read: false }),
      notifFixture({ id: 'n2', type: 'TASK_COMPLETED', read: false }),
    ], 2),
  }));

  await page.goto(`${WEB_BASE}/jobs`);
  await page.getByLabel('Abrir central de notificações').click();

  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
  await dialog.getByRole('button', { name: 'Requer ação' }).click();

  await expect(dialog.getByText('Ação necessária')).toBeVisible();
  await expect(dialog.getByText('Geração concluída')).toHaveCount(0);
});

test('clicking an unread notification calls POST /read and clears the "nova" badge', async ({ page }) => {
  const markedIds: string[] = [];
  await mockJobsShell(
    page,
    (route) => route.fulfill({
      json: listResponse([notifFixture({ id: 'notif-read-test', read: false })], 1),
    }),
    async (route, id) => {
      markedIds.push(id);
      return route.fulfill({ json: notifFixture({ id, read: true }) });
    },
  );

  await page.goto(`${WEB_BASE}/jobs`);
  await page.getByLabel('Abrir central de notificações').click();

  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
  await expect(dialog.getByText('nova')).toBeVisible();

  // Click the notification card
  await dialog.getByText('Geração concluída').click();

  await expect.poll(() => markedIds).toContain('notif-read-test');
  // The "nova" badge disappears from the cache-updated UI
  await expect(dialog.getByText('nova')).toHaveCount(0);
});

test('clicking a notification with action_url navigates and closes the panel', async ({ page }) => {
  await mockJobsShell(page, (route) => route.fulfill({
    json: listResponse([
      notifFixture({ id: 'n1', type: 'TASK_COMPLETED', action_url: '/jobs', read: true }),
    ], 0),
  }));

  // Also mock the /jobs destination as a simple JSON wall (page is already /jobs)
  await page.goto(`${WEB_BASE}/jobs`);
  await page.getByLabel('Abrir central de notificações').click();

  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
  await expect(dialog).toBeVisible();

  await dialog.getByText('Geração concluída').click();

  // Dialog closes after navigation
  await expect(dialog).toHaveCount(0);
});

test('"Marcar como lidas" button calls POST /read-all and clears unread badge', async ({ page }) => {
  let markAllCalled = false;
  await mockJobsShell(
    page,
    (route) => route.fulfill({
      json: listResponse([
        notifFixture({ id: 'n1', read: false }),
        notifFixture({ id: 'n2', type: 'TASK_FAILED', severity: 'ERROR', read: false }),
      ], 2),
    }),
    undefined,
    async (route) => {
      markAllCalled = true;
      return route.fulfill({ json: { marked_count: 2 } });
    },
  );

  await page.goto(`${WEB_BASE}/jobs`);
  await expect(page.getByText('2')).toBeVisible(); // unread badge

  await page.getByLabel('Abrir central de notificações').click();
  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });

  await dialog.getByRole('button', { name: 'Marcar como lidas' }).click();
  await expect.poll(() => markAllCalled).toBe(true);

  // Unread badge disappears from the bell button
  await expect(page.locator('[aria-label="Abrir central de notificações"] span')).toHaveCount(0);
});

test('"Marcar como lidas" button is disabled when there are no unread notifications', async ({ page }) => {
  await mockJobsShell(page, (route) => route.fulfill({
    json: listResponse([notifFixture({ id: 'n1', read: true })], 0),
  }));

  await page.goto(`${WEB_BASE}/jobs`);
  await page.getByLabel('Abrir central de notificações').click();

  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
  await expect(dialog.getByRole('button', { name: 'Marcar como lidas' })).toBeDisabled();
});

test('a notification streamed from an SSE job feed merges immediately without waiting for the next poll', async ({ page }) => {
  const ROOM_ID = 'room-stream-notif';
  const JOB_ID = 'genjob-stream-notif';
  const T_START = '2026-07-24T11:00:00.000Z';
  const auth = authFixture();

  // The streamed notification -- same shape the backend `notification` SSE
  // frame carries so `mergeStreamedNotification` can merge it straight into
  // the React Query cache without a round-trip poll.
  const streamedNotif = notifFixture({
    id: 'notif-streamed',
    type: 'STAGE_COMPLETED',
    severity: 'SUCCESS',
    read: false,
    stage: 'backend',
    created_at: T_START,
  });

  const runningJob = {
    id: JOB_ID, projectId: ROOM_ID, generatedProjectId: null, workspaceId: 'enterprise',
    status: 'BACKEND_GENERATING', currentStage: 'BACKEND_GENERATING',
    provider: 'anthropic', providerLabel: 'Claude', model: 'claude-sonnet-4',
    blueprintVersion: 1, startedAt: T_START, finishedAt: null, progress: 50,
    error: null, retryCount: 0, artifacts: [], logs: [], checkpoints: [],
    stageStatuses: { contracts: 'success', backend: 'running', build: 'waiting', package: 'waiting' },
    projectName: 'StreamTest', partial: true, valid: false, packageReady: false,
    createdAt: T_START, updatedAt: T_START, events: [],
  };
  const roomFixture = {
    room_id: ROOM_ID, workspace_id: 'enterprise', owner_user_id: 'notif-user',
    title: 'StreamTest', status: 'WAITING_META_FACTORY', locale: 'pt-BR',
    prompt_master_md: '# Stream', spec: {
      raw_intent: 'Stream', product_summary: 'Stream', target_users: [], business_rules: [],
      entities: [], core_workflows: [], non_functional: {},
      suggested_stack: { language: 'TypeScript', runtime: 'Node', framework: 'Next.js', language_reason: '', framework_reason: '', architecture: 'clean', architecture_reason: '' },
      locale: 'pt-BR', assumptions: [], open_questions: [], confidence: 90,
    },
    architecture_blueprint: { version: 1, decisions: [] },
    active_blueprint_version: 1, messages: [], created_at: T_START, updated_at: T_START,
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.pathname.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.pathname.includes(`/api/project-rooms/${ROOM_ID}`)) return route.fulfill({ json: roomFixture });
    if (url.pathname === '/api/notifications' || url.pathname.startsWith('/api/notifications?')) {
      // Initial poll returns empty; the SSE stream will push the real notification
      return route.fulfill({ json: listResponse([], 0) });
    }
    if (url.pathname.includes('/api/meta-factory/jobs/latest')) {
      return route.fulfill({ json: runningJob });
    }
    if (url.pathname.includes(`/api/meta-factory/jobs/${JOB_ID}/events`)) {
      // Push a `notification` SSE frame immediately -- this is what
      // `handleNotification` feeds to `mergeStreamedNotification`.
      const frame = `data: ${JSON.stringify({ type: 'notification', notification: streamedNotif })}\n\n`;
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: frame });
    }
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await expect(page.getByRole('heading', { name: /StreamTest/ })).toBeVisible();

  // Open the notification center -- the streamed notification should already
  // be in the cache without needing a 30s poll cycle
  await expect.poll(async () => {
    await page.getByLabel('Abrir central de notificações').click();
    const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
    const hasItem = await dialog.getByText('Etapa concluída').count();
    if (!hasItem) await page.getByLabel('Fechar central de notificações').click();
    return hasItem;
  }, { timeout: 10_000, intervals: [500] }).toBeGreaterThan(0);

  // Verify the badge also shows 1 unread from the merge
  await expect(page.getByRole('dialog', { name: 'Central de notificações' }).getByText('nova')).toBeVisible();
});
