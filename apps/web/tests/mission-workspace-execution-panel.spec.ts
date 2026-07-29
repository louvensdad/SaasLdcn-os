import { expect, test } from '@playwright/test';
import { authenticateWizardSession } from './wizard-flow-helpers';

const API_BASE = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8001/api';
const T0 = '2026-07-24T12:00:00.000Z';

function sseFrame(payload: unknown, id?: string): string {
  return `${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(payload)}\n\n`;
}

async function mockLlmGate(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/llm/settings/active', (route) => route.fulfill({ json: {
    provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-4.1-mini', hasKey: true, status: 'ready',
    lastValidatedAt: new Date().toISOString(), lastUsedAt: null, mode: 'llm', requiresConfirmation: false,
    reason: 'Provider validado para o teste.', contextTokens: 128000,
  } }));
  await page.route('**/api/llm/settings/confirm', (route) => route.fulfill({ json: {
    provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-4.1-mini', mode: 'llm',
    reason: 'Confirmado no teste.', fallbackUsed: false, keyStatus: 'ready', requestedCapability: 'mission_report',
  } }));
}

async function createMission(request: import('@playwright/test').APIRequestContext, token: string, title: string): Promise<{ id: string }> {
  const created = await request.post(`${API_BASE}/missions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { mission_type: 'software.build', title, mode: 'guided' },
  });
  expect(created.ok()).toBe(true);
  return created.json();
}

test('real per-artifact provider/model/tokens appear in the activity panel once an artifact finishes', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'panel1');
  const mission = await createMission(request, auth.tokens.access_token, 'Activity panel repro');
  await mockLlmGate(page);

  const jobId = 'mdjob_panel1';
  const draftingJob = {
    id: jobId, mission_id: mission.id, workspace_id: null, status: 'DRAFTING', idempotency_key: 'idem-panel1',
    error: null, degraded: false, requested_model: null, retry_count: 0,
    artifacts_progress: [{ type: 'blueprint', title: 'Blueprint do Sistema', status: 'pending', provider: null, model: null, input_tokens: 0, output_tokens: 0, started_at: null, finished_at: null }],
    drafts: [], events: [], created_at: T0, updated_at: T0, completed_at: null, heartbeat_at: T0,
  };
  const readyJob = {
    ...draftingJob, status: 'DRAFTS_READY',
    artifacts_progress: [{ type: 'blueprint', title: 'Blueprint do Sistema', status: 'ready', provider: 'deepseek', model: 'deepseek-v4-flash', input_tokens: 120, output_tokens: 340, started_at: T0, finished_at: T0 }],
    drafts: [{ type: 'blueprint', title: 'Blueprint do Sistema', content: 'Conteúdo real gerado pelo provider.', format: 'markdown', can_feed_mission: [], degraded: false }],
  };

  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/latest`, (route) => route.fulfill({ json: null }));
  await page.route(`**/api/missions/${mission.id}/deliverables/compile`, (route) => route.fulfill({ status: 202, json: draftingJob }));
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/${jobId}/events`, (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream',
    body: [
      sseFrame({ type: 'mission_deliverable_job_event', event: { id: 'evt_1', job_id: jobId, timestamp: T0, stage: 'DRAFTING', type: 'artifact_drafting_started', level: 'info', message: 'Gerando "Blueprint do Sistema".', artifact_type: 'blueprint', metadata: {} } }, 'evt_1'),
      sseFrame({ type: 'mission_deliverable_job_event', event: { id: 'evt_2', job_id: jobId, timestamp: T0, stage: 'DRAFTS_READY', type: 'artifact_drafted', level: 'info', message: '"Blueprint do Sistema" gerado.', artifact_type: 'blueprint', metadata: { provider: 'deepseek', model: 'deepseek-v4-flash', input_tokens: 120, output_tokens: 340 } } }, 'evt_2'),
      sseFrame({ type: 'mission_deliverable_job', job: readyJob }),
    ].join(''),
  }));

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();
  await page.getByRole('button', { name: 'Gerar entregáveis' }).first().click();
  await page.getByRole('button', { name: /Continue with/ }).click();

  const review = page.getByRole('dialog', { name: 'Revisar entregáveis gerados' });
  await expect(review).toBeVisible();
  // "Último resultado" in the activity panel must reflect the REAL
  // provider/model/tokens the backend reported, not a placeholder.
  await expect(page.getByText(/deepseek · deepseek-v4-flash · 460 tokens/)).toBeVisible();
});

test('the timeline never shows progress without a corresponding real event (no fake progress)', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'panel2');
  const mission = await createMission(request, auth.tokens.access_token, 'No fake progress repro');
  await mockLlmGate(page);

  await page.clock.install({ time: new Date(T0) });

  const jobId = 'mdjob_panel2';
  const draftingJob = {
    id: jobId, mission_id: mission.id, workspace_id: null, status: 'DRAFTING', idempotency_key: 'idem-panel2',
    error: null, degraded: false, requested_model: 'deepseek-v4-flash', retry_count: 0,
    artifacts_progress: [
      { type: 'blueprint', title: 'Blueprint do Sistema', status: 'drafting', provider: null, model: null, input_tokens: 0, output_tokens: 0, started_at: T0, finished_at: null },
      { type: 'prompt_md', title: 'Prompt.md', status: 'pending', provider: null, model: null, input_tokens: 0, output_tokens: 0, started_at: null, finished_at: null },
    ],
    drafts: [], events: [
      { id: 'evt_1', job_id: jobId, timestamp: T0, stage: 'DRAFTING', type: 'artifact_drafting_started', level: 'info', message: 'Gerando "Blueprint do Sistema".', artifact_type: 'blueprint', metadata: {} },
    ],
    created_at: T0, updated_at: T0, completed_at: null, heartbeat_at: T0,
  };

  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/latest`, (route) => route.fulfill({ json: draftingJob }));
  // The job never changes again -- if the UI still shows a higher percent or
  // a different current stage after real time passes with zero new events,
  // that would be exactly the "fake progress" this feature must never do.
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/${jobId}/events`, (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: sseFrame({ type: 'heartbeat', jobId, status: 'DRAFTING' }),
  }));

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();

  const percentLocator = page.locator('span.text-2xl');
  await expect(percentLocator).toBeVisible();
  const initialPercent = await percentLocator.textContent();

  // Advance real page time by 5 minutes with no new SSE event.
  await page.clock.fastForward('05:00');
  await page.waitForTimeout(200);

  await expect(percentLocator).toHaveText(initialPercent ?? '');
  await expect(page.getByText('Gerando artefatos').first()).toBeVisible(); // still the same real stage
});

test('staleness messages fire from real elapsed time (15s / 45s), and "Verificar estado" consults the backend', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'panel3');
  const mission = await createMission(request, auth.tokens.access_token, 'Staleness repro');
  await mockLlmGate(page);

  await page.clock.install({ time: new Date(T0) });

  const jobId = 'mdjob_panel3';
  const draftingJob = {
    id: jobId, mission_id: mission.id, workspace_id: null, status: 'DRAFTING', idempotency_key: 'idem-panel3',
    error: null, degraded: false, requested_model: null, retry_count: 0,
    artifacts_progress: [{ type: 'blueprint', title: 'Blueprint do Sistema', status: 'drafting', provider: null, model: null, input_tokens: 0, output_tokens: 0, started_at: T0, finished_at: null }],
    drafts: [], events: [
      { id: 'evt_1', job_id: jobId, timestamp: T0, stage: 'DRAFTING', type: 'artifact_drafting_started', level: 'info', message: 'Gerando "Blueprint do Sistema".', artifact_type: 'blueprint', metadata: {} },
    ],
    created_at: T0, updated_at: T0, completed_at: null, heartbeat_at: T0,
  };

  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/latest`, (route) => route.fulfill({ json: draftingJob }));
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/${jobId}/events`, (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: sseFrame({ type: 'heartbeat', jobId, status: 'DRAFTING' }),
  }));
  let getJobCalls = 0;
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/${jobId}`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    getJobCalls += 1;
    return route.fulfill({ json: draftingJob });
  });

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();
  await expect(page.getByText('Preparando os entregáveis')).toBeVisible();

  await page.clock.fastForward('00:20');
  await page.waitForTimeout(200);
  await expect(page.getByText('Esta etapa está levando mais tempo que o normal.')).toBeVisible();

  await page.clock.fastForward('00:30');
  await page.waitForTimeout(200);
  await expect(page.getByText('Não recebemos uma atualização recente. Verificando o estado da execução.')).toBeVisible();

  await page.getByRole('button', { name: 'Verificar estado' }).click();
  await expect.poll(() => getJobCalls).toBeGreaterThan(0);
});

