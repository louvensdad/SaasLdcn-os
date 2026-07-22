import { expect, test } from '@playwright/test';
import { authenticateWizardSession } from './wizard-flow-helpers';

const readyLlm = {
  provider: 'openai',
  providerLabel: 'OpenAI',
  model: 'gpt-4.1-mini',
  hasKey: true,
  status: 'ready',
  lastValidatedAt: new Date().toISOString(),
  lastUsedAt: null,
  mode: 'llm',
  requiresConfirmation: false,
  reason: 'Provider validado para o teste.',
  contextTokens: 128000,
};

test('automation mission updates the whole workspace, persists and starts the guided journey', async ({ page, request }) => {
  await authenticateWizardSession(page, request, 'mission_workspace');
  await page.route('**/api/llm/settings/active', (route) => route.fulfill({ json: readyLlm }));
  await page.route('**/api/llm/settings/confirm', (route) => route.fulfill({ json: {
    provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-4.1-mini', mode: 'llm',
    reason: 'Confirmado no teste.', fallbackUsed: false, keyStatus: 'ready', requestedCapability: 'mission_field_action',
  } }));
  await page.route('**/api/missions/*/ai-action', (route) => route.fulfill({ json: {
    content: 'Processo revisado com gatilho, rastreabilidade e tratamento explícito de falhas.',
    insert_mode: 'suggest',
    degraded: false,
  } }));
  await page.goto('/wizard');

  const software = page.getByRole('option', { name: 'Software / App / API' });
  await software.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Automação / Workflow' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/type=automation[.]create/);
  await expect(page.getByRole('heading', { name: /AUTOMATION[.]CREATE/ })).toBeVisible();
  await expect(page.getByText('Criar automação ou workflow', { exact: true })).toBeVisible();

  const guided = page.getByRole('radio', { name: /Guiado/ });
  await guided.check();
  await expect(guided).toBeChecked();
  const journeyItems = page.getByRole('list', { name: /Jornada com/ }).getByRole('listitem');
  await expect(journeyItems).toHaveCount(13);
  await page.getByRole('radio', { name: /Rápido/ }).check();
  await expect(journeyItems).toHaveCount(3);
  await guided.check();
  await expect(journeyItems).toHaveCount(13);

  const integration = page.getByRole('button', { name: /Integration/ });
  await integration.click();
  await expect(integration).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('dialog', { name: 'Especialista' })).toBeVisible();
  await page.keyboard.press('Escape');
  await integration.click();
  await expect(integration).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Texto / Objetivo' }).click();
  const objectiveDialog = page.getByRole('dialog', { name: 'Definir objetivo' });
  await expect(objectiveDialog).toBeVisible();
  await objectiveDialog.getByLabel('Objetivo da missão').fill('Automatizar a triagem de chamados e registrar falhas sem perder eventos.');
  await objectiveDialog.getByRole('button', { name: 'Salvar objetivo' }).click();

  await expect(page.getByRole('button', { name: 'Iniciar criação de automação' })).toBeVisible();
  await expect(page.getByText('1 fonte(s) na Central de Contexto.')).toBeVisible();

  await page.getByRole('button', { name: 'Gerar' }).first().click();
  const suggestion = page.getByRole('dialog', { name: 'Sugestão da IA' });
  await expect(suggestion).toContainText('Processo revisado');
  await expect(suggestion).toContainText('Atual');
  await expect(suggestion).toContainText('Impacto');
  await suggestion.getByRole('button', { name: 'Aceitar' }).click();
  await expect(page.getByText('Sugestão aceita e registrada.')).toBeVisible();

  const risk = page.getByRole('button', { name: /Tratamento de erros não definido/ });
  await risk.click();
  await expect(page.getByRole('dialog', { name: 'Detalhes do risco' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: /PLANO DE AUTOMAÇÃO/i }).click();
  await expect(page.getByRole('dialog', { name: 'Entregável' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page).toHaveURL(/type=automation.create/);
  await expect(page.getByRole('button', { name: 'Iniciar criação de automação' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Automação / Workflow' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Iniciar criação de automação' }).click();
  await expect(page).toHaveURL(/wizard[/][^/?]+$/);
});

test('AI-dependent action always explains a missing provider', async ({ page, request }) => {
  await authenticateWizardSession(page, request, 'mission_workspace_no_ai');
  await page.route('**/api/llm/settings/active', (route) => route.fulfill({
    json: { ...readyLlm, provider: null, providerLabel: null, model: null, hasKey: false, status: 'not_configured', mode: 'deterministic' },
  }));
  await page.goto('/wizard?type=software.build');

  await page.getByRole('button', { name: 'Definir contexto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Definir objetivo' });
  await dialog.getByLabel('Objetivo da missão').fill('Criar uma API segura para gestão de pedidos.');
  await dialog.getByRole('button', { name: 'Salvar objetivo' }).click();

  const connect = page.getByRole('button', { name: 'Conectar IA' }).last();
  await expect(connect).toBeVisible();
  await connect.click();
  await expect(page.getByRole('dialog', { name: 'Conectar IA' })).toContainText('nenhuma chave global');
});
