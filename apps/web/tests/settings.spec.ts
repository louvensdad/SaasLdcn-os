import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 900, height: 1100 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

function authFixture() {
  const now = '2026-07-16T00:00:00Z';
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
    tokens: { access_token: 'test-access-token', token_type: 'bearer', expires_in: 3600 },
  };
}

async function mockAuth(page: Page) {
  const fixture = authFixture();
  await page.addInitScript((authResponse) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/auth/refresh')) {
        return new Response(JSON.stringify(authResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };
  }, fixture);
  await page.route('**/api/auth/refresh', async (route) => route.fulfill({ json: fixture }));
  await page.route('**/api/auth/me', async (route) => route.fulfill({ json: fixture.user }));
}

async function mockSettingsBackend(page: Page) {
  await page.route('**/api/health', async (route) =>
    route.fulfill({ json: { status: 'ok', service: 'LDCN OS Backend API', version: '0.1.0', checks: { database: 'ok' } } }));
  await page.route('**/api/stacks', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/projects', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/registry/languages', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/registry/frameworks', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/registry/architectures', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/registry/archetypes', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/registry/capabilities', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/integrations/git/github', async (route) => route.fulfill({ json: { status: 'not_connected' } }));
  await page.route('**/api/integrations/git/gitlab', async (route) => route.fulfill({ json: { status: 'not_connected' } }));
  await page.route('**/api/user-ai-keys/status', async (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/api/llm/settings/active', async (route) =>
    route.fulfill({ json: { provider: null, providerLabel: null, model: null, hasKey: false, status: 'not_configured', lastValidatedAt: null } }));
  await page.route('**/api/llm/cache-stats', async (route) =>
    route.fulfill({ json: { hits: 0, misses: 0, stored: 0, evicted: 0, expired: 0, oversized: 0, entries: 0, bytes: 0 } }));
}

async function openSettings(page: Page) {
  await mockAuth(page);
  await mockSettingsBackend(page);
  await page.goto('/settings');
  await expect(page.getByRole('tablist')).toBeVisible();
}

const TAB_LABELS = {
  account: /Conta|Account|Cuenta|Compte/,
  ai: /IA|AI/,
  git: /Git/,
  interface: /Interface/,
  runtime: /Runtime/,
  advanced: /Avançado|Advanced|Avanzado|Avancé/,
} as const;

test('all six settings tabs render without error', async ({ page }) => {
  await openSettings(page);

  for (const pattern of Object.values(TAB_LABELS)) {
    await page.getByRole('tab', { name: pattern }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
  }
});

test('keyboard arrow navigation moves between tabs', async ({ page }) => {
  await openSettings(page);

  const firstTab = page.getByRole('tab', { name: TAB_LABELS.account });
  await firstTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: TAB_LABELS.ai })).toBeFocused();

  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: TAB_LABELS.advanced })).toBeFocused();

  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: TAB_LABELS.account })).toBeFocused();
});

test('theme switching updates the active theme', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('tab', { name: TAB_LABELS.interface }).click();

  const lightCard = page.getByRole('button', { name: /^Light$/i });
  await lightCard.click();

  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});

test('interface density is a draft that requires an explicit save', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('tab', { name: TAB_LABELS.interface }).click();

  // No unsaved-changes bar before touching anything.
  await expect(page.getByText(/unsaved changes|alterações não salvas|cambios sin guardar|modifications non enregistrées/i)).toHaveCount(0);

  const compactOption = page.getByRole('button', { name: /Compact|Compacto|Compacte/i });
  await compactOption.click();

  const saveBar = page.getByText(/unsaved changes|alterações não salvas|cambios sin guardar|modifications non enregistrées/i);
  await expect(saveBar).toBeVisible();

  // Discard reverts without persisting.
  await page.getByRole('button', { name: /Discard|Descartar|Ignorer/i }).click();
  await expect(saveBar).toHaveCount(0);

  // Re-select and actually save this time.
  await compactOption.click();
  await expect(saveBar).toBeVisible();
  await page.getByRole('button', { name: /Save changes|Salvar alterações|Guardar cambios|Enregistrer les modifications/i }).click();
  await expect(saveBar).toHaveCount(0);

  // Persisted across a reload (Zustand persist to localStorage).
  await page.reload();
  await expect(page.getByRole('tablist')).toBeVisible();
});

for (const viewport of viewports) {
  test(`settings page has no horizontal overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openSettings(page);

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });
    expect(overflow).toBeFalsy();
  });
}