test('completed summary shows real artifact count and detects the real AI-complement marker', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'panel4');
  const mission = await createMission(request, auth.tokens.access_token, 'Completion summary repro');
  await mockLlmGate(page);

  const jobId = 'mdjob_panel4';
  const now = new Date().toISOString();
  const readyJob = {
    id: jobId, mission_id: mission.id, workspace_id: null, status: 'DRAFTS_READY', idempotency_key: 'idem-panel4',
    error: null, degraded: false, requested_model: 'deepseek-v4-flash', retry_count: 0,
    artifacts_progress: [
      { type: 'blueprint', title: 'Blueprint do Sistema', status: 'ready', provider: 'deepseek', model: 'deepseek-v4-flash', input_tokens: 100, output_tokens: 200, started_at: now, finished_at: now },
      { type: 'prompt_md', title: 'Prompt.md', status: 'ready', provider: 'deepseek', model: 'deepseek-v4-flash', input_tokens: 80, output_tokens: 150, started_at: now, finished_at: now },
    ],
    drafts: [
      { type: 'blueprint', title: 'Blueprint do Sistema', content: 'Conteúdo completo.\n\n## Complementado pela IA\nAssumimos autenticação JWT.', format: 'markdown', can_feed_mission: [], degraded: false },
      { type: 'prompt_md', title: 'Prompt.md', content: 'Prompt sem complementos.', format: 'markdown', can_feed_mission: [], degraded: false },
    ],
    events: [], created_at: now, updated_at: now, completed_at: null, heartbeat_at: now,
  };

  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/latest`, (route) => route.fulfill({ json: null }));
  await page.route(`**/api/missions/${mission.id}/deliverables/compile`, (route) => route.fulfill({ status: 202, json: readyJob }));
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/${jobId}/confirm`, async (route) => {
    const body = route.request().postDataJSON() as { artifacts: { title: string; content: string }[] };
    // `mission` was captured at creation time, before the real autosave PATCH
    // (fired when the wizard navigated to "Blueprint final") persisted
    // journey.current_step_id -- echoing that stale object back would revert
    // the app to step 1 and hide this whole panel. Fetch the real current
    // state and only override .artifacts.
    const freshResponse = await request.get(`${API_BASE}/missions/${mission.id}`, { headers: { Authorization: `Bearer ${auth.tokens.access_token}` } });
    const fresh = await freshResponse.json();
    await route.fulfill({ json: { ...fresh, artifacts: body.artifacts.map((a, i) => ({ id: `a${i}`, ...a, generated_at: now })) } });
  });

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();
  await page.getByRole('button', { name: 'Gerar entregáveis' }).first().click();
  await page.getByRole('button', { name: /Continue with/ }).click();

  const review = page.getByRole('dialog', { name: 'Revisar entregáveis gerados' });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Aceitar e salvar' }).click();
  await expect(review).toHaveCount(0);

  await expect(page.getByText('Entregáveis concluídos')).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: '2' })).toBeVisible(); // artefatos criados
  await expect(page.getByRole('definition').filter({ hasText: '1' })).toBeVisible(); // inferências técnicas aplicadas (only one draft has the marker)

  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('button', { name: 'Gerar entregáveis' }).first()).toBeVisible();
});

