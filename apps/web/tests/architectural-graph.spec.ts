import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { webUrl } from './test-urls';
import { applyAuthToPage, openWizardAtTechnologyStep, registerWizardApiUser } from './wizard-flow-helpers';

const API_URL = 'http://127.0.0.1:8001/api';

async function openGraphReview(page: Page, request: APIRequestContext, options?: { payments?: boolean }) {
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
  for (const label of ['Observability', 'Queue', ...(options?.payments ? ['Payments'] : [])]) {
    const checkbox = page.getByRole('checkbox', { name: label });
    if ((await checkbox.count()) > 0) await checkbox.check();
  }
  await page.getByRole('button', { name: 'Continue to Business Modules' }).click();
  await page.getByRole('checkbox', { name: 'Users' }).check();
  const paymentsModule = page.getByRole('checkbox', { name: 'Payments' });
  if (options?.payments && (await paymentsModule.count()) > 0) await paymentsModule.check();
  await page.getByRole('button', { name: 'Continue to Endpoints' }).click();
  await page.getByRole('button', { name: 'Continue to Blueprint Review' }).click();
  await expect(page.getByRole('heading', { name: 'Blueprint Review' })).toBeVisible({ timeout: 15000 });
  // The graph/cockpit/readiness panels are tabbed (only the active one is mounted).
  await page.getByRole('tab', { name: 'Architecture Graph' }).click();
}

test('graph visible in wizard', async ({ page, request }) => {
  await openGraphReview(page, request);
  await expect(page.getByTestId('architectural-graph-canvas')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Architecture Graph Surface')).toBeVisible();
});

test('select microservices shows gateway and service nodes', async ({ page, request }) => {
  await openGraphReview(page, request);
  await expect(page.getByTestId('graph-node-gateway')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('graph-node-core_service')).toBeVisible();
});

test('select payments shows payment provider node', async ({ page, request }) => {
  await openGraphReview(page, request, { payments: true });
  await expect(page.getByTestId('graph-node-payment_provider')).toBeVisible({ timeout: 15000 });
});

test('node details opens', async ({ page, request }) => {
  await openGraphReview(page, request);
  await page.getByTestId('architectural-graph-canvas').scrollIntoViewIfNeeded();
  await page.getByTestId('graph-node-gateway').click();
  await expect(page.getByTestId('graph-node-details').getByText('API Gateway')).toBeVisible();
  await expect(page.getByTestId('graph-node-details').getByText('Ownership')).toBeVisible();
});

test('edge exposes relationship metadata', async ({ page, request }) => {
  await openGraphReview(page, request);
  await expect(page.getByTestId('graph-node-gateway')).toBeVisible({ timeout: 15000 });
  const edgeTitle = await page.locator('svg[aria-label="Architectural edges"] title').evaluateAll((items) =>
    items.map((item) => item.textContent ?? '').find((text) => text.includes('gateway') && text.includes('core_service')),
  );
  expect(edgeTitle).toContain('route');
});

test('graph is mobile safe', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await openGraphReview(page, request);
  await expect(page.getByTestId('architectural-graph-canvas')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('graph-mobile-summary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBeTruthy();
});

test('graph keeps safe state when backend is offline', async ({ page, request }) => {
  await page.route('**/api/architectural-graph/preview', async (route) => route.abort('failed'));
  await openGraphReview(page, request);
  await expect(page.getByText('Architectural graph offline')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Architectural graph services are offline, but the selected blueprint remains safe.')).toBeVisible();
});

async function createSavedProject(request: APIRequestContext, accessToken: string) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const blueprintResponse = await request.post(`${API_URL}/blueprints/preview`, {
    headers,
    data: {
      project_name: 'ldcn-graph-snapshot-app',
      language_id: 'typescript',
      runtime_id: 'nodejs',
      framework_id: 'nestjs',
      architecture_id: 'modular_monolith',
      archetype_id: 'ai_saas',
      capability_ids: ['authentication', 'rbac', 'payments', 'observability'],
      business_module_ids: ['users', 'payments', 'reports'],
      endpoint_ids: ['auth.login', 'auth.me', 'payments.checkout'],
      locale: 'pt-BR',
      generation_mode: 'local_build_90',
    },
  });
  expect(blueprintResponse.ok()).toBeTruthy();
  const blueprint = await blueprintResponse.json();

  const promptResponse = await request.post(`${API_URL}/prompt-master/preview`, { headers, data: { blueprint } });
  expect(promptResponse.ok()).toBeTruthy();
  const prompt_master = await promptResponse.json();

  const gatekeeperResponse = await request.post(`${API_URL}/gatekeeper/preview`, { headers, data: { blueprint, prompt_master } });
  expect(gatekeeperResponse.ok()).toBeTruthy();
  const gatekeeper = await gatekeeperResponse.json();

  const saveResponse = await request.post(`${API_URL}/projects/save-from-wizard`, {
    headers,
    data: { blueprint, prompt_master, gatekeeper },
  });
  expect(saveResponse.ok()).toBeTruthy();
  return saveResponse.json();
}

test('project detail renders saved graph snapshot with preview offline', async ({ page, request }) => {
  const auth = await registerWizardApiUser(request);
  await applyAuthToPage(page, auth);
  const project = await createSavedProject(request, auth.tokens.access_token);
  expect(project.architectural_graph_snapshot.graph.nodes.length).toBeGreaterThan(0);
  await page.route('**/api/architectural-graph/preview', async (route) => route.abort('failed'));
  await page.goto(webUrl(`/projects/${project.project_id}`));
  await expect(page.getByText('Graph Snapshot')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('graph-node-app')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('graph-node-payment_provider')).toBeVisible();
});
