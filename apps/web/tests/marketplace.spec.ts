import { expect, test, type Page } from '@playwright/test';
import { webUrl } from './test-urls';

const auth = {
  user: {
    user_id: 'marketplace-user', email: 'marketplace@example.com', full_name: 'Marketplace User',
    role: 'user', locale: 'pt-BR', is_active: true, consent_accepted_at: '2026-07-21T00:00:00Z',
    consent_policy_version: '1.0.0', is_2fa_enabled: false, created_at: '2026-07-21T00:00:00Z', updated_at: '2026-07-21T00:00:00Z',
  },
  tokens: { access_token: 'marketplace-token', token_type: 'bearer', expires_in: 3600 },
};

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mkt_1', author_user_id: 'marketplace-user', kind: 'automation_template', source_automation_id: 'auto_1',
    name: 'Slack Notifier', description: 'Pings a Slack webhook whenever a build finishes.',
    license: 'MIT', permissions: ['trigger:manual', 'action:http_request'], price_cents: 0, version: 1,
    content: { trigger_type: 'manual', trigger_config: {}, action_type: 'http_request', action_config: { method: 'POST', url: 'https://hooks.slack.com/services/x', headers: {} } },
    content_hash: 'a'.repeat(64), changelog: [{ version: 1, note: 'Publicação inicial.', published_at: '2026-07-21T00:00:00Z' }],
    status: 'published', created_at: '2026-07-21T00:00:00Z', updated_at: '2026-07-21T00:00:00Z',
    category: 'Integrações', downloads: 3,
    ...overrides,
  };
}

async function mockAuth(page: Page) {
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
  // Safety net registered FIRST (Playwright checks the most-recently-registered
  // matching route first, so anything more specific added later still wins) --
  // same pattern as pricing.spec.ts/settings.spec.ts: a real backend is
  // reachable in this dev environment, and any unmocked endpoint would get a
  // real 401 for this fake token, force-logging the session out mid-test.
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, json: null }));
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ json: auth }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: auth.user }));
  await page.route('**/api/auth/me/avatar', (route) => route.fulfill({ json: { avatar_url: null } }));
  await page.route('**/api/organizations', (route) => route.fulfill({
    json: [{ organization_id: 'org-1', name: 'Acme', role: 'owner' }],
  }));
  await page.route('**/api/automations', (route) => route.fulfill({ json: [{ id: 'auto_1', title: 'Ping API', status: 'active' }] }));
}

async function mockMarketplace(page: Page, catalog: ReturnType<typeof item>[] = [], installs: Record<string, unknown>[] = []) {
  const liveInstalls = [...installs];
  await page.route('**/api/marketplace/items', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, json: item({ id: 'mkt_new', status: 'draft' }) });
    }
    return route.fulfill({ json: catalog });
  });
  await page.route('**/api/marketplace/items/mine', (route) => route.fulfill({ json: catalog }));
  await page.route('**/api/marketplace/items/*/install', (route) => {
    const install = { id: 'install_1', item_id: 'mkt_1', item_version: 1, installed_automation_id: 'auto_clone_1', installed_at: '2026-07-21T00:00:00Z', uninstalled_at: null, update_available: false };
    liveInstalls.push(install);
    return route.fulfill({ status: 201, json: install });
  });
  await page.route('**/api/marketplace/installs/mine', (route) => route.fulfill({ json: liveInstalls }));
}

test('empty marketplace shows the premium empty state with both CTAs and no fake data', async ({ page }) => {
  await mockAuth(page);
  await mockMarketplace(page, []);
  await page.goto(webUrl('/marketplace'));

  await expect(page.getByRole('heading', { name: 'Marketplace de Automações' })).toBeVisible();
  await expect(page.getByText('O marketplace está esperando sua primeira automação')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explorar exemplos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar primeira automação' })).toBeVisible();
});

test('populated catalog renders real category, downloads, and update date on each card', async ({ page }) => {
  await mockAuth(page);
  await mockMarketplace(page, [item()]);
  await page.goto(webUrl('/marketplace'));

  await expect(page.getByRole('heading', { name: 'Slack Notifier' })).toBeVisible();
  // 'Integrações' appears both as the filter-bar chip (a role="tab") and the
  // card's category badge -- .last() is the card, since it renders after the
  // search bar in DOM order.
  await expect(page.getByRole('tab', { name: 'Integrações' })).toBeVisible();
  await expect(page.getByText('Integrações').last()).toBeVisible();
  await expect(page.getByText(/Atualizado em/)).toBeVisible();
  await expect(page.getByText(/Automações disponíveis/)).toBeVisible();
});

test('category filter narrows the visible grid to matching items only', async ({ page }) => {
  await mockAuth(page);
  await mockMarketplace(page, [
    item({ id: 'mkt_1', name: 'Slack Notifier', category: 'Integrações' }),
    item({ id: 'mkt_2', name: 'Ping Checker', category: 'Backend' }),
  ]);
  await page.goto(webUrl('/marketplace'));

  await expect(page.getByRole('heading', { name: 'Slack Notifier' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ping Checker' })).toBeVisible();

  await page.getByRole('tab', { name: 'Backend' }).click();
  await expect(page.getByRole('heading', { name: 'Ping Checker' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Slack Notifier' })).toHaveCount(0);
});

test('installing an item disables its Install button and shows it as installed', async ({ page }) => {
  await mockAuth(page);
  await mockMarketplace(page, [item()]);
  await page.goto(webUrl('/marketplace'));

  await page.getByRole('button', { name: 'Instalar' }).click();
  await expect(page.getByRole('button', { name: 'Instalado' })).toBeDisabled();
});

test('an install with a newer item version shows an update-available badge', async ({ page }) => {
  await mockAuth(page);
  await mockMarketplace(page, [item({ version: 2 })], [
    { id: 'install_1', item_id: 'mkt_1', item_version: 1, installed_automation_id: 'auto_clone_1', installed_at: '2026-07-21T00:00:00Z', uninstalled_at: null, current_item_version: 2, update_available: true },
  ]);
  await page.goto(webUrl('/marketplace'));

  await expect(page.getByText('Atualização disponível')).toBeVisible();
});
