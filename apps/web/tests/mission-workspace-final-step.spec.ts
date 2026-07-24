import { expect, test } from '@playwright/test';
import { authenticateWizardSession } from './wizard-flow-helpers';

const API_BASE = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8001/api';

test('the last mission step drafts deliverables for review instead of looping on "Validar e continuar", and nothing saves until the user accepts', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'finalstep');
  const token = auth.tokens.access_token;
  const created = await request.post(`${API_BASE}/missions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { mission_type: 'software.build', title: 'Final step repro', mode: 'guided' },
  });
  expect(created.ok()).toBe(true);
  const mission = await created.json();

  await page.route('**/api/llm/settings/active', (route) => route.fulfill({ json: {
    provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-4.1-mini', hasKey: true, status: 'ready',
    lastValidatedAt: new Date().toISOString(), lastUsedAt: null, mode: 'llm', requiresConfirmation: false,
    reason: 'Provider validado para o teste.', contextTokens: 128000,
  } }));
  await page.route('**/api/llm/settings/confirm', (route) => route.fulfill({ json: {
    provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-4.1-mini', mode: 'llm',
    reason: 'Confirmado no teste.', fallbackUsed: false, keyStatus: 'ready', requestedCapability: 'mission_report',
  } }));
  await page.route(`**/api/missions/${mission.id}/artifacts/preview`, (route) => route.fulfill({ json: {
    drafts: [
      { type: 'blueprint', title: 'Blueprint do Sistema', content: 'Rascunho do blueprint gerado por etapas.', format: 'markdown', can_feed_mission: [], degraded: false },
      { type: 'prompt_md', title: 'Prompt.md', content: 'Rascunho do prompt.md.', format: 'markdown', can_feed_mission: [], degraded: false },
    ],
    degraded: false,
  } }));
  let confirmedContent: string | null = null;
  await page.route(`**/api/missions/${mission.id}/artifacts/confirm`, async (route) => {
    const body = route.request().postDataJSON() as { artifacts: { title: string; content: string }[] };
    confirmedContent = body.artifacts[0]?.content ?? null;
    await route.fulfill({ json: { ...mission, artifacts: body.artifacts.map((a, i) => ({ id: `a${i}`, ...a, generated_at: new Date().toISOString() })) } });
  });

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();
  await expect(page.getByRole('heading', { name: 'Blueprint final' })).toBeVisible();

  // Before the fix this button said "Validar e continuar" and just
  // recomputed the journey onto the same step -- a visible no-op.
  const cta = page.getByRole('button', { name: 'Gerar entregáveis' }).last();
  await expect(cta).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validar e continuar' })).toHaveCount(0);
  await cta.click();
  await page.getByRole('button', { name: /Continue with/ }).click();

  // Drafts land in a review modal -- nothing is saved yet ("sempre pergunta
  // pro usuário se ele aceita").
  const review = page.getByRole('dialog', { name: 'Revisar entregáveis gerados' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('button', { name: 'Blueprint do Sistema' })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Prompt.md' })).toBeVisible();
  expect(confirmedContent).toBeNull();

  // The user can edit a draft before accepting.
  const textarea = review.getByLabel('Blueprint do Sistema');
  await textarea.fill('Blueprint editado pelo usuário antes de aceitar.');
  await review.getByRole('button', { name: 'Aceitar e salvar' }).click();

  await expect(review).toHaveCount(0);
  await expect.poll(() => confirmedContent).toBe('Blueprint editado pelo usuário antes de aceitar.');
});

test('cancelling the artifacts review discards the drafts without saving anything', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'finalstepcancel');
  const token = auth.tokens.access_token;
  const created = await request.post(`${API_BASE}/missions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { mission_type: 'software.build', title: 'Cancel repro', mode: 'guided' },
  });
  const mission = await created.json();

  await page.route('**/api/llm/settings/active', (route) => route.fulfill({ json: {
    provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-4.1-mini', hasKey: true, status: 'ready',
    lastValidatedAt: new Date().toISOString(), lastUsedAt: null, mode: 'llm', requiresConfirmation: false,
    reason: 'Provider validado para o teste.', contextTokens: 128000,
  } }));
  await page.route('**/api/llm/settings/confirm', (route) => route.fulfill({ json: {
    provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-4.1-mini', mode: 'llm',
    reason: 'Confirmado no teste.', fallbackUsed: false, keyStatus: 'ready', requestedCapability: 'mission_report',
  } }));
  await page.route(`**/api/missions/${mission.id}/artifacts/preview`, (route) => route.fulfill({ json: {
    drafts: [{ type: 'blueprint', title: 'Blueprint do Sistema', content: 'Rascunho.', format: 'markdown', can_feed_mission: [], degraded: false }],
    degraded: false,
  } }));
  let confirmCalled = false;
  await page.route(`**/api/missions/${mission.id}/artifacts/confirm`, (route) => { confirmCalled = true; return route.fulfill({ json: mission }); });

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /Blueprint final/ }).click();
  await page.getByRole('button', { name: 'Gerar entregáveis' }).last().click();
  await page.getByRole('button', { name: /Continue with/ }).click();

  const review = page.getByRole('dialog', { name: 'Revisar entregáveis gerados' });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Cancelar' }).click();

  await expect(review).toHaveCount(0);
  expect(confirmCalled).toBe(false);
});

test('the error-handling gap in "APIs e integrações" is actually addressable', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'gapfix');
  const token = auth.tokens.access_token;
  const created = await request.post(`${API_BASE}/missions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { mission_type: 'software.build', title: 'Gap repro', mode: 'guided' },
  });
  const mission = await created.json();

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /APIs e integrações/ }).click();
  // This field didn't exist at all before the fix -- the "missing_error_handling"
  // gap rule checked apis.error_strategy, which no field ever wrote to.
  await expect(page.getByLabel('Estratégia de tratamento de erros')).toBeVisible();
});