test('a failed job shows the last checkpoint and preserved artifact count, and lets the user copy the error', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'panel5');
  const mission = await createMission(request, auth.tokens.access_token, 'Checkpoint repro');
  await mockLlmGate(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  const jobId = 'mdjob_panel5';
  const now = new Date().toISOString();
  const failedJob = {
    id: jobId, mission_id: mission.id, workspace_id: null, status: 'FAILED', idempotency_key: 'idem-panel5',
    error: { kind: 'llm_error', message: 'Provider indisponível no teste.', artifact_type: 'prompt_md' }, degraded: false,
    requested_model: 'deepseek-v4-flash', retry_count: 0,
    artifacts_progress: [
      { type: 'blueprint', title: 'Blueprint do Sistema', status: 'ready', provider: 'deepseek', model: 'deepseek-v4-flash', input_tokens: 100, output_tokens: 200, started_at: now, finished_at: now },
      { type: 'prompt_md', title: 'Prompt.md', status: 'failed', provider: null, model: null, input_tokens: 0, output_tokens: 0, started_at: now, finished_at: now },
    ],
    drafts: [{ type: 'blueprint', title: 'Blueprint do Sistema', content: 'Conteúdo salvo antes da falha.', format: 'markdown', can_feed_mission: [], degraded: false }],
    events: [], created_at: now, updated_at: now, completed_at: now, heartbeat_at: now,
  };

  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/latest`, (route) => route.fulfill({ json: null }));
  await page.route(`**/api/missions/${mission.id}/deliverables/compile`, (route) => route.fulfill({ status: 202, json: failedJob }));

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();
  await page.getByRole('button', { name: 'Gerar entregáveis' }).first().click();
  await page.getByRole('button', { name: /Continue with/ }).click();

  await expect(page.getByText('Falha ao gerar entregáveis')).toBeVisible();
  await expect(page.getByText('Último artefato salvo: "Blueprint do Sistema"')).toBeVisible();
  await expect(page.getByText('Artefatos preservados')).toBeVisible();

  await page.getByRole('button', { name: 'Copiar erro' }).click();
  await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();
});
