import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';
const ROOM_ID = 'room-mobile-pipeline';

function authFixture() {
  const now = '2026-07-02T00:00:00Z';
  return {
    user: {
      user_id: 'pipeline-user', email: 'pipeline@example.com', full_name: 'Pipeline User',
      role: 'admin', locale: 'pt-BR', is_active: true, consent_accepted_at: now,
      consent_policy_version: '1.0.0', created_at: now, updated_at: now,
    },
    tokens: { access_token: 'pipeline-token', token_type: 'bearer', expires_in: 3600 },
  };
}

function roomFixture(deliveryType: string) {
  const now = '2026-07-02T00:00:00Z';
  return {
    room_id: ROOM_ID, workspace_id: 'enterprise', owner_user_id: 'pipeline-user',
    title: 'Orders', status: 'WAITING_META_FACTORY', delivery_type: deliveryType, locale: 'pt-BR',
    prompt_master_md: '# PromptMaster\nOrders system.',
    spec: {
      raw_intent: 'Orders', product_summary: 'Orders', target_users: [], business_rules: [],
      entities: ['Order'], core_workflows: [], non_functional: {},
      suggested_stack: { language: 'TypeScript', runtime: 'Node', framework: 'Next.js', language_reason: '', framework_reason: '', architecture: 'clean', architecture_reason: '' },
      delivery_type: deliveryType, locale: 'pt-BR', assumptions: [], open_questions: [], confidence: 90,
    },
    architecture_blueprint: { version: 1, decisions: [] },
    active_blueprint_version: 1,
    messages: [],
    created_at: now, updated_at: now,
  };
}

function jobFixture(includeMobile: boolean) {
  const now = '2026-07-02T00:00:00Z';
  const stageStatuses: Record<string, string> = {
    contracts: 'success', database: 'success', backend: 'success', frontend: 'success',
    security: 'waiting', tests: 'waiting', docs: 'waiting', build: 'waiting', package: 'waiting',
  };
  if (includeMobile) stageStatuses.mobile = 'running';
  return {
    id: 'genjob-mobile', projectId: ROOM_ID, generatedProjectId: null, workspaceId: 'enterprise',
    status: includeMobile ? 'MOBILE_GENERATING' : 'FRONTEND_VALIDATING', currentStage: includeMobile ? 'MOBILE_GENERATING' : 'FRONTEND_VALIDATING',
    provider: 'anthropic', providerLabel: 'Claude', model: 'claude-sonnet-4', blueprintVersion: 1,
    startedAt: now, finishedAt: null, progress: 45, error: null, retryCount: 0,
    artifacts: [], logs: [], checkpoints: [], stageStatuses,
    projectName: 'Orders', partial: true, valid: false, packageReady: false,
    createdAt: now, updatedAt: now, events: [],
  };
}

async function mockPipeline(page: Page, deliveryType: string, includeMobile: boolean) {
  const auth = authFixture();
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes(`/api/project-rooms/${ROOM_ID}`)) return route.fulfill({ json: roomFixture(deliveryType) });
    if (url.includes('/api/meta-factory/jobs/latest')) return route.fulfill({ json: jobFixture(includeMobile) });
    // The app shell's CommandPalette (mounted on every page) queries these
    // registry lists; they must resolve to arrays or its useMemo throws.
    if (url.includes('/api/registry/')) return route.fulfill({ status: 200, json: [] });
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

test('a mobile-inclusive job renders a Mobile stage card in the pipeline visualizer', async ({ page }) => {
  await mockPipeline(page, 'mobile', true);
  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);

  // The stage grid is an <ol>; the log-stage <select> below it also lists every
  // stage name as an <option>, so scope to the <ol> to avoid a strict-mode
  // ambiguity between the two.
  const stageGrid = page.locator('ol').filter({ hasText: 'Contratos' });
  await expect(stageGrid.getByText('Mobile', { exact: true })).toBeVisible();
  await expect(stageGrid.getByText('Frontend', { exact: true })).toBeVisible();
  await expect(stageGrid.locator(':scope > li')).toHaveCount(10);
  await expect(stageGrid).toHaveCSS('--stage-count', '10');
});

test('a web-only job never renders a Mobile stage card', async ({ page }) => {
  await mockPipeline(page, 'web', false);
  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);

  const stageGrid = page.locator('ol').filter({ hasText: 'Contratos' });
  await expect(stageGrid.getByText('Frontend', { exact: true })).toBeVisible();
  await expect(stageGrid.getByText('Mobile', { exact: true })).toHaveCount(0);
});
