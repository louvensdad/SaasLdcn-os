import { expect, test, type Page } from '@playwright/test';

import { webUrl } from './test-urls';

const auth = {
  user: {
    user_id: 'pricing-user',
    email: 'pricing@example.com',
    full_name: 'Pricing User',
    role: 'user',
    locale: 'pt-BR',
    is_active: true,
    consent_accepted_at: '2026-07-02T00:00:00Z',
    consent_policy_version: '1.0.0',
    created_at: '2026-07-02T00:00:00Z',
    updated_at: '2026-07-02T00:00:00Z',
  },
  tokens: { access_token: 'pricing-token', token_type: 'bearer', expires_in: 3600 },
};

const plans = [
  {
    code: 'STUDENT', name: 'Estudante', audience: 'student', price_cents: 3000, currency: 'BRL',
    features: ['PROJECT_CREATE'], limits: { active_projects: 3, workspaces: 1, storage_bytes: 2 * 1024 ** 3 },
  },
  {
    code: 'BASIC', name: 'Básico', audience: 'individual', price_cents: null, currency: 'BRL',
    features: ['PROJECT_CREATE', 'BUILD_EXECUTE'], limits: { active_projects: 5, workspaces: 2, storage_bytes: 10 * 1024 ** 3 },
  },
  {
    code: 'ADVANCED', name: 'Avançado', audience: 'professional', price_cents: null, currency: 'BRL',
    features: ['PROJECT_CREATE', 'WORKSPACE_CREATE', 'AUTOMATION_EXECUTE'], limits: { active_projects: 20, workspaces: 10, storage_bytes: 50 * 1024 ** 3 },
  },
  {
    code: 'PRO', name: 'Pro', audience: 'business', price_cents: null, currency: 'BRL',
    features: ['PROJECT_CREATE', 'API_ACCESS', 'AI_OBSERVABILITY'], limits: { active_projects: 100, workspaces: 50, storage_bytes: 200 * 1024 ** 3 },
  },
];

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
  // matching route first, so anything more specific added later still wins):
  // the Sidebar/Topbar chrome now actually renders for this page (that was the
  // whole point of the redesign), and it touches several endpoints beyond what
  // this spec cares about (registry, ai-status, presence, preferences, ...). A
  // real backend happens to be reachable in this dev environment, so any of
  // those left unmocked would get a REAL 401 for this fake token and cascade
  // into a real logout instead of failing the specific assertion under test.
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, json: null }));
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ json: auth }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: auth.user }));
  await page.route('**/api/auth/me/avatar', (route) => route.fulfill({ json: { avatar_url: null } }));
  await page.route('**/api/organizations', (route) => route.fulfill({
    json: [{ organization_id: 'org-1', name: 'Acme', role: 'owner' }],
  }));
}

async function mockBillingHappyPath(page: Page, overrides: {
  trial?: unknown;
  subscription?: unknown;
  studentVerification?: unknown;
  studentSubmitResponse?: { status: number; json: unknown };
  subscribeResponse?: { status: number; json: unknown };
  cancelResponse?: { status: number; json: unknown };
} = {}) {
  await page.route('**/api/billing/plans', (route) => route.fulfill({ json: plans }));
  await page.route('**/api/billing/trial', (route) => route.fulfill({ json: overrides.trial ?? null }));
  await page.route('**/api/billing/subscription*', (route) => {
    if (route.request().method() === 'POST' && overrides.subscribeResponse) {
      return route.fulfill({ status: overrides.subscribeResponse.status, json: overrides.subscribeResponse.json });
    }
    return route.fulfill({ json: overrides.subscription ?? null });
  });
  await page.route('**/api/billing/subscription/cancel*', (route) => route.fulfill({
    status: overrides.cancelResponse?.status ?? 200,
    json: overrides.cancelResponse?.json ?? null,
  }));
  await page.route('**/api/billing/student/verification', (route) => {
    if (route.request().method() === 'POST' && overrides.studentSubmitResponse) {
      return route.fulfill({ status: overrides.studentSubmitResponse.status, json: overrides.studentSubmitResponse.json });
    }
    return route.fulfill({ json: overrides.studentVerification ?? null });
  });
}

function planCard(page: Page, code: string) {
  return page.getByTestId(`plan-card-${code}`);
}

test('renders all plan cards in Estudante, Básico, Avançado, Pro order', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page);
  await page.goto(webUrl('/pricing'));

  await expect(page.getByRole('heading', { name: 'Planos e Assinatura' })).toBeVisible();
  const cardTitles = page.locator('#plan-grid h3');
  await expect(cardTitles).toHaveText(['Estudante', 'Básico', 'Avançado', 'Pro']);
  await expect(page.getByText('Mais completo')).toBeVisible();
  await expect(page.getByText('Exclusivo para estudantes')).toBeVisible();
});

