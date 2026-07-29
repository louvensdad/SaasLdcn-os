import { expect, test } from '@playwright/test';
import { authenticateWizardSession } from './wizard-flow-helpers';

const API_BASE = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8001/api';

async function mockLlmGate(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/llm/settings/active', (route) => route.fulfill({ json: {
    provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-4.1-mini', hasKey: true, status: 'ready',
    lastValidatedAt: new Date().toISOString(), lastUsedAt: null, mode: 'llm', requiresConfirmation: false,
    reason: 'Provider validado para o teste.', contextTokens: 128000,
  } }));
}

async function createMission(
  request: import('@playwright/test').APIRequestContext, token: string, title: string, missionType = 'software.build',
): Promise<{ id: string }> {
  const created = await request.post(`${API_BASE}/missions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { mission_type: missionType, title, mode: 'guided' },
  });
  expect(created.ok()).toBe(true);
  return created.json();
}

function completedJob(mission: { id: string }) {
  const now = new Date().toISOString();
  return {
    id: 'mdjob_completed', mission_id: mission.id, workspace_id: null, status: 'COMPLETED', idempotency_key: 'idem-completed',
    error: null, degraded: false,
    artifacts_progress: [{ type: 'blueprint', title: 'Blueprint do Sistema', status: 'ready' }],
    drafts: [{ type: 'blueprint', title: 'Blueprint do Sistema', content: 'Conteúdo do blueprint.', format: 'markdown', can_feed_mission: [], degraded: false }],
    events: [], created_at: now, updated_at: now, completed_at: now, heartbeat_at: now,
  };
}

async function gotoCompletionScreen(page: import('@playwright/test').Page, mission: { id: string }, buttonName: RegExp | string): Promise<void> {
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/latest`, (route) => route.fulfill({ json: completedJob(mission) }));
  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: buttonName }).click();
}

test('non-buildable mission type never shows Preparar projeto', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'handoff1');
  const mission = await createMission(request, auth.tokens.access_token, 'Doc repro', 'documentation.create');
  await mockLlmGate(page);
  await gotoCompletionScreen(page, mission, 'Publicação e manutenção');

  await expect(page.getByText('Entregáveis concluídos')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preparar projeto' })).toHaveCount(0);
});

test('software.build mission shows Preparar projeto and navigates to Engineering Review', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'handoff2');
  const mission = await createMission(request, auth.tokens.access_token, 'Prepare repro');
  await mockLlmGate(page);

  let prepareCalls = 0;
  await page.route(`**/api/missions/${mission.id}/execution-handoff`, (route) => route.fulfill({ status: 404, json: { detail: 'Nenhuma preparação de projeto encontrada para esta missão.' } }));
  await page.route(`**/api/missions/${mission.id}/prepare-project`, (route) => {
    prepareCalls += 1;
    return route.fulfill({ json: {
      handoff_id: 'handoff_1', mission_id: mission.id, project_room_id: 'room_abc', room_status: 'BLUEPRINT_READY',
      engineering_approved: false, stack_approved: false, generation_job_id: null,
      next_route: '/engineering-review?projectId=room_abc',
    } });
  });
  // The real Engineering Review page has its own heavy data requirements --
  // stub just enough that navigating there doesn't crash the test.
  await page.route('**/api/project-rooms/room_abc', (route) => route.fulfill({ json: {
    room_id: 'room_abc', title: 'Prepare repro', status: 'BLUEPRINT_READY', delivery_type: 'web', raw_intent: '', locale: 'pt-BR',
    confidence: 1, degraded: false, spec: null, open_questions: [], messages: [], prompt_master_md: null, prompt_master_versions: [],
    architecture_blueprint: null, blueprint_versions: [], generation_handoff: null, readiness_checklist: [], workflow: null, history: [], operational_log: [],
  } }));

  await gotoCompletionScreen(page, mission, /Blueprint final/);

  const prepareButton = page.getByRole('button', { name: 'Preparar projeto' });
  await expect(prepareButton).toBeVisible();
  await prepareButton.click();

  await page.waitForURL(/\/engineering-review\?projectId=room_abc/);
  expect(prepareCalls).toBe(1);
});

test('a handoff awaiting Engineering Review shows the real status, not "Iniciar geração"', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'handoff3');
  const mission = await createMission(request, auth.tokens.access_token, 'Pending review repro');
  await mockLlmGate(page);

  await page.route(`**/api/missions/${mission.id}/execution-handoff`, (route) => route.fulfill({ json: {
    handoff_id: 'handoff_2', mission_id: mission.id, project_room_id: 'room_pending', room_status: 'BLUEPRINT_READY',
    engineering_approved: false, stack_approved: false, generation_job_id: null,
    next_route: '/engineering-review?projectId=room_pending',
  } }));

  await gotoCompletionScreen(page, mission, /Blueprint final/);

  await expect(page.getByText(/aprove o Engineering Review e a Stack Approval Gate/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar Engineering Review' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar geração do projeto' })).toHaveCount(0);
});

