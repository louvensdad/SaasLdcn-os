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
    code: 'BASIC', name: 'Básico', audience: 'individual', price_cents: null, currency: 'BRL',
    features: ['PROJECT_CREATE', 'BUILD_EXECUTE'], limits: { active_projects: 3, workspaces: 1 },
  },
  {
    code: 'ADVANCED', name: 'Avançado', audience: 'professional', price_cents: null, currency: 'BRL',
    features: ['PROJECT_CREATE', 'WORKSPACE_CREATE'], limits: { active_projects: 15, workspaces: 5 },
  },
  {
    code: 'PRO', name: 'Pro', audience: 'business', price_cents: null, currency: 'BRL',
    features: ['PROJECT_CREATE', 'API_ACCESS'], limits: {},
  },
  {
    code: 'STUDENT', name: 'Estudante', audience: 'student', price_cents: 3000, currency: 'BRL',
    features: ['PROJECT_CREATE'], limits: { active_projects: 3 },
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
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ json: auth }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: auth.user }));
  await page.route('**/api/organizations', (route) => route.fulfill({
    json: [{ organization_id: 'org-1', name: 'Acme', role: 'owner' }],
  }));
}

async function mockBillingHappyPath(page: Page, overrides: {
  trial?: unknown;
  subscription?: unknown;
  studentVerification?: unknown;
  studentSubmitResponse?: { status: number; json: unknown };
} = {}) {
  await page.route('**/api/billing/plans', (route) => route.fulfill({ json: plans }));
  await page.route('**/api/billing/trial', (route) => route.fulfill({ json: overrides.trial ?? null }));
  await page.route('**/api/billing/subscription*', (route) => route.fulfill({ json: overrides.subscription ?? null }));
  // A single handler covers both GET (status lookup) and POST (upload) for this
  // URL -- Playwright only runs the LAST-registered route.route() for a given
  // pattern, so a second page.route() call on the same URL in a test would
  // shadow this one instead of composing with it.
  await page.route('**/api/billing/student/verification', (route) => {
    if (route.request().method() === 'POST' && overrides.studentSubmitResponse) {
      return route.fulfill({ status: overrides.studentSubmitResponse.status, json: overrides.studentSubmitResponse.json });
    }
    return route.fulfill({ json: overrides.studentVerification ?? null });
  });
}

test('renders all plan cards with real plan data on a successful load', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page);
  await page.goto(webUrl('/pricing'));

  await expect(page.getByRole('heading', { name: 'Planos e Assinatura' })).toBeVisible();
  await expect(page.getByText('Básico')).toBeVisible();
  await expect(page.getByText('Avançado')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estudante', exact: true })).toBeVisible();
  await expect(page.getByText('Preço em definição').first()).toBeVisible();
  await expect(page.getByText('Mais completo')).toBeVisible();
  await expect(page.getByText('Exclusivo para estudantes')).toBeVisible();
});

test('shows a friendly, localized error (never the raw fetch error) and recovers on retry', async ({ page }) => {
  await mockAuth(page);
  let attempt = 0;
  await page.route('**/api/billing/plans', (route) => {
    attempt += 1;
    if (attempt === 1) return route.fulfill({ status: 500, json: { error: { code: 'internal_server_error', message: 'Internal server error.', details: [] } } });
    return route.fulfill({ json: plans });
  });
  await page.route('**/api/billing/trial', (route) => route.fulfill({ json: null }));
  await page.route('**/api/billing/subscription*', (route) => route.fulfill({ json: null }));
  await page.route('**/api/billing/student/verification', (route) => route.fulfill({ json: null }));

  await page.goto(webUrl('/pricing'));

  await expect(page.getByText('Não foi possível carregar os planos no momento.')).toBeVisible();
  await expect(page.getByText('Verifique sua conexão ou tente novamente em alguns instantes.')).toBeVisible();
  await expect(page.getByText('Failed to fetch')).toHaveCount(0);
  await expect(page.getByText('HTTP 500')).toHaveCount(0);
  // Loading and error must never render together, and the stale skeleton must not linger.
  await expect(page.getByText('Carregando planos...')).toHaveCount(0);

  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Básico')).toBeVisible();
  await expect(page.getByText('Não foi possível carregar os planos no momento.')).toHaveCount(0);
});

test('shows an empty state instead of an infinite loading indicator when no plans exist', async ({ page }) => {
  await mockAuth(page);
  await page.route('**/api/billing/plans', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/billing/trial', (route) => route.fulfill({ json: null }));
  await page.route('**/api/billing/subscription*', (route) => route.fulfill({ json: null }));
  await page.route('**/api/billing/student/verification', (route) => route.fulfill({ json: null }));

  await page.goto(webUrl('/pricing'));
  await expect(page.getByText('Nenhum plano disponível no momento.')).toBeVisible();
  await expect(page.getByText('Carregando planos...')).toHaveCount(0);
});

test('shows active trial status with remaining time', async ({ page }) => {
  await mockAuth(page);
  const expiresAt = new Date(Date.now() + 5 * 3_600_000).toISOString();
  await mockBillingHappyPath(page, { trial: { status: 'ACTIVE', started_at: new Date().toISOString(), expires_at: expiresAt, converted_at: null } });

  await page.goto(webUrl('/pricing'));
  await expect(page.getByText('Teste gratuito ativo')).toBeVisible();
  await expect(page.getByText(/h restantes/)).toBeVisible();
});

test('shows expired-trial messaging with a choose-a-plan action', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page, {
    trial: { status: 'EXPIRED', started_at: '2026-01-01T00:00:00Z', expires_at: '2026-01-04T00:00:00Z', converted_at: null },
  });

  await page.goto(webUrl('/pricing'));
  await expect(page.getByText('Teste gratuito expirado').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escolher um plano' })).toBeVisible();
});

test('rejects an unsupported file client-side without calling the upload endpoint', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page);
  let uploadCalled = false;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/billing/student/verification')) uploadCalled = true;
  });

  await page.goto(webUrl('/pricing'));
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'comprovante.docx', mimeType: 'application/msword', buffer: Buffer.from('not a real document') });

  await expect(page.getByText('Tipo de arquivo não suportado. Envie PDF, JPG ou PNG.')).toBeVisible();
  expect(uploadCalled).toBe(false);
});

test('uploads a valid document and shows the success state', async ({ page }) => {
  await mockAuth(page);
  await mockBillingHappyPath(page, {
    studentSubmitResponse: {
      status: 201,
      json: { student_status: 'PENDING_VERIFICATION', student_document: 'pricing-user/abc123.pdf', created_at: new Date().toISOString() },
    },
  });

  await page.goto(webUrl('/pricing'));
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: 'comprovante.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') });
  await page.getByRole('button', { name: 'Enviar comprovante', exact: true }).click();

  await expect(page.getByText('Comprovante enviado com sucesso.')).toBeVisible();
  await expect(page.getByText('Em análise', { exact: true })).toBeVisible();
});

test('renders in English when the interface locale is en-US', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('ldcn-locale-preferences', JSON.stringify({ state: { interfaceLocale: 'en-US' }, version: 0 }));
  });
  await mockAuth(page);
  await mockBillingHappyPath(page);

  await page.goto(webUrl('/pricing'));
  await expect(page.getByRole('heading', { name: 'Plans and Subscription' })).toBeVisible();
  await expect(page.getByText('Price to be defined').first()).toBeVisible();
});

test('keeps the pricing page usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuth(page);
  await mockBillingHappyPath(page);

  await page.goto(webUrl('/pricing'));
  await expect(page.getByText('Básico')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
