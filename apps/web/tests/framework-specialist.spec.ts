import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openWizardAtTechnologyStep } from './wizard-flow-helpers';

async function selectFramework(page: Page, request: APIRequestContext, languageId: string, runtimeId: string, frameworkId: string) {
  await openWizardAtTechnologyStep(page, request);

  const languageChip = page.locator(`[data-option-id="${languageId}"]`);
  await expect(languageChip).toBeVisible({ timeout: 15000 });
  await languageChip.click();

  const runtimeChip = page.locator(`[data-option-id="${runtimeId}"]`);
  await expect(runtimeChip).toBeVisible({ timeout: 15000 });
  await runtimeChip.click();

  const frameworkChip = page.locator(`[data-option-id="${frameworkId}"]`);
  await expect(frameworkChip).toBeVisible({ timeout: 15000 });
  await frameworkChip.click();
}

test('wizard shows the Spring Boot specialist panel', async ({ page, request }) => {
  await selectFramework(page, request, 'java', 'jvm', 'spring_boot');

  await expect(page.getByText('Framework specialist', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Spring Boot', exact: true })).toBeVisible();
  await expect(page.getByText('Enterprise ready', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Recommended capabilities', { exact: true })).toBeVisible();
});

test('wizard shows NestJS specialist guidance and recommendations', async ({ page, request }) => {
  await selectFramework(page, request, 'typescript', 'nodejs', 'nestjs');

  await expect(page.getByRole('heading', { name: 'NestJS', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Architecture guidance', { exact: true })).toBeVisible();
  await expect(page.getByText('Endpoint guidance', { exact: true })).toBeVisible();
});

test('wizard shows a backend offline state for framework specialist loading', async ({ page, request }) => {
  await page.route('**/api/frameworks/nestjs/specialist-profile', async (route) => {
    await route.abort('failed');
  });

  await selectFramework(page, request, 'typescript', 'nodejs', 'nestjs');

  await expect(page.getByText('Backend is offline or unreachable.')).toBeVisible({ timeout: 15000 });
});
