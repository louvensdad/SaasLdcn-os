import { expect, test, type Page } from '@playwright/test';

import { webUrl } from './test-urls';

const authFixture = {
  user: {
    user_id: 'analytics-user',
    email: 'analytics@example.com',
    full_name: 'Analytics User',
    role: 'admin',
    locale: 'pt-BR',
    is_active: true,
    consent_accepted_at: '2026-06-28T00:00:00Z',
    consent_policy_version: '1.0.0',
    created_at: '2026-06-28T00:00:00Z',
    updated_at: '2026-06-28T00:00:00Z',
  },
  tokens: { access_token: 'analytics-test-token', token_type: 'bearer', expires_in: 3600 },
};

const analyticsFixture = {
  generated_at: '2026-06-28T15:00:00Z',
  metrics: [
    { id: 'projects_generated', label: 'Projetos gerados', value: 12, drilldown_count: 1 },
    { id: 'success_rate', label: 'Taxa de sucesso', value: 96.4, unit: 'percent', severity: 'positive' },
    { id: 'tokens_used', label: 'Tokens utilizados', value: 18400, unit: 'tokens' },
  ],
  filters: {
    workspaces: ['Core Platform'],
    providers: ['OpenAI'],
    stacks: ['Next.js'],
    statuses: ['ready'],
  },
  sections: [
    {
      id: 'projects',
      title: 'Project Analytics',
      description: 'Distribuição real do portfólio.',
      metrics: [{ id: 'ready', label: 'Prontos para deploy', value: 8 }],
      series: [
        { label: 'Sem 1', value: 3 },
        { label: 'Sem 2', value: 7 },
        { label: 'Sem 3', value: 12 },
      ],
      columns: ['id', 'name', 'status'],
      records: [{ id: 'project-1', metric_id: 'projects_generated', name: 'Atlas', status: 'ready', api_key: 'must-not-render' }],
    },
    {
      id: 'llm',
      title: 'LLM Analytics',
      series: [{ label: 'OpenAI', value: 18400 }],
      records: [{ id: 'run-1', provider: 'OpenAI', access_token: 'must-not-render' }],
    },
  ],
  api_key: 'must-not-render',
  raw_logs: ['sensitive'],
};

async function mockAuth(page: Page) {
  await page.addInitScript((auth) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes('/api/auth/refresh')) {
        return new Response(JSON.stringify(auth), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return original(input, init);
    };
  }, authFixture);
  await page.route('**/api/auth/refresh', async (route) => route.fulfill({ json: authFixture }));
  await page.route('**/api/auth/me', async (route) => route.fulfill({ json: authFixture.user }));
  await page.route('**/api/registry/**', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/ai-status', async (route) => route.fulfill({ json: { ai_active: false, mode: 'deterministic_preview', providers: [] } }));
}

test('shows a stable loading skeleton while telemetry is in flight', async ({ page }) => {
  await mockAuth(page);
  await page.route('**/api/analytics/overview**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ status: 404, json: { message: 'Not found' } });
  });
  await page.goto(webUrl('/analytics'));

  await expect(page.getByTestId('analytics-loading')).toBeVisible();
  await expect(page.getByTestId('analytics-empty-state')).toBeVisible();
});

test('renders professional empty state when the analytics endpoint is not available', async ({ page }) => {
  await mockAuth(page);
  await page.route('**/api/analytics/overview**', async (route) => route.fulfill({ status: 404, json: { message: 'Not found' } }));
  await page.goto(webUrl('/analytics'));

  await expect(page.getByTestId('analytics-page')).toBeVisible();
  await expect(page.getByTestId('analytics-empty-state')).toBeVisible();
  await expect(page.getByText('Analytics ainda está coletando dados.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir Meta-Fábrica/ })).toBeVisible();
});

test('renders real endpoint metrics, server filters and drill-down without secrets', async ({ page }) => {
  await mockAuth(page);
  let requestedUrl = '';
  await page.route('**/api/analytics/overview**', async (route) => {
    requestedUrl = route.request().url();
    await route.fulfill({ json: analyticsFixture });
  });
  await page.goto(webUrl('/analytics'));

  await expect(page.getByText('Projetos gerados')).toBeVisible();
  await expect(page.getByText('96,4%')).toBeVisible();
  await page.getByLabel('Workspace').selectOption('Core Platform');
  await expect.poll(() => requestedUrl).toContain('workspace=Core+Platform');

  await page.getByRole('button', { name: 'Abrir detalhes de Projetos gerados' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Atlas')).toBeVisible();
  await expect(page.getByText('must-not-render')).toHaveCount(0);
  await expect(page.getByText(/api_key|access_token|raw_logs/i)).toHaveCount(0);
});

test('shows endpoint failures without rendering stale invented values', async ({ page }) => {
  await mockAuth(page);
  await page.route('**/api/analytics/overview**', async (route) => route.fulfill({ status: 503, json: { message: 'collector unavailable' } }));
  await page.goto(webUrl('/analytics'));

  await expect(page.getByText('Não foi possível consultar Analytics')).toBeVisible();
  await expect(page.getByText('Projetos gerados')).toHaveCount(0);
});

test('keeps analytics usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuth(page);
  await page.route('**/api/analytics/overview**', async (route) => route.fulfill({ json: analyticsFixture }));
  await page.goto(webUrl('/analytics'));
  await expect(page.getByTestId('analytics-filter-bar')).toBeVisible();

  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});

test('profiles an uploaded CSV with quality, correlations and sortable data locally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuth(page);
  await page.route('**/api/analytics/overview**', async (route) => route.fulfill({ json: analyticsFixture }));
  await page.goto(webUrl('/analytics'));

  await page.locator('input[type="file"]').setInputFiles({
    name: 'vendas.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'region,revenue,cost',
      'Sul,100,60',
      'Norte,80,55',
      'Sudeste,140,75',
      'Sul,100,60',
    ].join('\n')),
  });

  await expect(page.getByText('vendas.csv')).toBeVisible();
  const tabs = page.getByRole('tab');
  await tabs.nth(1).click();
  await expect(page.getByText('revenue', { exact: true }).first()).toBeVisible();
  await tabs.nth(2).click();
  await expect(page.getByText(/revenue/).first()).toBeVisible();
  await tabs.nth(3).click();
  await expect(page.getByRole('button', { name: 'region' })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