test('shows a back button and a Voltar ao Dashboard exit for authenticated users', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page);
  await page.goto(webUrl('/pricing'));

  await expect(page.getByRole('button', { name: 'Voltar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar ao Dashboard' })).toBeVisible();
});

test('back button falls back to Dashboard when there is no prior history', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page);
  await page.goto(webUrl('/pricing'));

  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('renders the Sidebar and Topbar breadcrumb for authenticated users (no orphaned page)', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page);
  await page.goto(webUrl('/pricing'));

  // Dashboard/Settings/account access is provided by this chrome, not by the
  // page itself -- that redundancy was one of the design problems being fixed.
  const sidebar = page.locator('aside').filter({ hasText: 'LDCN OS' });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Planos' })).toHaveAttribute('aria-current', 'page');
  const breadcrumb = page.getByRole('navigation', { name: 'Trilha de navegação' });
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb.getByRole('link', { name: 'Painel' })).toBeVisible();
  await expect(breadcrumb.getByRole('link', { name: 'Configurações' })).toBeVisible();
});

test('unauthenticated visitors see the page with no Sidebar/Topbar chrome (public route)', async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401, json: { detail: 'no session' } }));
  await mockBillingHappyPath(page);
  await page.goto(webUrl('/pricing'));

  await expect(page.getByRole('heading', { name: 'Planos e Assinatura' })).toBeVisible();
  await expect(page.locator('aside').filter({ hasText: 'LDCN OS' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar conta' }).first()).toBeVisible();
});

test('shows the current-subscription card with change-plan and cancel actions', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page, {
    subscription: { id: 'sub-1', organization_id: 'org-1', plan_code: 'PRO', status: 'ACTIVE', started_at: '2026-07-21T00:00:00Z', current_period_end: null, cancelled_at: null, created_by_user_id: 'pricing-user' },
  });
  await page.goto(webUrl('/pricing'));

  await expect(page.getByText('Pro').first()).toBeVisible();
  await expect(page.getByText('ACTIVE')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alterar plano' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar assinatura' })).toBeVisible();
});

test('cancellation requires an explicit confirmation modal with consequences', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page, {
    subscription: { id: 'sub-1', organization_id: 'org-1', plan_code: 'PRO', status: 'ACTIVE', started_at: '2026-07-21T00:00:00Z', current_period_end: null, cancelled_at: null, created_by_user_id: 'pricing-user' },
    cancelResponse: { status: 200, json: { id: 'sub-1', organization_id: 'org-1', plan_code: 'PRO', status: 'CANCELLED', started_at: '2026-07-21T00:00:00Z', current_period_end: null, cancelled_at: '2026-07-21T01:00:00Z', created_by_user_id: 'pricing-user' } },
  });
  await page.goto(webUrl('/pricing'));

  await page.getByRole('button', { name: 'Cancelar assinatura' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Tem certeza de que deseja cancelar o plano Pro?')).toBeVisible();
  await expect(dialog.getByText(/preservados/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Manter assinatura' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(page.getByText('Assinatura cancelada.')).toBeVisible();
});

test('subscribing opens a confirmation modal before calling the API', async ({ page }) => {
  await mockAuth(page);
  let subscribeCalled = false;
  await mockBillingHappyPath(page, {
    subscribeResponse: { status: 201, json: { id: 'sub-1', organization_id: 'org-1', plan_code: 'ADVANCED', status: 'ACTIVE', started_at: '2026-07-21T00:00:00Z', current_period_end: null, cancelled_at: null, created_by_user_id: 'pricing-user' } },
  });
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/billing/subscription') && !req.url().includes('cancel')) subscribeCalled = true;
  });
  await page.goto(webUrl('/pricing'));

  const advancedCard = planCard(page, 'ADVANCED');
  await advancedCard.getByRole('button', { name: 'Assinar' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Confirmar assinatura do Avançado')).toBeVisible();
  expect(subscribeCalled).toBe(false);

  await dialog.getByRole('button', { name: 'Confirmar assinatura' }).click();
  await expect(page.getByText('Assinatura do Avançado ativada.')).toBeVisible();
  expect(subscribeCalled).toBe(true);
});

test('view-all-features opens a modal with the plan full feature/limit list', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page);
  await page.goto(webUrl('/pricing'));

  const proCard = planCard(page, 'PRO');
  await proCard.getByRole('button', { name: 'Ver todos os recursos' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Recursos do Pro')).toBeVisible();
  await expect(dialog.getByText('Acesso à API')).toBeVisible();
});

test('comparison table is collapsed by default and expands on demand', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page);
  await page.goto(webUrl('/pricing'));

  await expect(page.getByText('Projetos ativos')).toHaveCount(0);
  await page.getByRole('button', { name: 'Comparar todos os planos' }).click();
  await expect(page.getByText('Projetos ativos')).toBeVisible();
});

