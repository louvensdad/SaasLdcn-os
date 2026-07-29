import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';
const ROOM_ID = 'room-staleness';
const JOB_ID = 'genjob-staleness';
const T0 = '2026-07-24T12:00:00.000Z';

function sseFrame(payload: unknown, id?: string): string {
  return `${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(payload)}\n\n`;
}

function authFixture() {
  return {
    user: {
      user_id: 'stale-user', email: 'stale@example.com', full_name: 'Stale User',
      role: 'admin', locale: 'pt-BR', is_active: true, consent_accepted_at: T0,
      consent_policy_version: '1.0.0', created_at: T0, updated_at: T0,
    },
    tokens: { access_token: 'stale-token', token_type: 'bearer', expires_in: 3600 },
  };
}

function roomFixture() {
  return {
    room_id: ROOM_ID, workspace_id: 'enterprise', owner_user_id: 'stale-user',
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

// A genuinely non-terminal status (not in TERMINAL_JOB_STATUSES) so the
// component actually opens the SSE stream and runs the staleness ladder.
function jobFixture() {
  return {
    id: JOB_ID, projectId: ROOM_ID, generatedProjectId: null, workspaceId: 'enterprise',
    status: 'BACKEND_GENERATING', currentStage: 'BACKEND_GENERATING', provider: 'anthropic', providerLabel: 'Claude',
    model: 'claude-sonnet-4', blueprintVersion: 1, startedAt: T0, finishedAt: null, progress: 40,
    error: null, retryCount: 0, artifacts: [], logs: [], checkpoints: [],
    stageStatuses: { contracts: 'success', database: 'success', backend: 'running', frontend: 'waiting', security: 'waiting', tests: 'waiting', docs: 'waiting', build: 'waiting', package: 'waiting' },
    projectName: 'Orders', partial: true, valid: false, packageReady: false, createdAt: T0, updatedAt: T0,
    events: [],
  };
}

async function mockShell(page: Page, eventsBody: (route: import('@playwright/test').Route) => Promise<void> | void, latestJobCalls: { count: number }) {
  const auth = authFixture();
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes(`/api/project-rooms/${ROOM_ID}`)) return route.fulfill({ json: roomFixture() });
    if (url.includes('/api/notifications')) return route.fulfill({ json: { items: [], has_more: false, next_cursor: null, unread_count: 0 } });
    if (url.includes('/api/meta-factory/jobs/latest')) {
      latestJobCalls.count += 1;
      return route.fulfill({ json: jobFixture() });
    }
    if (url.includes(`/api/meta-factory/jobs/${JOB_ID}/events`)) return eventsBody(route);
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

test('the staleness ladder shows a soft note at 15s idle and auto-consults the backend at 45s -- never a bare manual button first', async ({ page }) => {
  await page.clock.install({ time: new Date(T0) });
  const latestJobCalls = { count: 0 };
  // No frames at all -- the SSE stream reconnects (every ~500ms of virtual
  // time) but delivers nothing, so idle time grows purely from real elapsed
  // time, uncontaminated by a replayed heartbeat resetting the clock on
  // every reconnect (that scenario is covered separately).
  await mockShell(page, (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: '',
  }), latestJobCalls);

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await expect(page.getByRole('heading', { name: /Orders/ })).toBeVisible();

  // 0-15s idle: nothing shown.
  await page.clock.fastForward('00:10');
  await page.waitForTimeout(200);
  await expect(page.getByText('Aguardando nova atualização do backend.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verificar novamente' })).toHaveCount(0);

  // 15-45s idle: a soft, non-alarming note -- no button, no takeover.
  await page.clock.fastForward('00:10');
  await page.waitForTimeout(200);
  await expect(page.getByText('Aguardando nova atualização do backend.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verificar novamente' })).toHaveCount(0);
  const callsBeforeAutoConsult = latestJobCalls.count;

  // >45s idle: automatically consults the real backend state before showing
  // anything actionable -- proves this never becomes a bare unexplained
  // "continue manually" button with no prior real check.
  await page.clock.fastForward('00:30');
  await page.waitForTimeout(300);
  await expect.poll(() => latestJobCalls.count).toBeGreaterThan(callsBeforeAutoConsult);
  await expect(page.getByText('A tarefa continua em execução', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verificar novamente' })).toBeVisible();
});

test('a real stream_timeout frame triggers an automatic backend consult, without waiting for the 45s ladder', async ({ page }) => {
  const latestJobCalls = { count: 0 };
  await mockShell(page, (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream',
    body: sseFrame({ type: 'stream_timeout', jobId: JOB_ID, message: 'stream idle timeout' }, 'evt_timeout'),
  }), latestJobCalls);

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await expect(page.getByRole('heading', { name: /Orders/ })).toBeVisible();
  // Baseline AFTER initial mount settles (dev-mode StrictMode double-invokes
  // the first effect, so the true baseline may already be 2, not 1) -- the
  // real assertion is that the stream_timeout signal causes a FURTHER call
  // beyond whatever that baseline is.
  await page.waitForTimeout(300);
  const baseline = latestJobCalls.count;

  await expect.poll(() => latestJobCalls.count).toBeGreaterThan(baseline);
  await expect(page.getByText('A tarefa continua em execução', { exact: true })).toBeVisible();
});

