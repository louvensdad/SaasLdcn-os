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

/**
 * Fills Step 1 ("Project Requirements") with the minimum data that satisfies
 * requirementsComplete (see wizard/page.tsx), then continues to Step 2
 * (Technology Path). The wizard used to open directly on the tech picker;
 * it now gates that behind this business-requirements step, which is why
 * every pre-existing spec that jumped straight to language/runtime/framework
 * chips (or clicked a "Technology Path" sidebar entry that no longer unlocks
 * without this) needs to run this first.
 */
export async function completeProjectRequirements(
  page: Page,
  overrides: Partial<{
    projectName: string;
    goal: string;
    problem: string;
    user: string;
    businessRules: string;
    workflows: string;
    entities: string;
    constraints: string;
    delivery: string;
  }> = {},
): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Project Requirements' })).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Project name').fill(overrides.projectName ?? 'wizard-regression-app');
  await page.getByRole('button', { name: overrides.goal ?? 'SaaS', exact: true }).click();
  await page.getByLabel('What problem will be solved?').fill(
    overrides.problem ?? 'Coordinate customer onboarding with auditable approvals.',
  );
  await page.getByRole('button', { name: overrides.user ?? 'Administrator', exact: true }).click();
  await page.getByLabel('Primary business rules').fill(overrides.businessRules ?? 'Only administrators approve accounts.');
  await page.getByLabel('5. Operational workflows').fill(
    overrides.workflows ?? 'Invite, review, approve, and activate an account.',
  );
  await page.getByLabel('Entities and relationships').fill(
    overrides.entities ?? 'User belongs to Organization and has Approval records.',
  );
  await page.getByLabel('Constraints').fill(overrides.constraints ?? 'RBAC, audit trail, and a 99.9% availability target.');
  await page.getByRole('combobox', { name: /^Delivery target/ }).selectOption(overrides.delivery ?? 'zip');
  await page.getByRole('button', { name: 'Continue to technology recommendations' }).click();
}

/** Full setup: authenticate, open /wizard, complete Step 1. Leaves the page on Step 2 (Technology Path). */
export async function openWizardAtTechnologyStep(
  page: Page,
  request: APIRequestContext,
  options: { emailPrefix?: string; requirements?: Parameters<typeof completeProjectRequirements>[1] } = {},
): Promise<void> {
  await authenticateWizardSession(page, request, options.emailPrefix);
  await page.goto('http://127.0.0.1:3000/wizard');
  await completeProjectRequirements(page, options.requirements);
}