test('an approved handoff shows Iniciar geração, confirms, and navigates to the live console', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'handoff4');
  const mission = await createMission(request, auth.tokens.access_token, 'Start generation repro');
  await mockLlmGate(page);

  await page.route(`**/api/missions/${mission.id}/execution-handoff`, (route) => route.fulfill({ json: {
    handoff_id: 'handoff_3', mission_id: mission.id, project_room_id: 'room_approved', room_status: 'ENGINEERING_APPROVED',
    engineering_approved: true, stack_approved: true, generation_job_id: null,
    next_route: '/engineering-review?projectId=room_approved',
  } }));
  await page.route('**/api/project-rooms/room_approved', (route) => route.fulfill({ json: {
    room_id: 'room_approved', title: 'Start generation repro', status: 'ENGINEERING_APPROVED', delivery_type: 'web', raw_intent: '', locale: 'pt-BR',
    confidence: 1, degraded: false,
    spec: { raw_intent: 'x', product_summary: '', target_users: [], business_rules: [], entities: [], core_workflows: [], non_functional: {}, suggested_stack: { language: 'Python', framework: 'FastAPI' }, delivery_type: 'web', locale: 'pt-BR', assumptions: [], open_questions: [], confidence: 1 },
    open_questions: [], messages: [], prompt_master_md: null, prompt_master_versions: [],
    architecture_blueprint: null, blueprint_versions: [], generation_handoff: null, readiness_checklist: [], workflow: null, history: [], operational_log: [],
  } }));
  let startCalls = 0;
  await page.route(`**/api/missions/${mission.id}/start-generation`, (route) => {
    startCalls += 1;
    return route.fulfill({ json: { job_id: 'genjob_xyz', project_id: 'room_approved', mission_id: mission.id, status: 'QUEUED', next_route: '/meta-factory?projectId=room_approved' } });
  });
  // The real Meta-Factory live console fetches the job -- stub enough to land there without crashing.
  await page.route('**/api/meta-factory/jobs/latest*', (route) => route.fulfill({ json: null }));

  await gotoCompletionScreen(page, mission, /Blueprint final/);

  const startButton = page.getByRole('button', { name: 'Iniciar geração do projeto' });
  await expect(startButton).toBeVisible();
  await startButton.click();

  const dialog = page.getByRole('dialog', { name: 'Iniciar construção do projeto?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Python')).toBeVisible();
  await expect(dialog.getByText('FastAPI')).toBeVisible();

  await dialog.getByRole('button', { name: 'Iniciar construção' }).click();
  await page.waitForURL(/\/meta-factory\?projectId=room_approved/);
  expect(startCalls).toBe(1);
});

test('clicking Preparar projeto disables it immediately and fires exactly one request', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'handoff5');
  const mission = await createMission(request, auth.tokens.access_token, 'Double click repro');
  await mockLlmGate(page);

  await page.route(`**/api/missions/${mission.id}/execution-handoff`, (route) => route.fulfill({ status: 404, json: { detail: 'not found' } }));
  let prepareCalls = 0;
  // Never resolves within the test's lifetime -- proves the button disables
  // synchronously (before any await), the same technique the existing
  // "instant feedback" deliverable-job test uses, rather than racing two
  // real clicks against React's own render timing.
  await page.route(`**/api/missions/${mission.id}/prepare-project`, async () => { prepareCalls += 1; });

  await gotoCompletionScreen(page, mission, /Blueprint final/);

  const prepareButton = page.getByRole('button', { name: 'Preparar projeto' });
  await prepareButton.click();

  await expect(page.getByText('Preparando o projeto…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preparar projeto' })).toHaveCount(0);
  expect(prepareCalls).toBe(1);
});

test('an error from prepare-project is shown, not swallowed', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'handoff6');
  const mission = await createMission(request, auth.tokens.access_token, 'Error repro');
  await mockLlmGate(page);

  await page.route(`**/api/missions/${mission.id}/execution-handoff`, (route) => route.fulfill({ status: 404, json: { detail: 'not found' } }));
  await page.route(`**/api/missions/${mission.id}/prepare-project`, (route) => route.fulfill({
    status: 409, json: { detail: 'Confirme todos os entregáveis da missão antes de preparar o projeto.' },
  }));

  await gotoCompletionScreen(page, mission, /Blueprint final/);
  await page.getByRole('button', { name: 'Preparar projeto' }).click();

  await expect(page.getByText('Confirme todos os entregáveis da missão antes de preparar o projeto.')).toBeVisible();
  // Never silently reverts to a bare "Fechar"-only screen.
  await expect(page.getByRole('button', { name: 'Preparar projeto' })).toBeVisible();
});
