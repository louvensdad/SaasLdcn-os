import { expect, test, type Page } from '@playwright/test';
import { webUrl } from './test-urls';

const WIZARD_URL = webUrl('/wizard');

async function openReadinessReview(page: Page) {
  await page.goto(WIZARD_URL);
  await page.getByRole('button', { name: '1 Technology Path Choose language, runtime, and framework.' }).click();
  await page.getByLabel('1. Language').selectOption('java');
  await page.getByLabel('2. Runtime').selectOption('jvm');
  await page.getByLabel('3. Framework').selectOption('spring_boot');
  await page.getByRole('button', { name: 'Continue to Architecture' }).click();
  await page.getByLabel('4. Architecture').selectOption('microservices');
  await page.getByRole('button', { name: 'Continue to Project Type' }).click();
  await page.getByLabel('5. Archetype').selectOption('microservice_api');
  await page.getByRole('button', { name: 'Continue to Capabilities' }).click();
  await page.getByRole('button', { name: 'View advanced capabilities' }).click();
  for (const capabilityLabel of ['Observability', 'Queue']) {
    const checkbox = page.getByRole('checkbox', { name: capabilityLabel });
    if ((await checkbox.count()) > 0) {
      await checkbox.check();
    }
  }
  await page.getByRole('button', { name: 'Continue to Business Modules' }).click();
  await page.getByRole('checkbox', { name: 'Users' }).check();
  await page.getByRole('button', { name: 'Continue to Endpoints' }).click();
  await page.getByRole('button', { name: 'Continue to Blueprint Review' }).click();
  await expect(page.getByRole('heading', { name: 'Blueprint Review' })).toBeVisible({ timeout: 15000 });
}

test('wizard readiness panel updates for selected architecture', async ({ page }) => {
  await openReadinessReview(page);

  const panel = page.getByTestId('engineering-readiness-panel');
  await expect(panel.getByText('Team Intelligence Panel')).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('Production Readiness Surface')).toBeVisible();
  await expect(panel.getByText('Delivery Complexity Radar')).toBeVisible();
});

test('wizard team profile updates with platform roles', async ({ page }) => {
  await openReadinessReview(page);

  const panel = page.getByTestId('engineering-readiness-panel');
  await expect(panel.getByText('Platform Engineer')).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('DevOps Engineer')).toBeVisible();
  await expect(panel.getByText('Observability expertise')).toBeVisible();
});

test('wizard operational burden changes for microservices', async ({ page }) => {
  await openReadinessReview(page);

  const panel = page.getByTestId('engineering-readiness-panel');
  await expect(panel.getByText('Operational Burden Surface')).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('Service ownership', { exact: true })).toBeVisible();
  await expect(panel.getByText('Microservices require platform maturity.')).toBeVisible();
});

test('wizard readiness keeps safe state when backend is offline', async ({ page }) => {
  await page.route('http://127.0.0.1:8001/api/engineering/**', async (route) => {
    await route.abort('failed');
  });
  await openReadinessReview(page);

  await expect(page.getByText('Engineering readiness offline')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Engineering readiness services are offline, but the wizard keeps the selected team profile safe.')).toBeVisible();
});
