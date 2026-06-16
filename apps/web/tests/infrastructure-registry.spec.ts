import { expect, test, type Page } from '@playwright/test';
import { webUrl } from './test-urls';

const WIZARD_URL = webUrl('/wizard');

async function completeWizardSelection(page: Page, {
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
  await page.goto(WIZARD_URL);

  await expect(page.getByLabel('1. Language')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('1. Language').selectOption(languageId);
  await page.getByLabel('2. Runtime').selectOption(runtimeId);
  await page.getByLabel('3. Framework').selectOption(frameworkId);

  await page.getByRole('button', { name: 'Continue to Architecture' }).click();
  await expect(page.getByLabel('4. Architecture')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('4. Architecture').selectOption(architectureId);

  await page.getByRole('button', { name: 'Continue to Project Type' }).click();
  await expect(page.getByLabel('5. Archetype')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('5. Archetype').selectOption(archetypeId);

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

test('wizard shows Spring Boot infrastructure recommendations', async ({ page }) => {
  await completeWizardSelection(page, {
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

test('wizard shows FastAPI AI infrastructure recommendations', async ({ page }) => {
  await completeWizardSelection(page, {
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

test('wizard keeps infrastructure panel safe when backend is offline', async ({ page }) => {
  await page.route('http://127.0.0.1:8001/api/infrastructure/recommendations', async (route) => {
    await route.abort('failed');
  });

  await completeWizardSelection(page, {
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