test('auto-consult that finds no job shows the not-found banner, not a confusing still-running one', async ({ page }) => {
  const auth = authFixture();
  let sawFirstLookup = false;
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes(`/api/project-rooms/${ROOM_ID}`)) return route.fulfill({ json: roomFixture() });
    if (url.includes('/api/notifications')) return route.fulfill({ json: { items: [], has_more: false, next_cursor: null, unread_count: 0 } });
    if (url.includes('/api/meta-factory/jobs/latest')) {
      // Every lookup up to and including the page's initial settle returns
      // the running job; only once we deliberately flip this flag (after the
      // page has loaded) does a "latest" lookup report the job as gone --
      // simulating a job that disappeared between the initial load and the
      // stream_timeout-triggered consult.
      return route.fulfill({ json: sawFirstLookup ? null : jobFixture() });
    }
    if (url.includes(`/api/meta-factory/jobs/${JOB_ID}/events`)) {
      return route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: sseFrame({ type: 'stream_timeout', jobId: JOB_ID, message: 'stream idle timeout' }, 'evt_timeout'),
      });
    }
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await expect(page.getByRole('heading', { name: /Orders/ })).toBeVisible();
  sawFirstLookup = true; // now the job "disappears" for every subsequent lookup

  // The not-found banner -- never the still-running one which would mislead.
  await expect(page.getByText('Estado da tarefa indisponível')).toBeVisible();
  // The recheck button is still offered so the user can try again.
  await expect(page.getByRole('button', { name: 'Verificar novamente' })).toBeVisible();
  // The still-running title must NOT appear alongside the not-found one.
  await expect(page.getByText('A tarefa continua em execução', { exact: true })).toHaveCount(0);
});

test('a terminal job (READY) never triggers the staleness ladder even after long idle', async ({ page }) => {
  await page.clock.install({ time: new Date(T0) });
  const auth = authFixture();
  const terminalJob = { ...jobFixture(), status: 'READY', currentStage: 'READY', progress: 100, valid: true, packageReady: true, partial: false };
  let latestJobCalls = 0;

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes(`/api/project-rooms/${ROOM_ID}`)) return route.fulfill({ json: roomFixture() });
    if (url.includes('/api/notifications')) return route.fulfill({ json: { items: [], has_more: false, next_cursor: null, unread_count: 0 } });
    if (url.includes('/api/meta-factory/jobs/latest')) {
      latestJobCalls += 1;
      return route.fulfill({ json: terminalJob });
    }
    // SSE should never be opened for a terminal job
    if (url.includes(`/api/meta-factory/jobs/${JOB_ID}/events`)) return route.fulfill({ status: 404, json: { detail: 'job is terminal' } });
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  // READY job shows the "done" headline
  await expect(page.getByText('Concluído')).toBeVisible();

  // Baseline AFTER initial mount settles -- dev-mode StrictMode may
  // double-invoke the first effect, so the real assertion is "no MORE calls
  // after the idle period", not an assumed absolute count.
  await page.waitForTimeout(300);
  const baseline = latestJobCalls;

  // Well past every ladder threshold -- no soft note, no banner, no extra consult
  await page.clock.fastForward('01:30');
  await page.waitForTimeout(400);

  await expect(page.getByText('Aguardando nova atualização do backend.')).toHaveCount(0);
  await expect(page.getByText('A tarefa continua em execução', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Estado da tarefa indisponível')).toHaveCount(0);
  // No extra auto-consult fired for a terminal job, no matter how long it idles.
  expect(latestJobCalls).toBe(baseline);
});

test('the recheck button on a still-running banner triggers a new backend consult immediately', async ({ page }) => {
  const latestJobCalls = { count: 0 };
  await mockShell(page, (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream',
    body: sseFrame({ type: 'stream_timeout', jobId: JOB_ID, message: 'backend stream timeout' }, 'evt_to'),
  }), latestJobCalls);

  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);
  await expect(page.getByRole('heading', { name: /Orders/ })).toBeVisible();

  // stream_timeout auto-consult fires immediately and shows still-running banner
  await expect(page.getByText('A tarefa continua em execução', { exact: true })).toBeVisible();

  await page.waitForTimeout(200);
  const callsBeforeClick = latestJobCalls.count;
  await page.getByRole('button', { name: 'Verificar novamente' }).click();
  await expect.poll(() => latestJobCalls.count).toBeGreaterThan(callsBeforeClick);
});
