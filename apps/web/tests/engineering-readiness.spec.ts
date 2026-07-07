import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openWizardAtTechnologyStep } from './wizard-flow-helpers';

async function openReadinessReview(page: Page, request: APIRequestContext) {
  await openWizardAtTechnologyStep(page, request);
  await page.locator('[data-option-id="java"]').click();
  await page.locator('[data-option-id="jvm"]').click();
  await page.locator('[data-option-id="spring_boot"]').click();
  await page.getByRole('button', { name: 'Continue to Architecture' }).click();
  await page.locator('[data-option-id="microservices"]').click();
  await page.getByRole('button', { name: 'Continue to Project Type' }).click();
  await page.locator('[data-option-id="microservice_api"]').click();
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
  // The readiness panel is tabbed (only the active tab's content is mounted).
  await page.getByRole('tab', { name: 'Engineering Readiness' }).click();
}

test('wizard readiness panel updates for selected architecture', async ({ page, request }) => {
  await openReadinessReview(page, request);

  const panel = page.getByTestId('engineering-readiness-panel');
  await expect(panel.getByText('Team Intelligence Panel')).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('Production Readiness Surface')).toBeVisible();
  await expect(panel.getByText('Delivery Complexity Radar')).toBeVisible();
});

test('wizard team profile updates with platform roles', async ({ page, request }) => {
  await openReadinessReview(page, request);

  const panel = page.getByTestId('engineering-readiness-panel');
  await expect(panel.getByText('Platform Engineer')).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('DevOps Engineer')).toBeVisible();
  await expect(panel.getByText('Observability expertise')).toBeVisible();
});

test('wizard operational burden changes for microservices', async ({ page, request }) => {
  await openReadinessReview(page, request);

  const panel = page.getByTestId('engineering-readiness-panel');
  await expect(panel.getByText('Operational Burden Surface')).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('Service ownership', { exact: true })).toBeVisible();
  await expect(panel.getByText('Microservices require platform maturity.')).toBeVisible();
});

test('wizard readiness keeps safe state when backend is offline', async ({ page, request }) => {
  await page.route('**/api/engineering/**', async (route) => {
    await route.abort('failed');
  });
  await openReadinessReview(page, request);

  await expect(page.getByText('Engineering readiness offline')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Engineering readiness services are offline, but the wizard keeps the selected team profile safe.')).toBeVisible();
});
