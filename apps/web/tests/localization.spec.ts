import { expect, test } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

test('language selection persists and localizes settings and LDCN presence', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings`);
  await page.getByLabel('Interface language').first().selectOption('pt-BR');

  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  await expect(page.getByText('Idioma e Localização')).toBeVisible();
  await expect(page.getByRole('banner').getByLabel('LDCN observando')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  await expect(page.getByLabel('Idioma da interface').first()).toHaveValue('pt-BR');
});

test('wizard follows the selected interface locale', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings`);
  await page.getByLabel('Interface language').first().selectOption('fr-FR');
  await page.goto(`${BASE_URL}/wizard`);
  await expect(page.getByRole('banner').getByLabel('LDCN en observation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Parcours Technologique' })).toBeVisible();
});
