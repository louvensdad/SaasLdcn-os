import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';
const ROOM_ID = 'room-live-console';

function authFixture() {
  const now = '2026-06-26T00:00:00Z';
  return {
    user: {
      user_id: 'console-user', email: 'console@example.com', full_name: 'Console User',
      role: 'admin', locale: 'pt-BR', is_active: true, consent_accepted_at: now,
      consent_policy_version: '1.0.0', created_at: now, updated_at: now,
    },
    tokens: { access_token: 'console-token', token_type: 'bearer', expires_in: 3600 },
  };
}

function roomFixture() {
  const now = '2026-06-26T00:00:00Z';
  return {
    room_id: ROOM_ID,
    workspace_id: 'enterprise',
    owner_user_id: 'console-user',
    title: 'Orders',
    status: 'WAITING_META_FACTORY',
    locale: 'pt-BR',
    prompt_master_md: '# PromptMaster\nOrders system.',
    spec: {
      raw_intent: 'Orders', product_summary: 'Orders', target_users: [], business_rules: [],
      entities: ['Order'], core_workflows: [], non_functional: {},
      suggested_stack: { language: 'TypeScript', runtime: 'Node', framework: 'Next.js', language_reason: '', framework_reason: '', architecture: 'clean', architecture_reason: '' },
      locale: 'pt-BR', assumptions: [], open_questions: [], confidence: 90,
    },
    architecture_blueprint: { version: 1, decisions: [] },
    active_blueprint_version: 1,
    messages: [],
    created_at: now,
    updated_at: now,
  };
}

// Terminal status (READY) so the component renders from the seeded events without
// opening an SSE connection.
function jobFixture() {
  const now = '2026-06-26T00:00:00Z';
  const ev = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
    id, jobId: 'genjob-live', timestamp: now, stage: 'BUILD_RUNNING', type,
    level: 'info', message: '', command: null, cwd: null, durationMs: null,
    stream: null, stdout: null, stderr: null, artifactPath: null, exitCode: null, ...extra,
  });
  return {
    id: 'genjob-live', projectId: ROOM_ID, generatedProjectId: 'orders-app', workspaceId: 'enterprise',
    status: 'READY', currentStage: 'READY', provider: 'anthropic', providerLabel: 'Claude',
    model: 'claude-sonnet-4', blueprintVersion: 1, startedAt: now, finishedAt: now, progress: 100,
    error: null, retryCount: 0, artifacts: [], logs: [], checkpoints: [],
    stageStatuses: { contracts: 'success', database: 'success', backend: 'success', frontend: 'success', security: 'success', tests: 'success', docs: 'success', build: 'success', package: 'success' },
    projectName: 'Orders', partial: false, valid: true, packageReady: true, createdAt: now, updatedAt: now,
    events: [
      ev('e1', 'stage_started', { message: 'Etapa iniciada: build.' }),
      ev('e2', 'command_started', { command: 'npm install', cwd: '/work/orders-app', message: '$ npm install' }),
      ev('e3', 'command_output', { stream: 'stdout', message: 'added 120 packages in 4s' }),
      ev('e4', 'command_finished', { command: 'npm install', durationMs: 4200, exitCode: 0, message: 'Comando finalizado (exit 0) em 4200 ms.' }),
      ev('e5', 'stage_finished', { message: 'Checkpoint salvo: BUILD_RUNNING.' }),
    ],
  };
}

async function mockConsole(page: Page) {
  const auth = authFixture();
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes(`/api/project-rooms/${ROOM_ID}`)) return route.fulfill({ json: roomFixture() });
    if (url.includes('/api/meta-factory/jobs/latest')) return route.fulfill({ json: jobFixture() });
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

test('Meta-Factory renders a live execution console with streamed command output', async ({ page }) => {
  await mockConsole(page);
  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);

  await expect(page.getByText('Console de execução')).toBeVisible();
  // The exact command, its cwd, streamed stdout, exit code and a stage separator.
  await expect(page.getByText('npm install').first()).toBeVisible();
  await expect(page.getByText('/work/orders-app')).toBeVisible();
  await expect(page.getByText('added 120 packages in 4s')).toBeVisible();
  await expect(page.getByText('exit 0')).toBeVisible();
  await expect(page.getByText('Etapa iniciada: build.')).toBeVisible();
});
