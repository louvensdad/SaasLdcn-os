import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';

function authFixture() {
  const now = '2026-06-25T00:00:00Z';
  return {
    user: {
      user_id: 'test-user',
      email: 'test@example.com',
      full_name: 'Test User',
      role: 'admin',
      locale: 'pt-BR',
      is_active: true,
      consent_accepted_at: now,
      consent_policy_version: '1.0.0',
      created_at: now,
      updated_at: now,
    },
    tokens: {
      access_token: 'test-access-token',
      token_type: 'bearer',
      expires_in: 3600,
    },
  };
}

async function mockAuth(page: Page) {
  const fixture = authFixture();
  await page.addInitScript((authResponse) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/auth/refresh')) {
        return new Response(JSON.stringify(authResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };
  }, fixture);
  await page.route('**/api/auth/refresh', async (route) => route.fulfill({ json: fixture }));
  await page.route('**/api/auth/me', async (route) => route.fulfill({ json: fixture.user }));
}function signal(id: string, label: string, detail: string, status: 'healthy' | 'warning' | 'blocked' = 'healthy') {
  return { contractVersion: '1.0.0', id, label, status, detail };
}

function systemStatusFixture() {
  return {
    contractVersion: '1.0.0',
    backend_status: signal('backend', 'Backend status', 'Foundation API v0.1.0'),
    frontend_status: signal('frontend', 'Frontend status', 'Next.js shell is present.'),
    api_status: signal('api', 'API status', 'Core API routers are registered locally.'),
    build_status: signal('build', 'Build status', 'Last validation passed.'),
    last_validation: '2026-06-02',
    test_coverage: 'Backend pytest and frontend build.',
    active_modules: ['api', 'web', 'contracts', 'templates', 'reports'],
    active_engines: ['skill_registry_engine', 'system_status_engine', 'prompt_master_engine'],
    active_templates: ['landing-page', 'docs-site', 'portfolio', 'static-site'],
    active_skills: ['review_blueprint', 'prepare_download', 'inspect_architecture'],
    planned_extensions: [],
    registry_health: [
      signal('templates', 'Active templates', '4 local templates indexed.'),
      signal('skills', 'Active skills', '16 operational skills registered.'),
      signal('engines', 'Active engines', '31 backend engines detected.'),
      signal('reports', 'Reports', 'Governance reports are stored locally.'),
    ],
  };
}

async function mockSystemStatus(page: Page) {
  await page.route('**/api/system-status', async (route) => route.fulfill({ json: systemStatusFixture() }));
}

async function openSystemStatus(page: Page) {
  await mockAuth(page);
  await mockSystemStatus(page);
  await page.goto(`${WEB_BASE}/system-status`);
  await expect(page.getByRole('heading', { name: /System Status|Status do Sistema/ })).toBeVisible();
}

test('active systems are collapsed by default', async ({ page }) => {
  await openSystemStatus(page);

  await expect(page.getByText(/31 (active engines|motores ativos)/)).toBeVisible();
  await expect(page.getByRole('button', { name: /View engines|Ver motores/ })).toBeVisible();
  await expect(page.getByText('prompt_master_engine')).toHaveCount(0);
});

test('View engines expands the engine list', async ({ page }) => {
  await openSystemStatus(page);

  await page.getByRole('button', { name: /View engines|Ver motores/ }).click();
  await expect(page.getByText('prompt_master_engine')).toBeVisible();
});

test('system filter finds prompt_master_engine', async ({ page }) => {
  await openSystemStatus(page);

  await page.getByLabel(/Filter systems|Filtrar sistemas/).fill('prompt');
  await expect(page.getByText('prompt_master_engine')).toBeVisible();
  await expect(page.getByText('architect_engine')).toHaveCount(0);
});

test('deploy mode hides full active system lists', async ({ page }) => {
  await openSystemStatus(page);

  await page.getByRole('button', { name: /Deploy mode|Modo Deploy/ }).click();
  await expect(page.getByTestId('deploy-mode-panel')).toBeVisible();
  await expect(page.getByTestId('active-systems-section')).toHaveCount(0);
  await expect(page.getByText('prompt_master_engine')).toHaveCount(0);
});

test('deploy mode shows blockers', async ({ page }) => {
  await openSystemStatus(page);

  await page.getByRole('button', { name: /Deploy mode|Modo Deploy/ }).click();
  await expect(page.getByTestId('deploy-blockers')).toBeVisible();
  await expect(page.getByText(/Blockers|Bloqueadores/)).toBeVisible();
  await expect(page.getByText(/No critical blockers|Nenhum bloqueador critico/)).toBeVisible();
});

test('mobile keeps technical groups collapsed without excessive page height', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSystemStatus(page);

  await expect(page.getByRole('button', { name: /View engines|Ver motores/ })).toBeVisible();
  await expect(page.getByText('prompt_master_engine')).toHaveCount(0);

  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.scrollHeight).toBeLessThan(2600);
});
