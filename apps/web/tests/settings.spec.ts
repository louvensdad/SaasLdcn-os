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
      is_2fa_enabled: false,
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
    route.fulfill({ json: { status: 'ok', service: 'LDCN OS Backend API', version: '0.1.0', checks: { database: 'ok' } } }));  await page.route('**/api/system-status', async (route) => route.fulfill({ json: { backend_status: { status: 'healthy' }, api_status: { status: 'healthy' }, active_modules: [], active_engines: [] } }));
  await page.route('**/api/ai-status', async (route) => route.fulfill({ json: { status: 'healthy', providers: [] } }));
  await page.route('**/api/activity-feed**', async (route) => route.fulfill({ json: { items: [], next_cursor: null, has_more: false } }));
  await page.route('**/api/users/me/preferences/**', async (route) => route.fulfill({ json: { data: {} } }));
  await page.route('**/api/runtime/metrics', async (route) => route.fulfill({ json: { cpu: null, memory: null, disk: null, uptime_seconds: 0, workers: { total: 0, active: 0, idle: 0 }, jobs_queued: 0, jobs_running: 0 } }));
  await page.route('**/api/runtime/config', async (route) => route.fulfill({ json: { workerLimit: 1, executionTimeoutMinutes: 30, logRetentionDays: 30 } }));
  await page.route('**/api/runtime/telemetry', async (route) => route.fulfill({ json: { contractVersion: '1', collectedAt: new Date().toISOString(), components: [] } }));
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
  await page.route('**/api/auth/me/avatar', async (route) => route.fulfill({ json: { avatar_url: null } }));
  await page.route('**/api/auth/me/sessions', async (route) =>
    route.fulfill({
      json: [
        {
          session_id: 'session_1',
          ip_address: '189.84.***.27',
          device_label: 'macOS · Chrome 126',
          created_at: '2026-07-16T10:42:00Z',
          last_seen_at: '2026-07-16T10:42:00Z',
          is_current: true,
        },
      ],
    }));
  await page.route('**/api/workspaces/default', async (route) =>
    route.fulfill({
      json: {
        workspace_id: 'ws_1',
        organization_id: 'org_1',
        name: 'Fundação LDCN OS',
        slug: 'fundacao-ldcn-os',
        is_personal: true,
        role: 'owner',
        created_at: '2026-06-15T00:00:00Z',
        updated_at: '2026-06-15T00:00:00Z',
      },
    }));
  await page.route('**/api/workspaces/*/members', async (route) =>
    route.fulfill({
      json: [
        { workspace_id: 'ws_1', user_id: 'test-user', email: 'test@example.com', full_name: 'Test User', role: 'owner', created_at: '2026-06-15T00:00:00Z' },
      ],
    }));
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

test('account tab shows real session, 2FA and workspace context', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('tab', { name: TAB_LABELS.account }).click();

  const panel = page.getByRole('tabpanel');
  // Real device/session context from GET /auth/me/sessions.
  await expect(panel.getByText('macOS · Chrome 126')).toBeVisible();
  await expect(panel.getByText('189.84.***.27')).toBeVisible();
  // Workspace card backed by GET /workspaces/default (+ members count).
  await expect(panel.getByText('Fundação LDCN OS').first()).toBeVisible();
  await expect(panel.getByRole('button', { name: /Manage workspace|Gerenciar workspace|Gestionar espacio|Gérer l'espace/i })).toBeVisible();

  // Photo upload control is real (enabled), not a "coming soon" placeholder.
  await expect(panel.getByRole('button', { name: /Change photo|Alterar foto|Cambiar foto|Changer la photo/i })).toBeEnabled();
  // Danger zone now has the Deactivate row too.
  await expect(panel.getByText(/Deactivate account|Desativar conta|Desactivar cuenta|Désactiver le compte/i)).toBeVisible();

  // Opening the sessions dialog lists the current session and offers revoke-all.
  await panel.getByRole('button', { name: /Manage sessions|Gerenciar sessões|Gestionar sesiones|Gérer les sessions/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('macOS · Chrome 126')).toBeVisible();
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

test('interface density is a draft committed by the header Salvar alterações button', async ({ page }) => {
  await openSettings(page);
  await page.getByRole('tab', { name: TAB_LABELS.interface }).click();

  const compactOption = page.getByRole('button', { name: /Compact|Compacto|Compacte/i });
  await compactOption.click();
  await expect(compactOption).toHaveAttribute('aria-pressed', 'true');

  // The header's save button is real and always present (matches the
  // reference), not a conditional "N unsaved changes" bar.
  const saveButton = page.getByRole('button', { name: /Save changes|Salvar alterações|Guardar cambios|Enregistrer les modifications/i });
  await expect(saveButton).toBeVisible();
  await saveButton.click();

  // Persisted across a reload (Zustand persist to localStorage) -- switch to
  // the Interface tab again and confirm Compact is still selected.
  await page.reload();
  await expect(page.getByRole('tablist')).toBeVisible();
  await page.getByRole('tab', { name: TAB_LABELS.interface }).click();
  await expect(page.getByRole('button', { name: /Compact|Compacto|Compacte/i })).toHaveAttribute('aria-pressed', 'true');
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
