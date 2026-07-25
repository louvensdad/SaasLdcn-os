import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';
const ROOM_ID = 'room-notif-e2e';
const JOB_ID = 'genjob-notif-e2e';
const T0 = '2026-07-24T12:00:00.000Z';

function sseFrame(payload: unknown, id?: string): string {
  return `${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(payload)}\n\n`;
}

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

function roomFixture() {
  return {
    room_id: ROOM_ID, workspace_id: 'enterprise', owner_user_id: 'notif-user',
    title: 'Orders', status: 'WAITING_META_FACTORY', locale: 'pt-BR',
    prompt_master_md: '# PromptMaster\nOrders system.',
    spec: {
      raw_intent: 'Orders', product_summary: 'Orders', target_users: [], business_rules: [],
      entities: ['Order'], core_workflows: [], non_functional: {},
      suggested_stack: { language: 'TypeScript', runtime: 'Node', framework: 'Next.js', language_reason: '', framework_reason: '', architecture: 'clean', architecture_reason: '' },
      locale: 'pt-BR', assumptions: [], open_questions: [], confidence: 90,
    },
    architecture_blueprint: { version: 1, decisions: [] },
    active_blueprint_version: 1, messages: [], created_at: T0, updated_at: T0,
  };
}

function jobFixture(status = 'BACKEND_GENERATING') {
  return {
    id: JOB_ID, projectId: ROOM_ID, generatedProjectId: null, workspaceId: 'enterprise',
    status, currentStage: 'BACKEND_GENERATING', provider: 'anthropic', providerLabel: 'Claude',
    model: 'claude-sonnet-4', blueprintVersion: 1, startedAt: T0, finishedAt: null, progress: 40,
    error: null, retryCount: 0, artifacts: [], logs: [], checkpoints: [],
    stageStatuses: { contracts: 'success', database: 'success', backend: 'running', frontend: 'waiting', security: 'waiting', tests: 'waiting', docs: 'waiting', build: 'waiting', package: 'waiting' },
    projectName: 'Orders', partial: true, valid: false, packageReady: false, createdAt: T0, updatedAt: T0,
    events: [],
  };
}

function notification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'gnotif_1', user_id: 'notif-user', workspace_id: 'enterprise', project_id: ROOM_ID,
    job_id: JOB_ID, type: 'STAGE_COMPLETED', severity: 'SUCCESS', stage: 'contracts',
    read: false, action_url: `/meta-factory?projectId=${ROOM_ID}`, metadata: {}, created_at: T0,
    ...overrides,
  };
}

async function mockNotificationCenterShell(page: Page, opts: {
  readonly notifications?: unknown[];
  readonly unreadCount?: number;
  readonly eventsBody?: string;
  readonly onMarkAllRead?: () => void;
} = {}) {
  const auth = authFixture();
  const items = opts.notifications ?? [notification()];
  const unreadCount = opts.unreadCount ?? items.filter((item) => !(item as { read: boolean }).read).length;

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes(`/api/project-rooms/${ROOM_ID}`)) return route.fulfill({ json: roomFixture() });
    if (url.includes('/api/notifications/read-all') && method === 'POST') {
      opts.onMarkAllRead?.();
      return route.fulfill({ json: { updated: items.length } });
    }
    if (url.includes('/api/notifications') && method === 'GET') {
      return route.fulfill({ json: { items, has_more: false, next_cursor: null, unread_count: unreadCount } });
    }
    if (url.includes('/api/meta-factory/jobs/latest')) return route.fulfill({ json: jobFixture() });
    if (url.includes(`/api/meta-factory/jobs/${JOB_ID}/events`)) {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: opts.eventsBody ?? '' });
    }
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

test('the notification center renders real localized copy for a GenerationJob notification, never the old foundation fixtures', async ({ page }) => {
  await mockNotificationCenterShell(page, {
    notifications: [notification({ type: 'STAGE_COMPLETED', stage: 'contracts', severity: 'SUCCESS' })],
  });

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await page.getByRole('button', { name: 'Abrir central de notificações' }).click();

  await expect(page.getByRole('dialog', { name: 'Central de notificações' })).toBeVisible();
  await expect(page.getByText('Etapa concluída')).toBeVisible();
  await expect(page.getByText('A etapa "contracts" foi concluída com sucesso.')).toBeVisible();

  // Regression guard: the old hardcoded FOUNDATION_NOTIFICATIONS array must
  // never appear again now that this reads real backend data.
  await expect(page.getByText('Frontend foundation ready')).toHaveCount(0);
  await expect(page.getByText('Backend intentionally pending')).toHaveCount(0);
});

test('the bell badge shows the real unread count, and mark-all-read hits the real endpoint and clears it', async ({ page }) => {
  let markAllReadCalled = false;
  await mockNotificationCenterShell(page, {
    notifications: [
      notification({ id: 'gnotif_1', type: 'TASK_COMPLETED', stage: 'READY', severity: 'SUCCESS', read: false }),
      notification({ id: 'gnotif_2', type: 'STAGE_STARTED', stage: 'backend', severity: 'INFO', read: false }),
    ],
    unreadCount: 2,
    onMarkAllRead: () => { markAllReadCalled = true; },
  });

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await expect(page.getByRole('button', { name: 'Abrir central de notificações' }).getByText('2')).toBeVisible();

  await page.getByRole('button', { name: 'Abrir central de notificações' }).click();
  await page.getByRole('button', { name: 'Marcar como lidas' }).click();

  await expect.poll(() => markAllReadCalled).toBe(true);
  await expect(page.getByRole('button', { name: 'Abrir central de notificações' }).getByText('2')).toHaveCount(0);
});

