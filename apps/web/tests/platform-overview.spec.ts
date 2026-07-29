import { expect, test, type Page } from '@playwright/test';

import { webUrl } from './test-urls';

const auth = {
  user: {
    user_id: 'platform-user',
    email: 'platform@example.com',
    full_name: 'Platform User',
    role: 'admin',
    locale: 'pt-BR',
    is_active: true,
    consent_accepted_at: '2026-07-02T00:00:00Z',
    consent_policy_version: '1.0.0',
    created_at: '2026-07-02T00:00:00Z',
    updated_at: '2026-07-02T00:00:00Z',
  },
  tokens: { access_token: 'platform-token', token_type: 'bearer', expires_in: 3600 },
};

function signal(id: string, label: string, status: 'healthy' | 'warning' | 'blocked' = 'healthy') {
  return { contractVersion: '1.0.0', id, label, status, detail: `${label} detail` };
}

const systemStatus = {
  contractVersion: '1.0.0',
  backend_status: signal('backend', 'Backend'),
  frontend_status: signal('frontend', 'Frontend'),
  api_status: signal('api', 'API'),
  build_status: signal('build', 'Build'),
  last_validation: '2026-07-02T12:00:00Z',
  test_coverage: 'Backend pytest and frontend build.',
  active_modules: ['api', 'web', 'contracts', 'templates', 'reports'],
  active_engines: ['architect_engine', 'orchestrator_engine', 'quality_gate_engine'],
  active_templates: ['landing-page', 'docs-site'],
  active_skills: ['review_blueprint', 'prepare_download', 'inspect_architecture'],
  planned_extensions: [],
  registry_health: [],
};

async function mockPlatform(page: Page) {
  await page.addInitScript((authResponse) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/auth/refresh')) {
        return new Response(JSON.stringify(authResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return original(input, init);
    };
  }, auth);
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ json: auth }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: auth.user }));
  await page.route('**/api/system-status', (route) => route.fulfill({ json: systemStatus }));
  await page.route('**/api/projects', (route) => route.fulfill({
    json: [
      { project_id: 'project-1', project_name: 'Atlas', readiness_status: 'ready' },
      { project_id: 'project-2', project_name: 'Orion', readiness_status: 'ready_with_warnings' },
    ],
  }));
  await page.route('**/api/ai-status', (route) => route.fulfill({ json: { ai_active: false, mode: 'deterministic_preview', providers: [] } }));
}

test('renders complete platform journeys, inventory and live health', async ({ page }) => {
  await mockPlatform(page);
  await page.goto(webUrl('/platform'));

  const overview = page.getByTestId('platform-overview');
  await expect(overview.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(overview.getByText('Uma sequência, cinco decisões verificáveis')).toBeVisible();
  await expect(overview.getByText('Criar um produto novo')).toBeVisible();
  await expect(overview.getByText('Modernizar um sistema existente')).toBeVisible();
  await expect(overview.getByText('Operar e governar').first()).toBeVisible();
  await expect(overview.getByText('Todos os módulos, organizados por responsabilidade')).toBeVisible();
  await expect(overview.getByText('Atlas')).toBeVisible();
  await expect(overview.getByText('Plataforma operacional')).toBeVisible();
});

test('keeps platform overview usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPlatform(page);
  await page.goto(webUrl('/platform'));
  await expect(page.getByTestId('platform-overview')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const visibleControls = [...document.querySelectorAll('a,button,select,input')].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && style.display !== 'none';
    });
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      smallControls: visibleControls.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      }).length,
      headings: document.querySelectorAll('h1').length,
    };
  });

  expect(metrics.overflow).toBe(false);
  expect(metrics.smallControls).toBe(0);
  expect(metrics.headings).toBe(1);
});
