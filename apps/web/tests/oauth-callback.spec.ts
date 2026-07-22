import { expect, test } from '@playwright/test';

const auth = {
  user: {
    user_id: 'oauth-user',
    email: 'oauth@example.com',
    full_name: 'OAuth User',
    role: 'user',
    locale: 'pt-BR',
    is_active: true,
    consent_accepted_at: '2026-07-22T00:00:00Z',
    consent_policy_version: '2026-06-15',
    created_at: '2026-07-22T00:00:00Z',
    updated_at: '2026-07-22T00:00:00Z',
  },
  tokens: { access_token: 'short-lived-access-token', token_type: 'bearer', expires_in: 900 },
};

test('OAuth callback refreshes the HttpOnly session and opens the dashboard', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, json: null }));
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ json: auth }));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: auth.user }));

  await page.goto('/auth/callback?oauth=success');

  await expect(page).toHaveURL(/\/dashboard$/);
});

test('OAuth callback explains state validation failures and returns to login', async ({ page }) => {
  await page.goto('/auth/callback?oauth=error&reason=invalid_state');

  await expect(page.getByRole('heading', { name: 'Autenticação não concluída' })).toBeVisible();
  await expect(page.getByText(/validação de segurança expirou/i)).toBeVisible();
  await page.getByRole('button', { name: 'Voltar para o login' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
