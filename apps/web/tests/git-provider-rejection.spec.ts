import { expect, test } from '@playwright/test';

import { API_BASE_URL, webUrl } from './test-urls';

test('rejected GitHub token remains a recoverable inline error', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.route(`${API_BASE_URL}/integrations/git/*`, async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith('/connect')) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'git_provider_token_rejected',
            message: 'GitHub rejected the token. Update the token and try again.',
          },
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        provider: request.url().includes('/gitlab') ? 'gitlab' : 'github',
        status: 'disconnected',
        namespaces: [],
        repositories_count: 0,
        scopes: [],
        permission: 'none',
        schemaVersion: '1.0.0',
        generatedAt: new Date().toISOString(),
      }),
    });
  });

  await page.goto(webUrl('/settings'));
  // Git provider config now lives behind the Git tab's per-provider "Configure" dialog.
  await page.getByRole('tab', { name: /Git/ }).click();
  await page.getByRole('button', { name: /Configure|Configurar/ }).first().click();
  await page.getByLabel('GitHub access token').fill('invalid-token');
  await page.getByRole('button', { name: 'Connect GitHub' }).click();

  await expect(page.getByText('GitHub rejected the token. Update the token and try again.')).toBeVisible();
  await expect(page.getByLabel('GitHub access token')).toHaveValue('invalid-token');
  expect(pageErrors).toEqual([]);
});
