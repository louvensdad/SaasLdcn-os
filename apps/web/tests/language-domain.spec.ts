import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openWizardAtTechnologyStep } from './wizard-flow-helpers';

async function selectLanguage(page: Page, request: APIRequestContext, languageId: string, runtimeId: string) {
  await openWizardAtTechnologyStep(page, request);
  const languageChip = page.locator(`[data-option-id="${languageId}"]`);
  await expect(languageChip).toBeVisible({ timeout: 15000 });
  await languageChip.click();

  const runtimeChip = page.locator(`[data-option-id="${runtimeId}"]`);
  await expect(runtimeChip).toBeVisible({ timeout: 15000 });
  await runtimeChip.click();
}

test('Java language domain loads Spring Boot and related recommendations', async ({ page, request }) => {
  await selectLanguage(page, request, 'java', 'jvm');

  for (const frameworkId of ['spring_boot', 'quarkus', 'micronaut']) {
    await expect(page.locator(`[data-option-id="${frameworkId}"]`)).toBeVisible();
  }
  await expect(page.getByText('Java recommendations')).toBeVisible();
  await expect(page.getByText('Use Spring Boot for enterprise APIs')).toBeVisible();
});

test('TypeScript language domain loads Node-focused framework choices', async ({ page, request }) => {
  await selectLanguage(page, request, 'typescript', 'nodejs');

  for (const frameworkId of ['nestjs', 'nextjs', 'express', 'fastify', 'angular', 'react']) {
    await expect(page.locator(`[data-option-id="${frameworkId}"]`)).toBeVisible();
  }
  await expect(page.getByText('TypeScript recommendations')).toBeVisible();
});

test('Python language domain loads FastAPI, Django and Flask', async ({ page, request }) => {
  await selectLanguage(page, request, 'python', 'python_runtime');

  for (const frameworkId of ['fastapi', 'django', 'flask']) {
    await expect(page.locator(`[data-option-id="${frameworkId}"]`)).toBeVisible();
  }
  await expect(page.getByText('Python recommendations')).toBeVisible();
});

test('wizard shows a safe offline state when the language domain profile endpoint fails', async ({ page, request }) => {
  await page.route('**/api/languages/java/profile', async (route) => {
    await route.abort('failed');
  });

  await openWizardAtTechnologyStep(page, request);
  await page.locator('[data-option-id="java"]').click();

  await expect(page.getByText('Technology graph unavailable')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Backend is offline or unreachable.')).toBeVisible({ timeout: 15000 });
});
