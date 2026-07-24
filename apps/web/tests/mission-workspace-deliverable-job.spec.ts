import { expect, test } from '@playwright/test';
import { authenticateWizardSession } from './wizard-flow-helpers';

const API_BASE = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8001/api';

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

test('both "Gerar entregáveis" buttons call the identical action and give instant feedback', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'delivjob1');
  const mission = await createMission(request, auth.tokens.access_token, 'Instant feedback repro');
  await mockLlmGate(page);

  const now = new Date().toISOString();
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/latest`, (route) => route.fulfill({ json: null }));
  let compileCalls = 0;
  // Never resolves within the test's lifetime -- proves the UI change is
  // synchronous (before any await), not gated on this response landing.
  await page.route(`**/api/missions/${mission.id}/deliverables/compile`, async () => { compileCalls += 1; });
  void now;

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();

  const mainButton = page.getByRole('button', { name: 'Gerar entregáveis' }).first();
  const sideButton = page.getByRole('button', { name: 'Gerar entregáveis' }).last();
  await expect(mainButton).toBeVisible();
  await expect(sideButton).toBeVisible();

  await mainButton.click();
  await page.getByRole('button', { name: /Continue with/ }).click();

  // Both surfaces must reflect the same real store state immediately -- no
  // separate "did the side panel forget about it" bug. compileDeliverables
  // never resolves in this test, so seeing this before any response lands
  // proves the phase change (and thus the button swap) is synchronous.
  await expect(page.getByText('Preparando entregáveis…')).toBeVisible();
  await expect(page.getByText('Gerando entregáveis… acompanhe o progresso ao lado.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gerar entregáveis' })).toHaveCount(0);
  expect(compileCalls).toBe(1);
});

test('SSE events drive the timeline to drafts-ready without a blocking single response', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'delivjob2');
  const mission = await createMission(request, auth.tokens.access_token, 'SSE repro');
  await mockLlmGate(page);

  const now = new Date().toISOString();
  const jobId = 'mdjob_sse';
  const draftingJob = {
    id: jobId, mission_id: mission.id, workspace_id: null, status: 'DRAFTING', idempotency_key: 'idem-sse',
    error: null, degraded: false,
    artifacts_progress: [{ type: 'blueprint', title: 'Blueprint do Sistema', status: 'pending' }],
    drafts: [], events: [], created_at: now, updated_at: now, completed_at: null, heartbeat_at: now,
  };
  const readyJob = {
    ...draftingJob, status: 'DRAFTS_READY',
    artifacts_progress: [{ type: 'blueprint', title: 'Blueprint do Sistema', status: 'ready' }],
    drafts: [{ type: 'blueprint', title: 'Blueprint do Sistema', content: 'Conteúdo via SSE.', format: 'markdown', can_feed_mission: [], degraded: false }],
  };

  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/latest`, (route) => route.fulfill({ json: null }));
  await page.route(`**/api/missions/${mission.id}/deliverables/compile`, (route) => route.fulfill({ status: 202, json: draftingJob }));
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/${jobId}/events`, (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream',
    body: [
      sseFrame({ type: 'mission_deliverable_job_event', event: { id: 'evt_1', job_id: jobId, timestamp: now, stage: 'DRAFTING', type: 'artifact_drafting_started', level: 'info', message: 'Gerando Blueprint do Sistema.', artifact_type: 'blueprint' } }, 'evt_1'),
      sseFrame({ type: 'mission_deliverable_job_event', event: { id: 'evt_2', job_id: jobId, timestamp: now, stage: 'DRAFTS_READY', type: 'artifact_drafted', level: 'info', message: 'Blueprint do Sistema gerado.', artifact_type: 'blueprint' } }, 'evt_2'),
      sseFrame({ type: 'mission_deliverable_job', job: readyJob }),
    ].join(''),
  }));

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();
  await page.getByRole('button', { name: 'Gerar entregáveis' }).first().click();
  await page.getByRole('button', { name: /Continue with/ }).click();

  // Reaching the review modal only happens once the SSE-driven job snapshot
  // reports DRAFTS_READY -- this is real event plumbing, not the immediate
  // single-response path the other final-step tests exercise.
  const review = page.getByRole('dialog', { name: 'Revisar entregáveis gerados' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('button', { name: 'Blueprint do Sistema' })).toBeVisible();
});

test('refreshing mid-job restores state from the latest job instead of starting a new one', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'delivjob3');
  const mission = await createMission(request, auth.tokens.access_token, 'Refresh resume repro');
  await mockLlmGate(page);

  const now = new Date().toISOString();
  const jobId = 'mdjob_resume';
  const runningJob = {
    id: jobId, mission_id: mission.id, workspace_id: null, status: 'DRAFTING', idempotency_key: 'idem-resume',
    error: null, degraded: false,
    artifacts_progress: [{ type: 'blueprint', title: 'Blueprint do Sistema', status: 'drafting' }],
    drafts: [], events: [], created_at: now, updated_at: now, completed_at: null, heartbeat_at: now,
  };

  let compileCalls = 0;
  await page.route(`**/api/missions/${mission.id}/deliverables/compile`, async () => { compileCalls += 1; });
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/latest`, (route) => route.fulfill({ json: runningJob }));
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/${jobId}/events`, (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream',
    body: sseFrame({ type: 'heartbeat', jobId, status: 'DRAFTING' }),
  }));

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();

  // Landing on the final step alone (never clicking "Gerar entregáveis")
  // must restore the already-running job from /jobs/latest.
  await expect(page.getByText('Preparando os entregáveis')).toBeVisible();
  await expect(page.getByText('Blueprint do Sistema').first()).toBeVisible();
  expect(compileCalls).toBe(0);
});

test('a failed job shows a retry action, and retrying recovers to drafts-ready', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'delivjob4');
  const mission = await createMission(request, auth.tokens.access_token, 'Retry repro');
  await mockLlmGate(page);

  const now = new Date().toISOString();
  const jobId = 'mdjob_retry';
  const failedJob = {
    id: jobId, mission_id: mission.id, workspace_id: null, status: 'FAILED', idempotency_key: 'idem-retry',
    error: { kind: 'llm_error', message: 'Provider indisponível no teste.', artifact_type: 'blueprint' }, degraded: false,
    artifacts_progress: [{ type: 'blueprint', title: 'Blueprint do Sistema', status: 'failed' }],
    drafts: [], events: [], created_at: now, updated_at: now, completed_at: now, heartbeat_at: now,
  };
  const readyJob = {
    ...failedJob, status: 'DRAFTS_READY', error: null,
    artifacts_progress: [{ type: 'blueprint', title: 'Blueprint do Sistema', status: 'ready' }],
    drafts: [{ type: 'blueprint', title: 'Blueprint do Sistema', content: 'Recuperado após retry.', format: 'markdown', can_feed_mission: [], degraded: false }],
    completed_at: null,
  };

  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/latest`, (route) => route.fulfill({ json: null }));
  await page.route(`**/api/missions/${mission.id}/deliverables/compile`, (route) => route.fulfill({ status: 202, json: failedJob }));
  let retryCalls = 0;
  await page.route(`**/api/missions/${mission.id}/deliverables/jobs/${jobId}/retry`, (route) => { retryCalls += 1; return route.fulfill({ status: 202, json: readyJob }); });

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();
  await page.getByRole('button', { name: 'Gerar entregáveis' }).first().click();
  await page.getByRole('button', { name: /Continue with/ }).click();

  await expect(page.getByText('Falha ao gerar entregáveis')).toBeVisible();
  await expect(page.getByText('Provider indisponível no teste.')).toBeVisible();
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.getByRole('button', { name: /Continue with/ }).click();

  const review = page.getByRole('dialog', { name: 'Revisar entregáveis gerados' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('button', { name: 'Blueprint do Sistema' })).toBeVisible();
  expect(retryCalls).toBe(1);
});
