import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';
const ROOM_ID = 'room-delivery-center';
const GENERATED_PROJECT_ID = 'orders-delivery-app';

// Same mocked-job-done fixture shape as meta-factory-live-console.spec.ts's
// "offers GitHub, GitLab export and a ZIP download" test -- reused here to
// reach the same "job is done" screen and verify the new Delivery Decision
// Center panel that now sits above the existing download/export actions.

function authFixture() {
  const now = '2026-07-14T00:00:00Z';
  return {
    user: {
      user_id: 'delivery-user', email: 'delivery@example.com', full_name: 'Delivery User',
      role: 'admin', locale: 'pt-BR', is_active: true, consent_accepted_at: now,
      consent_policy_version: '1.0.0', created_at: now, updated_at: now,
    },
    tokens: { access_token: 'delivery-token', token_type: 'bearer', expires_in: 3600 },
  };
}

function roomFixture() {
  const now = '2026-07-14T00:00:00Z';
  return {
    room_id: ROOM_ID,
    workspace_id: 'enterprise',
    owner_user_id: 'delivery-user',
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

function jobFixture() {
  const now = '2026-07-14T00:00:00Z';
  return {
    id: 'genjob-delivery', projectId: ROOM_ID, generatedProjectId: GENERATED_PROJECT_ID, workspaceId: 'enterprise',
    status: 'READY', currentStage: 'READY', provider: 'anthropic', providerLabel: 'Claude',
    model: 'claude-sonnet-4', blueprintVersion: 1, startedAt: now, finishedAt: now, progress: 100,
    error: null, retryCount: 0, artifacts: [], logs: [], checkpoints: [],
    stageStatuses: { contracts: 'success', database: 'success', backend: 'success', frontend: 'success', security: 'success', tests: 'success', docs: 'success', build: 'success', package: 'success' },
    projectName: 'Orders', partial: false, valid: true, packageReady: true, createdAt: now, updatedAt: now,
    events: [],
  };
}

function deliveryFixture(currentMode: string | null) {
  return {
    project_id: GENERATED_PROJECT_ID,
    kernel_phase: 'CERTIFIED',
    blocked: false,
    block_reason: '',
    options: [
      { mode: 'zip_only', label: 'Baixar projeto ZIP', recommended: true, reason: 'Caminho mais simples, sem nenhuma conexao a configurar.' },
      { mode: 'git_export', label: 'Criar/enviar para um repositorio Git', recommended: false, reason: '' },
      { mode: 'zip_and_git', label: 'ZIP e repositorio Git', recommended: false, reason: '' },
      { mode: 'ldcn_only', label: 'Continuar apenas no ambiente LDCN', recommended: false, reason: '' },
    ],
    current_profile: currentMode
      ? { project_id: GENERATED_PROJECT_ID, delivery_mode: currentMode, chosen_by: 'delivery-user', chosen_at: '2026-07-14T00:00:00Z' }
      : null,
  };
}

async function mockDelivery(page: Page) {
  const auth = authFixture();
  let recordedMode: string | null = null;
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes(`/api/project-rooms/${ROOM_ID}`)) return route.fulfill({ json: roomFixture() });
    if (url.includes('/api/meta-factory/jobs/latest')) return route.fulfill({ json: jobFixture() });
    if (url.includes(`/api/meta-factory/${GENERATED_PROJECT_ID}/delivery`)) {
      if (method === 'POST') {
        recordedMode = JSON.parse(route.request().postData() ?? '{}').delivery_mode ?? null;
      }
      return route.fulfill({ json: deliveryFixture(recordedMode) });
    }
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

test('Delivery Decision Center renders the real options above the existing export actions', async ({ page }) => {
  await mockDelivery(page);
  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);

  await expect(page.getByText('Projeto aprovado')).toBeVisible();
  await expect(page.getByText('Como deseja entregar seu projeto?')).toBeVisible();
  await expect(page.getByText('Baixar projeto ZIP')).toBeVisible();
  await expect(page.getByText('Criar/enviar para um repositório Git')).toBeVisible();
  await expect(page.getByText('ZIP e repositório Git')).toBeVisible();
  await expect(page.getByText('Continuar apenas no ambiente LDCN')).toBeVisible();
  await expect(page.getByText('Recomendado')).toBeVisible();

  // Existing actions stay reachable regardless -- additive, not a replacement.
  await expect(page.getByRole('button', { name: 'Baixar projeto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'GitHub' })).toBeVisible();
});

test('Confirming a delivery choice persists and shows the confirmation message', async ({ page }) => {
  await mockDelivery(page);
  await page.goto(`${WEB_BASE}/meta-factory?projectId=${ROOM_ID}`);

  await page.getByText('Continuar apenas no ambiente LDCN').click();
  await page.getByRole('button', { name: 'Confirmar escolha' }).click();

  await expect(page.getByText(/continua dispon.vel aqui/)).toBeVisible();
});
