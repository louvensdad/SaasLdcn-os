import { expect, test, type Page, type Route } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';

function authFixture() {
  const now = '2026-07-02T00:00:00Z';
  return {
    user: {
      user_id: 'delivery-type-user', email: 'delivery@example.com', full_name: 'Delivery User',
      role: 'admin', locale: 'pt-BR', is_active: true, consent_accepted_at: now,
      consent_policy_version: '1.0.0', created_at: now, updated_at: now,
    },
    tokens: { access_token: 'delivery-token', token_type: 'bearer', expires_in: 3600 },
  };
}

function roomFixture(deliveryType: string) {
  const now = '2026-07-02T00:00:00Z';
  return {
    room_id: 'room-delivery-type', workspace_id: 'personal', title: 'Mobile idea',
    status: 'DRAFT', delivery_type: deliveryType, raw_intent: '', locale: 'pt-BR',
    confidence: 0, degraded: false, spec: null, open_questions: [], messages: [],
    prompt_master_md: null, prompt_master_versions: [], architecture_blueprint: null,
    blueprint_versions: [], active_blueprint_version: null, generation_handoff: null,
    readiness_checklist: [], engineering_review: null, architecture_model: null,
    workflow: null, history: [], operational_log: [], last_failure: null,
    created_at: now, updated_at: now,
  };
}

async function mockAuth(page: Page) {
  const auth = authFixture();
  // Broad catch-all (not just /api/auth/**): the app shell's CommandPalette is
  // mounted on every page and queries several /api/registry/* lists that must
  // resolve to arrays, or its useMemo throws and the whole page crashes.
  await page.route('**/api/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes('/api/registry/')) return route.fulfill({ status: 200, json: [] });
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

test('creating a Project Room sends the chosen delivery_type to the backend', async ({ page }) => {
  await mockAuth(page);
  let capturedBody: Record<string, unknown> | null = null;
  await page.route('**/api/project-rooms', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    capturedBody = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: roomFixture((capturedBody?.delivery_type as string) ?? 'web') });
  });
  await page.route('**/api/project-rooms/room-delivery-type', async (route: Route) =>
    route.fulfill({ json: roomFixture('mobile') }),
  );

  await page.goto(`${WEB_BASE}/project-rooms/new`);
  await page.getByPlaceholder('ex.: SaaS para clínica').fill('Pedidos Mobile');
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await page.getByRole('button', { name: /Criar sala/i }).click();

  await page.waitForURL(`${WEB_BASE}/project-rooms/room-delivery-type`);
  expect(capturedBody).not.toBeNull();
  expect((capturedBody as unknown as Record<string, unknown>).delivery_type).toBe('mobile');
});

test('the delivery type selector defaults to Web and highlights the active choice', async ({ page }) => {
  await mockAuth(page);
  await page.goto(`${WEB_BASE}/project-rooms/new`);

  const webButton = page.getByRole('button', { name: 'Web', exact: true });
  const mobileButton = page.getByRole('button', { name: 'Mobile', exact: true });
  await expect(webButton).toHaveAttribute('aria-pressed', 'true');
  await expect(mobileButton).toHaveAttribute('aria-pressed', 'false');

  await mobileButton.click();
  await expect(mobileButton).toHaveAttribute('aria-pressed', 'true');
  await expect(webButton).toHaveAttribute('aria-pressed', 'false');
});

for (const delivery of [
  { id: 'web', label: 'Web' },
  { id: 'backend', label: 'Backend (somente API)' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'full_stack', label: 'Web + Mobile' },
]) {
  test(`creation persists delivery_type=${delivery.id}`, async ({ page }) => {
    await mockAuth(page);
    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/api/project-rooms', async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: roomFixture((capturedBody?.delivery_type as string) ?? 'web') });
    });
    await page.route('**/api/project-rooms/room-delivery-type', async (route: Route) =>
      route.fulfill({ json: roomFixture(delivery.id) }),
    );

    await page.goto(`${WEB_BASE}/project-rooms/new`);
    await page.locator('input').first().fill(`Project ${delivery.id}`);
    await page.getByRole('button', { name: delivery.label, exact: true }).click();
    await page.getByRole('button', { name: /Criar sala/i }).click();

    await page.waitForURL(`${WEB_BASE}/project-rooms/room-delivery-type`);
    expect((capturedBody as Record<string, unknown> | null)?.delivery_type).toBe(delivery.id);
  });
}