test('student verification opens in a modal from within the Student plan card', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page, {
    studentSubmitResponse: { status: 201, json: { student_status: 'PENDING_VERIFICATION', student_document: 'pricing-user/abc.pdf', created_at: new Date().toISOString() } },
  });
  await page.goto(webUrl('/pricing'));

  const studentCard = planCard(page, 'STUDENT');
  await studentCard.getByRole('button', { name: 'Comprovar matrícula' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Comprovar matrícula', { exact: true })).toBeVisible();
  const input = dialog.locator('input[type="file"]');
  await input.setInputFiles({ name: 'comprovante.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') });
  await dialog.getByRole('button', { name: 'Enviar comprovante', exact: true }).click();
  await expect(dialog.getByText('Comprovante enviado com sucesso.')).toBeVisible();
});

test('closes modals with Escape (keyboard, no mouse)', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page);
  await page.goto(webUrl('/pricing'));

  const proCard = planCard(page, 'PRO');
  await proCard.getByRole('button', { name: 'Ver todos os recursos' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('shows a friendly, localized error (never the raw fetch error) and recovers on retry', async ({ page }) => {
  await mockAuth(page);
  // Every call gets the SAME 500 until the error is confirmed on screen, then
  // the route is swapped for a success response -- a counter keyed to call
  // count would race with React's dev-mode double effect invocation (the
  // effect can genuinely fire the request twice before either resolves).
  await page.route('**/api/billing/plans', (route) => route.fulfill({ status: 500, json: { error: { code: 'internal_server_error', message: 'Internal server error.', details: [] } } }));
  await page.route('**/api/billing/trial', (route) => route.fulfill({ json: null }));
  await page.route('**/api/billing/subscription*', (route) => route.fulfill({ json: null }));
  await page.route('**/api/billing/student/verification', (route) => route.fulfill({ json: null }));

  await page.goto(webUrl('/pricing'));

  await expect(page.getByText('Não foi possível carregar os planos no momento.')).toBeVisible();
  await expect(page.getByText('Failed to fetch')).toHaveCount(0);
  await expect(page.getByText('Carregando planos...')).toHaveCount(0);

  await page.unroute('**/api/billing/plans');
  await page.route('**/api/billing/plans', (route) => route.fulfill({ json: plans }));
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Básico')).toBeVisible();
});

test('renders in English when the interface locale is en-US', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('ldcn-locale-preferences', JSON.stringify({ state: { interfaceLocale: 'en-US' }, version: 0 }));
  });
  await mockAuth(page);
  await mockBillingHappyPath(page);

  await page.goto(webUrl('/pricing'));
  await expect(page.getByRole('heading', { name: 'Plans and Subscription' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
});

test('keeps the pricing page usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockAuth(page);
  await mockBillingHappyPath(page);

  await page.goto(webUrl('/pricing'));
  await expect(page.getByText('Básico')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('navigates from Dashboard to Pricing and back without a blank/white screen', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page);
  await page.route('**/api/system-status', (route) => route.fulfill({ json: {
    contractVersion: '1.0.0', backend_status: { contractVersion: '1.0.0', id: 'b', label: 'Backend', status: 'healthy', detail: '' },
    frontend_status: { contractVersion: '1.0.0', id: 'f', label: 'Frontend', status: 'healthy', detail: '' },
    api_status: { contractVersion: '1.0.0', id: 'a', label: 'API', status: 'healthy', detail: '' },
    build_status: { contractVersion: '1.0.0', id: 'bu', label: 'Build', status: 'healthy', detail: '' },
    last_validation: '2026-07-02T12:00:00Z', test_coverage: '', active_modules: [], active_engines: [], active_templates: [], active_skills: [], planned_extensions: [], registry_health: [],
  } }));
  await page.route('**/api/projects', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/ai-status', (route) => route.fulfill({ json: { ai_active: false, mode: 'deterministic_preview', providers: [] } }));
  await page.route('**/api/runtime/metrics', (route) => route.fulfill({ json: { cpu: { percent: 0 }, memory: { percent: 0 }, workers: { active: 0, total: 0 }, jobs_queued: 0 } }));
  await page.route('**/api/llm-settings/usage-stats', (route) => route.fulfill({ json: { requests: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, estimated_cost_usd: 0, cache_savings_usd: 0 } }));
  await page.route('**/api/activity-feed*', (route) => route.fulfill({ json: { items: [] } }));

  await page.goto(webUrl('/dashboard'));
  await page.goto(webUrl('/pricing'));
  await expect(page.getByRole('heading', { name: 'Planos e Assinatura' })).toBeVisible();
  await page.getByRole('link', { name: 'Painel' }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('body')).not.toBeEmpty();
});
