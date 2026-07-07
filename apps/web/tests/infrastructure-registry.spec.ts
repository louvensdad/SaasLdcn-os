import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openWizardAtTechnologyStep } from './wizard-flow-helpers';

async function completeWizardSelection(page: Page, request: APIRequestContext, {
  languageId,
  runtimeId,
  frameworkId,
  architectureId,
  archetypeId,
  capabilityLabel,
  moduleLabel,
}: {
  readonly languageId: string;
  readonly runtimeId: string;
  readonly frameworkId: string;
  readonly architectureId: string;
  readonly archetypeId: string;
  readonly capabilityLabel: string;
  readonly moduleLabel: string;
}) {
  await openWizardAtTechnologyStep(page, request);

  await expect(page.locator(`[data-option-id="${languageId}"]`)).toBeVisible({ timeout: 15000 });
  await page.locator(`[data-option-id="${languageId}"]`).click();
  await page.locator(`[data-option-id="${runtimeId}"]`).click();
  await page.locator(`[data-option-id="${frameworkId}"]`).click();

  await page.getByRole('button', { name: 'Continue to Architecture' }).click();
  await expect(page.locator(`[data-option-id="${architectureId}"]`)).toBeVisible({ timeout: 15000 });
  await page.locator(`[data-option-id="${architectureId}"]`).click();

  await page.getByRole('button', { name: 'Continue to Project Type' }).click();
  await expect(page.locator(`[data-option-id="${archetypeId}"]`)).toBeVisible({ timeout: 15000 });
  await page.locator(`[data-option-id="${archetypeId}"]`).click();

  await page.getByRole('button', { name: 'Continue to Capabilities' }).click();
  await expect(page.getByText('Recommended capabilities first', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'View advanced capabilities' }).click();
  const capabilityCheckbox = page.getByRole('checkbox', { name: capabilityLabel });
  if ((await capabilityCheckbox.count()) > 0) {
    await capabilityCheckbox.check();
  }
  await page.getByRole('button', { name: 'Continue to Business Modules' }).click();
  await expect(page.getByText('Business modules by domain', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('checkbox', { name: moduleLabel }).check();
}

test('wizard shows Spring Boot infrastructure recommendations', async ({ page, request }) => {
  await completeWizardSelection(page, request, {
    languageId: 'java',
    runtimeId: 'jvm',
    frameworkId: 'spring_boot',
    architectureId: 'microservices',
    archetypeId: 'microservice_api',
    capabilityLabel: 'Docker',
    moduleLabel: 'Users',
  });

  await expect(page.getByText('Infrastructure recommendations', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /PostgreSQL/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Redis/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Docker Compose/i }).first()).toBeVisible();
});

test('wizard shows FastAPI AI infrastructure recommendations', async ({ page, request }) => {
  await completeWizardSelection(page, request, {
    languageId: 'python',
    runtimeId: 'python_runtime',
    frameworkId: 'fastapi',
    architectureId: 'clean_architecture',
    archetypeId: 'ai_saas',
    capabilityLabel: 'AI Chat',
    moduleLabel: 'Users',
  });

  await expect(page.getByText('Vector Database', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /pgvector/i }).first()).toBeVisible();
});

test('wizard keeps infrastructure panel safe when backend is offline', async ({ page, request }) => {
  await page.route('**/api/infrastructure/recommendations', async (route) => {
    await route.abort('failed');
  });

  await completeWizardSelection(page, request, {
    languageId: 'java',
    runtimeId: 'jvm',
    frameworkId: 'spring_boot',
    architectureId: 'microservices',
    archetypeId: 'microservice_api',
    capabilityLabel: 'Docker',
    moduleLabel: 'Users',
  });

  await expect(page.getByText('Backend is offline or unreachable.')).toBeVisible({ timeout: 15000 });
});
