import { expect, type APIRequestContext, type Page } from '@playwright/test';

const API_BASE = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8001/api';

export interface WizardAuth {
  readonly user: Record<string, unknown>;
  readonly tokens: { readonly access_token: string; readonly token_type: string; readonly expires_in: number };
}

/** Registers a fresh backend user via a direct API call (no UI). Reuse the returned auth's access_token as a Bearer header for further direct API calls, and/or pass it to applyAuthToPage to also authenticate a page session. */
export async function registerWizardApiUser(request: APIRequestContext, emailPrefix = 'wizard'): Promise<WizardAuth> {
  const registration = await request.post(`${API_BASE}/auth/register`, {
    data: {
      email: `${emailPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: 'WizardTestPassword123!',
      full_name: 'Wizard Test User',
      locale: 'en-US',
      privacy_policy_accepted: true,
    },
  });
  expect(registration.ok()).toBe(true);
  return registration.json();
}

/**
 * Makes the page believe it's already authenticated with the given auth,
 * without driving the /login UI: window.fetch is patched (before any page
 * script runs) so /api/auth/refresh resolves with those tokens. /wizard
 * redirects to /login for an unauthenticated session, so every test that
 * opens the wizard needs this first.
 */
export async function applyAuthToPage(page: Page, auth: WizardAuth): Promise<void> {
  await page.addInitScript((auth) => {
    // addInitScript re-runs on every navigation AND on page.reload() within
    // this test -- only seed a default locale once, so a test that switches
    // locale via the UI and then reloads doesn't get silently reset back to
    // en-US on the next init-script run.
    if (!window.localStorage.getItem('ldcn-locale-preferences')) {
      window.localStorage.setItem(
        'ldcn-locale-preferences',
        JSON.stringify({
          state: {
            interfaceLocale: 'en-US',
            generatedProjectLocale: 'en-US',
            documentationLocale: 'en-US',
            codeCommentsLocale: 'en-US',
            fallbackLocale: 'en-US',
          },
          version: 0,
        }),
      );
    }
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      if (url.includes('/api/auth/refresh')) {
        return new Response(JSON.stringify(auth), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };
  }, auth);
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({ json: auth });
  });
}

/** Registers a fresh user and applies that session to the page in one call. */
export async function authenticateWizardSession(
  page: Page,
  request: APIRequestContext,
  emailPrefix = 'wizard',
): Promise<WizardAuth> {
  const auth = await registerWizardApiUser(request, emailPrefix);
  await applyAuthToPage(page, auth);
  return auth;
}
