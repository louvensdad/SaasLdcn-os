import { expect, test } from '@playwright/test';
import { authenticateWizardSession } from './wizard-flow-helpers';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

test('language selection persists and localizes settings and LDCN presence', async ({ page, request }) => {
  await authenticateWizardSession(page, request);
  await page.goto(`${BASE_URL}/settings`);
  await page.getByLabel('Interface language').first().selectOption('pt-BR');

  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  // "Idioma e Localização" lives under the Settings page's own "Interface" tab.
  await page.getByRole('tab', { name: 'Interface' }).click();
  await expect(page.getByText('Idioma e Localização')).toBeVisible();
  await expect(page.getByRole('banner').getByLabel('LDCN observando')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  await expect(page.getByLabel('Idioma da interface').first()).toHaveValue('pt-BR');
});
