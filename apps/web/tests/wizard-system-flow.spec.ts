import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';

type AuthFixture = {
  user: {
    user_id: string;
    email: string;
    full_name: string;
    role: string;
    locale: string;
    is_active: boolean;
    consent_accepted_at: string;
    consent_policy_version: string;
    created_at: string;
    updated_at: string;
  };
  tokens: { access_token: string; token_type: string; expires_in: number };
};

async function openAuthenticatedWizard(page: Page, auth: AuthFixture) {
  await page.addInitScript((auth) => {
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
  await page.goto(`${WEB_BASE}/wizard`);
  await expect(page.getByRole('heading', { name: 'Project Requirements' })).toBeVisible();
}

test('authenticated wizard enforces every step and completes the governed preview chain', async ({ page, request }) => {
  const registration = await request.post('http://127.0.0.1:8001/api/auth/register', {
    data: {
      email: `wizard_${Date.now()}@example.com`,
      password: 'WizardTestPassword123!',
      full_name: 'Wizard Test User',
      locale: 'en-US',
      privacy_policy_accepted: true,
    },
  });
  expect(registration.ok()).toBe(true);
  const auth = (await registration.json()) as AuthFixture;
  await openAuthenticatedWizard(page, auth);

  const continueToTechnology = page.getByRole('button', { name: 'Continue to technology recommendations' });
  await expect(continueToTechnology).toBeDisabled();

  await page.getByLabel('Project name').fill('wizard-regression-app');
  await page.getByRole('button', { name: 'SaaS', exact: true }).click();
  await page.getByLabel('What problem will be solved?').fill('Coordinate customer onboarding with auditable approvals.');
  await page.getByRole('button', { name: 'Administrator', exact: true }).click();
  await page.getByLabel('Primary business rules').fill('Only administrators approve accounts.');
  await page.getByLabel('5. Operational workflows').fill('Invite, review, approve, and activate an account.');
  await page.getByLabel('Entities and relationships').fill('User belongs to Organization and has Approval records.');
  await page.getByLabel('Constraints').fill('RBAC, audit trail, and a 99.9% availability target.');
  await page.getByRole('combobox', { name: /^Delivery target/ }).selectOption('zip');
  await expect(continueToTechnology).toBeEnabled();
  await continueToTechnology.click();

  await page.getByRole('button', { name: 'TypeScript', exact: true }).click();
  await page.getByRole('button', { name: 'Node.js', exact: true }).click();
  await page.getByRole('button', { name: 'NestJS', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to Architecture' }).click();

  await page.getByRole('button', { name: 'Modular Monolith', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to Project Type' }).click();

  await page.getByRole('button', { name: 'AI SaaS', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to Capabilities' }).click();
  await page.getByRole('button', { name: 'View advanced capabilities' }).click();
  for (const capability of ['RBAC', 'Rate Limiting', 'Observability']) {
    const field = page.getByLabel(capability);
    if (!(await field.isChecked())) await field.check();
  }
  await page.getByRole('button', { name: 'Continue to Business Modules' }).click();

  const reports = page.getByLabel('Reports');
  if (!(await reports.isChecked())) await reports.check();
  await page.getByRole('button', { name: 'Continue to Endpoints' }).click();

  const continueToReview = page.getByRole('button', { name: 'Continue to Blueprint Review' });
  if (await continueToReview.isDisabled()) {
    await page.getByRole('button', { name: /Users Identity and account management\./ }).click();
    await page.getByRole('button', { name: 'Select recommended' }).click();
  }
  await expect(continueToReview).toBeEnabled();
  await continueToReview.click();

  await page.getByRole('button', { name: 'Preview blueprint' }).click();
  await expect(page.getByText('Blueprint validated.')).toBeVisible();
  await page.getByRole('button', { name: 'Preview Prompt Master' }).click();
  await expect(page.getByText('Valid Prompt Master')).toBeVisible();
  await page.getByRole('button', { name: 'Run Gatekeeper' }).click();
  await expect(page.getByRole('button', { name: 'Save Project' })).toBeEnabled();
});