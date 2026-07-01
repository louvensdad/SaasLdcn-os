import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';

function authFixture() {
  const now = '2026-07-01T00:00:00Z';
  return {
    user: {
      user_id: 'usage-user', email: 'usage@example.com', full_name: 'Usage User',
      role: 'admin', locale: 'pt-BR', is_active: true, consent_accepted_at: now,
      consent_policy_version: '1.0.0', created_at: now, updated_at: now,
    },
    tokens: { access_token: 'usage-token', token_type: 'bearer', expires_in: 3600 },
  };
}

function usageFixture() {
  return {
    period_days: 30,
    since: '2026-06-01T00:00:00Z',
    input_tokens: 120000,
    output_tokens: 45000,
    total_tokens: 165000,
    job_count: 7,
    by_model: [
      { model: 'claude-sonnet-4', input_tokens: 100000, output_tokens: 40000, job_count: 5 },
      { model: 'gpt-4o', input_tokens: 20000, output_tokens: 5000, job_count: 2 },
    ],
  };
}

async function mockUsage(page: Page) {
  const auth = authFixture();
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes('/api/meta-factory/jobs/usage')) return route.fulfill({ json: usageFixture() });
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

test('Meta-Factory idle state shows measured AI usage (B4/AI2)', async ({ page }) => {
  await mockUsage(page);
  // No ?projectId → idle state, where the self-contained usage card renders.
  await page.goto(`${WEB_BASE}/meta-factory`);

  await expect(page.getByText(/Uso de IA/)).toBeVisible();
  await expect(page.getByText('165.0k')).toBeVisible();       // total tokens
  await expect(page.getByText('claude-sonnet-4:', { exact: false })).toBeVisible();
});
