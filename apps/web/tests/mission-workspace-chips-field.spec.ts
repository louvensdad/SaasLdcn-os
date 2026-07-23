import { expect, test } from '@playwright/test';
import { authenticateWizardSession } from './wizard-flow-helpers';

const API_BASE = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8001/api';

test('chips field + AI suggestion no longer crash the mission workspace', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'crashfix');
  const token = auth.tokens.access_token;

  // Create a software.build mission directly via the API (bypasses the
  // /wizard selector UI, which this fix does not touch).
  const created = await request.post(`${API_BASE}/missions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { mission_type: 'software.build', title: 'Crash repro', mode: 'guided' },
  });
  expect(created.ok()).toBe(true);
  const mission = await created.json();

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(`/wizard/${mission.id}`);
  await expect(page.getByRole('heading', { name: 'Visão do produto' })).toBeVisible();

  // Navigate to the "architecture" step directly via the journey rail.
  await page.getByRole('button', { name: /Arquitetura/ }).click();
  await expect(page.getByText('Módulos principais')).toBeVisible();

  // 1. Type a chip into "Módulos principais" (the exact field from the crash).
  // This used to throw "modules.some is not a function" while analyzeImpact
  // evaluated payments_details' condition against the new array -- instead it
  // now correctly detects the impact and asks for confirmation.
  const chipsInput = page.locator('#architecture\\.modules');
  await chipsInput.fill('Pagamentos');
  await chipsInput.press('Enter');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByText('payments_details')).toBeVisible();
  await page.getByRole('button', { name: 'Aplicar e revisar etapas' }).click();

  // Confirming jumps the journey back to the first incomplete required step
  // (correct, unrelated behavior) -- the conditional step now existing in
  // the rail is the actual proof the array was read correctly.
  await expect(page.getByRole('button', { name: /Pagamentos e compliance financeiro/ })).toBeVisible();

  // Revisit "Arquitetura" and confirm the chip itself persisted as data,
  // not just triggering the impact check.
  await page.getByRole('button', { name: /^5Arquitetura/ }).click();
  await expect(page.getByText('Pagamentos', { exact: true })).toBeVisible();

  // 2. Now type in an unrelated textarea on another step -- this is exactly
  // what triggered the original crash (any field change re-evaluates every
  // conditionalStep's condition, including payments_details reading
  // architecture.modules).
  await page.getByRole('button', { name: /Regras de negócio/ }).click();
  await page.getByLabel('Principais regras de negócio').fill('Teste de regressao.');

  expect(pageErrors, `Unexpected page errors: ${pageErrors.join('; ')}`).toEqual([]);
});

test('accepting an AI suggestion for a chips field does not freeze the mission', async ({ page, request }) => {
  const auth = await authenticateWizardSession(page, request, 'crashfix2');
  const token = auth.tokens.access_token;
  const created = await request.post(`${API_BASE}/missions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { mission_type: 'software.build', title: 'AI suggestion repro', mode: 'guided' },
  });
  const mission = await created.json();

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.route('**/api/llm/settings/active', (route) => route.fulfill({ json: {
    provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-4.1-mini', hasKey: true, status: 'ready',
    lastValidatedAt: new Date().toISOString(), lastUsedAt: null, mode: 'llm', requiresConfirmation: false,
    reason: 'Provider validado para o teste.', contextTokens: 128000,
  } }));
  await page.route('**/api/llm/settings/confirm', (route) => route.fulfill({ json: {
    provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-4.1-mini', mode: 'llm',
    reason: 'Confirmado no teste.', fallbackUsed: false, keyStatus: 'ready', requestedCapability: 'mission_field_action',
  } }));
  // The LLM returns free text, comma-separated -- exactly what an AI suggests
  // for a chips field. Before the fix this got written as a raw string into
  // "architecture.modules", and the very next impact-analysis pass (still
  // inside executeFieldAction, before the user even sees the modal) crashed.
  await page.route('**/api/missions/*/ai-action', (route) => route.fulfill({ json: {
    content: 'Pagamentos, Autenticação, Notificações',
    insert_mode: 'suggest',
    degraded: false,
  } }));

  await page.goto(`/wizard/${mission.id}`);
  await page.getByRole('button', { name: /^5Arquitetura/ }).click();
  await page.getByRole('button', { name: 'Sugerir módulos' }).click();
  await page.getByRole('button', { name: /Continue with/ }).click();

  const suggestion = page.getByRole('dialog', { name: /Sugestão da IA/ });
  await expect(suggestion).toContainText('Pagamentos, Autenticação, Notificações');
  await suggestion.getByRole('button', { name: 'Aceitar alteração' }).click();

  // Accepting used to throw inside acceptSuggestion's analyzeImpact call
  // (same root cause) and freeze the page. If we get here with no thrown
  // errors and the conditional step present, the fix holds for this path too.
  await expect(page.getByRole('button', { name: /Pagamentos e compliance financeiro/ })).toBeVisible();
  expect(pageErrors, `Unexpected page errors: ${pageErrors.join('; ')}`).toEqual([]);
});
