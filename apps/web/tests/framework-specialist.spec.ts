import { expect, test, type Page } from '@playwright/test';

async function selectFramework(page: Page, languageId: string, runtimeId: string, frameworkId: string) {
  await page.goto('http://127.0.0.1:3000/wizard');

  const languageSelect = page.getByLabel('1. Language');
  await expect(languageSelect).toBeVisible({ timeout: 15000 });
  await languageSelect.selectOption(languageId);

  const runtimeSelect = page.getByLabel('2. Runtime');
  await expect(runtimeSelect).toBeVisible({ timeout: 15000 });
  await runtimeSelect.selectOption(runtimeId);

  const frameworkSelect = page.getByLabel('3. Framework');
  await expect(frameworkSelect).toBeVisible({ timeout: 15000 });
  await frameworkSelect.selectOption(frameworkId);
}

test('wizard shows the Spring Boot specialist panel', async ({ page }) => {
  await selectFramework(page, 'java', 'jvm', 'spring_boot');

  await expect(page.getByText('Framework specialist', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Spring Boot specialist profile loaded')).toBeVisible();
  await expect(page.getByText('Enterprise ready', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Recommended capabilities', { exact: true })).toBeVisible();
});

test('wizard shows NestJS specialist guidance and recommendations', async ({ page }) => {
  await selectFramework(page, 'typescript', 'nodejs', 'nestjs');

  await expect(page.getByText('NestJS architecture guidance ready')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Architecture guidance', { exact: true })).toBeVisible();
  await expect(page.getByText('Endpoint guidance', { exact: true })).toBeVisible();
});

test('wizard shows a backend offline state for framework specialist loading', async ({ page }) => {
  await page.route('http://127.0.0.1:8001/api/frameworks/nestjs/specialist-profile', async (route) => {
    await route.abort('failed');
  });

  await selectFramework(page, 'typescript', 'nodejs', 'nestjs');

  await expect(page.getByText('Backend is offline or unreachable.')).toBeVisible({ timeout: 15000 });
});
