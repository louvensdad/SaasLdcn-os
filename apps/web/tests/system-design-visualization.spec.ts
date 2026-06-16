import { expect, test, type Page } from '@playwright/test';
import { webUrl } from './test-urls';

const WIZARD_URL = webUrl('/wizard');

async function openVisualizationReview(page: Page) {
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
  for (const label of ['Observability', 'Queue']) {
    const checkbox = page.getByRole('checkbox', { name: label });
    if ((await checkbox.count()) > 0) await checkbox.check();
  }
  await page.getByRole('button', { name: 'Continue to Business Modules' }).click();
  await page.getByRole('checkbox', { name: 'Users' }).check();
  await page.getByRole('button', { name: 'Continue to Endpoints' }).click();
  await page.getByRole('button', { name: 'Continue to Blueprint Review' }).click();
  await expect(page.getByRole('heading', { name: 'Blueprint Review' })).toBeVisible({ timeout: 15000 });
}

test('wizard shows the architecture cockpit and topology updates', async ({ page }) => {
  await openVisualizationReview(page);
  const cockpit = page.getByTestId('visualization-cockpit');
  await expect(cockpit.getByText('Architecture Cockpit')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('architecture-topology-surface').getByText('API Gateway')).toBeVisible();
});

test('wizard runtime, risk and readiness visualization are visible', async ({ page }) => {
  await openVisualizationReview(page);
  await expect(page.getByTestId('runtime-flow-surface')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('risk-zones-surface')).toBeVisible();
  await expect(page.getByTestId('readiness-zones-surface')).toBeVisible();
});

test('wizard visualization stays responsive on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await openVisualizationReview(page);
  await expect(page.getByTestId('visualization-cockpit')).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBeTruthy();
});

test('wizard visualization exposes safe state when backend is offline', async ({ page }) => {
  await page.route('http://127.0.0.1:8001/api/system-design/**', async (route) => route.abort('failed'));
  await openVisualizationReview(page);
  await expect(page.getByText('Architecture cockpit offline')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('System design visualization services are offline, but the selected architecture path remains safe.')).toBeVisible();
});