test('a real notification SSE frame updates the badge and center without a page reload', async ({ page }) => {
  const pushed = notification({ id: 'gnotif_pushed', type: 'TASK_WAITING_USER', stage: 'backend', severity: 'ACTION_REQUIRED', read: false });
  await mockNotificationCenterShell(page, {
    notifications: [],
    unreadCount: 0,
    eventsBody: sseFrame({ type: 'notification', notification: pushed }, 'notif_evt_1'),
  });

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await expect(page.getByRole('heading', { name: /Orders/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir central de notificações' }).getByText('1')).toBeVisible();

  await page.getByRole('button', { name: 'Abrir central de notificações' }).click();
  await expect(page.getByText('Ação necessária')).toBeVisible();
  await expect(page.getByText('A geração parou na etapa "backend" e precisa da sua decisão para continuar.')).toBeVisible();
});

test('filter tabs narrow the visible list to the matching notifications', async ({ page }) => {
  await mockNotificationCenterShell(page, {
    notifications: [
      notification({ id: 'gnotif_done', type: 'TASK_COMPLETED', stage: 'READY', severity: 'SUCCESS', read: true }),
      notification({ id: 'gnotif_failed', type: 'TASK_FAILED', stage: 'backend', severity: 'ERROR', read: false }),
    ],
    unreadCount: 1,
  });

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await page.getByRole('button', { name: 'Abrir central de notificações' }).click();
  const dialog = page.getByRole('dialog', { name: 'Central de notificações' });
  await expect(dialog.getByText('Geração concluída')).toBeVisible();
  await expect(dialog.getByText('Geração falhou')).toBeVisible();

  await dialog.getByRole('button', { name: 'Falhas' }).click();
  await expect(dialog.getByText('Geração falhou')).toBeVisible();
  await expect(dialog.getByText('Geração concluída')).toHaveCount(0);
});

test('browser notifications never fire without explicit opt-in, even for a terminal, allowlisted type', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __notificationCalls: unknown[] }).__notificationCalls = calls;
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      constructor(title: string, options?: NotificationOptions) { calls.push({ title, options }); }
    }
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Notification = FakeNotification;
  });

  const pushed = notification({ id: 'gnotif_completed', type: 'TASK_COMPLETED', stage: 'READY', severity: 'SUCCESS', read: false });
  await mockNotificationCenterShell(page, {
    notifications: [],
    unreadCount: 0,
    eventsBody: sseFrame({ type: 'notification', notification: pushed }, 'notif_evt_completed'),
  });

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await expect(page.getByRole('heading', { name: /Orders/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir central de notificações' }).getByText('1')).toBeVisible();

  // browserNotificationsEnabled defaults to false -- no opt-in was ever performed.
  await page.waitForTimeout(500);
  const calls = await page.evaluate(() => (window as unknown as { __notificationCalls: unknown[] }).__notificationCalls);
  expect(calls).toHaveLength(0);
});

test('an opted-in, backgrounded tab shows a native browser notification for a terminal type but never for a per-stage event', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __notificationCalls: unknown[] }).__notificationCalls = calls;
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      constructor(title: string, options?: NotificationOptions) { calls.push({ title, options }); }
    }
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Notification = FakeNotification;
    // Pre-seed the interface preferences store's persisted opt-in so the
    // toggle in Settings never needs to be interacted with for this test.
    window.localStorage.setItem('ldcn-interface-preferences-v1', JSON.stringify({
      state: { browserNotificationsEnabled: true }, version: 0,
    }));
  });

  const stageEvent = notification({ id: 'gnotif_stage', type: 'STAGE_STARTED', stage: 'backend', severity: 'INFO', read: false });
  const completedEvent = notification({ id: 'gnotif_done', type: 'TASK_COMPLETED', stage: 'READY', severity: 'SUCCESS', read: false });
  await mockNotificationCenterShell(page, {
    notifications: [],
    unreadCount: 0,
    // Both frames delivered on the same connection, in order: proves the
    // allowlist filters STAGE_STARTED out while still letting the terminal
    // TASK_COMPLETED through, from the exact same live stream.
    eventsBody: [
      sseFrame({ type: 'notification', notification: stageEvent }, 'notif_evt_stage'),
      sseFrame({ type: 'notification', notification: completedEvent }, 'notif_evt_done'),
    ].join(''),
  });

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await expect(page.getByRole('heading', { name: /Orders/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir central de notificações' }).getByText('2')).toBeVisible();

  await page.waitForTimeout(500);
  const calls = await page.evaluate(() => (window as unknown as { __notificationCalls: { title: string; options?: { body?: string } }[] }).__notificationCalls);
  // Exactly one native notification -- STAGE_STARTED never reached it, only
  // the allowlisted terminal TASK_COMPLETED did.
  expect(calls).toHaveLength(1);
  expect(calls[0].title).toBe('Geração concluída');
  expect(calls[0].options?.body).toBe('Seu projeto foi gerado e validado com sucesso.');
});
