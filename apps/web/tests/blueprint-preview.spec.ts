import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openWizardAtTechnologyStep } from './wizard-flow-helpers';

async function goToBlueprintReview(page: Page, request: APIRequestContext) {
  await openWizardAtTechnologyStep(page, request);
  await page.locator('[data-option-id="typescript"]').click();
  await page.locator('[data-option-id="nodejs"]').click();
  await page.locator('[data-option-id="nestjs"]').click();
  await page.getByRole('button', { name: 'Continue to Architecture' }).click();

  await page.locator('[data-option-id="modular_monolith"]').click();
  await page.getByRole('button', { name: 'Continue to Project Type' }).click();

  await page.locator('[data-option-id="ai_saas"]').click();
  await page.getByRole('button', { name: 'Continue to Capabilities' }).click();
  await page.getByRole('button', { name: 'Continue to Business Modules' }).click();
  await page.getByLabel('Reports').check();
  await page.getByRole('button', { name: 'Continue to Endpoints' }).click();

  await page.getByRole('button', { name: /Users Identity and account management\./ }).click();
  await page.getByRole('button', { name: 'Continue to Blueprint Review' }).click();
  await expect(page.getByRole('heading', { name: 'Blueprint Review' })).toBeVisible();
}

async function goBackToCapabilities(page: Page) {
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Capabilities' })).toBeVisible();
}

async function buildHealthyGatekeeper(page: Page, request: APIRequestContext) {
  await goToBlueprintReview(page, request);

  await goBackToCapabilities(page);
  await page.getByRole('button', { name: 'View advanced capabilities' }).click();
  await page.getByLabel('RBAC').check();
  await page.getByLabel('Rate Limiting').check();
  await page.getByLabel('Observability').check();
  await page.getByRole('button', { name: 'Continue to Business Modules' }).click();
  await page.getByRole('button', { name: 'Continue to Endpoints' }).click();
  await page.getByRole('button', { name: 'Continue to Blueprint Review' }).click();

  await page.getByRole('button', { name: 'Preview blueprint' }).click();
  await expect(page.getByText('Valid blueprint')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Preview Prompt Master' }).click();
  await expect(page.getByText('Valid Prompt Master')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Run Gatekeeper' }).click();
  await expect(page.getByText('The Gatekeeper found warnings but did not block progression.')).toBeVisible({ timeout: 10000 });
}

test('wizard blueprint preview shows invalid selection from backend', async ({ page, request }) => {
  await goToBlueprintReview(page, request);

  await page.route('**/api/blueprints/preview', async (route) => {
    const response = await route.fetch();
    const blueprint = await response.json();
    await route.fulfill({
      json: {
        ...blueprint,
        validation: {
          ...blueprint.validation,
          valid: false,
          errors: [
            {
              code: 'endpoint_capabilities_missing',
              message: 'Endpoint POST /ai/chat requires capabilities: ai_chat.',
              related_item_ids: ['ai.chat', 'ai_chat'],
            },
          ],
        },
      },
    });
  });

  await page.getByRole('button', { name: 'Preview blueprint' }).click();
  await expect(page.getByText('Blueprint returned issues')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/requires capabilities: ai_chat/i)).toBeVisible();
});

test('wizard blueprint preview shows loading state', async ({ page, request }) => {
  await goToBlueprintReview(page, request);

  await page.route('**/api/blueprints/preview', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });

  await page.getByRole('button', { name: 'Preview blueprint' }).click();
  await expect(page.getByText('Building preview')).toBeVisible();
  await expect(page.getByText('Technology graph snapshot')).toBeVisible({ timeout: 10000 });
});

test('wizard blueprint preview shows request error state', async ({ page, request }) => {
  await goToBlueprintReview(page, request);

  await page.route('**/api/blueprints/preview', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'internal_server_error',
          message: 'Internal server error.',
          details: [],
        },
      }),
    });
  });

  await page.getByRole('button', { name: 'Preview blueprint' }).click();
  await expect(page.getByText('Blueprint preview failed')).toBeVisible({ timeout: 10000 });
});

test('wizard prompt master preview opens all required sections and supports copy', async ({ page, request }) => {
  await page.addInitScript(() => {
    const clipboardStore = { text: '' };
    Object.defineProperty(window, '__promptMasterClipboard', {
      value: clipboardStore,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (value: string) => {
          ((window as unknown) as { __promptMasterClipboard: { text: string } }).__promptMasterClipboard.text = value;
        },
      },
      configurable: true,
    });
  });

  await goToBlueprintReview(page, request);

  await page.getByRole('button', { name: 'Preview blueprint' }).click();
  await expect(page.getByText('Valid blueprint')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Preview Prompt Master' }).click();
  await expect(page.getByText('Valid Prompt Master')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Prompt Master sections', { exact: true })).toBeVisible();
  await expect(page.getByText('Product Intent', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Technology Graph', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Compiled Prompt Master').first()).toBeVisible();

  await page.getByRole('button', { name: 'Copy Prompt Master' }).click();
  await expect(page.getByText('Prompt Master copied')).toBeVisible({ timeout: 10000 });

  const copiedText = await page.evaluate(() => {
    return (window as { __promptMasterClipboard?: { text?: string } }).__promptMasterClipboard?.text ?? '';
  });
  expect(copiedText).toContain('1. Product Intent');
  expect(copiedText).toContain('15. Trace');
});

test('wizard prompt master preview shows offline request state', async ({ page, request }) => {
  await goToBlueprintReview(page, request);

  await page.getByRole('button', { name: 'Preview blueprint' }).click();
  await expect(page.getByText('Valid blueprint')).toBeVisible({ timeout: 10000 });

  await page.route('**/api/prompt-master/preview', async (route) => {
    await route.abort('failed');
  });

  await page.getByRole('button', { name: 'Preview Prompt Master' }).click();
  await expect(page.getByText('Prompt Master preview failed')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Backend is offline or unreachable.').first()).toBeVisible({ timeout: 10000 });
});

test('wizard gatekeeper preview approves a healthy blueprint and prompt master pair', async ({ page, request }) => {
  await buildHealthyGatekeeper(page, request);
  await expect(page.getByText('The Gatekeeper found warnings but did not block progression.')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Gatekeeper report')).toBeVisible();
  await expect(page.getByText('Gatekeeper checks', { exact: true })).toBeVisible();
});

test('wizard gatekeeper preview blocks an invalid blueprint and prompt master pair', async ({ page, request }) => {
  await goToBlueprintReview(page, request);

  await page.getByRole('button', { name: /Capabilities Start with recommended capabilities/i }).click();
  await expect(page.getByRole('heading', { name: 'Capabilities' })).toBeVisible();
  await page.getByLabel('AI Chat').uncheck();
  await page.getByRole('button', { name: 'Continue to Business Modules' }).click();
  await page.getByRole('button', { name: 'Continue to Endpoints' }).click({ force: true });
  await page.getByRole('button', { name: /Notifications User and system notifications\./ }).click();
  await page.getByLabel('POST /ai/chat').check();
  await page.getByRole('button', { name: 'Continue to Blueprint Review' }).click();

  await page.getByRole('button', { name: 'Preview blueprint' }).click();
  await expect(page.getByText('Blueprint returned issues')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Preview Prompt Master' }).click();
  await expect(page.getByText('Prompt Master returned issues')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Run Gatekeeper' }).click();
  await expect(page.getByText('blocked', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Blockers', { exact: true })).toBeVisible();
});

test('wizard gatekeeper preview shows offline request state', async ({ page, request }) => {
  await goToBlueprintReview(page, request);

  await page.getByRole('button', { name: 'Preview blueprint' }).click();
  await expect(page.getByText('Valid blueprint')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Preview Prompt Master' }).click();
  await expect(page.getByText('Valid Prompt Master')).toBeVisible({ timeout: 10000 });

  await page.route('**/api/gatekeeper/preview', async (route) => {
    await route.abort('failed');
  });

  await page.getByRole('button', { name: 'Run Gatekeeper' }).click();
  await expect(page.getByText('Gatekeeper preview failed')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Backend is offline or unreachable.').first()).toBeVisible({ timeout: 10000 });
});

test('wizard save flow persists a project and opens detail page', async ({ page, request }) => {
  await buildHealthyGatekeeper(page, request);

  await page.getByRole('button', { name: 'Save Project' }).click();
  await expect(page).toHaveURL(/\/projects\/project_[a-f0-9]+/);
  // The project detail page is "Project Experience V2" -- it shows a live
  // dashboard (preview, tech verification, timeline), not the old raw
  // blueprint/prompt-master/gatekeeper summary sections.
  await expect(page.getByRole('heading', { name: 'wizard-regression-app' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Project Experience V2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Technology Verified' })).toBeVisible();

  await page.goto('http://127.0.0.1:3000/projects');
  await expect(page.getByText('wizard-regression-app').first()).toBeVisible({ timeout: 10000 });
});

test('wizard save flow shows offline request state', async ({ page, request }) => {
  await buildHealthyGatekeeper(page, request);

  await page.route('**/api/projects/save-from-wizard', async (route) => {
    await route.abort('failed');
  });

  await page.getByRole('button', { name: 'Save Project' }).click();
  await expect(page.getByText('Project save failed').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Backend is offline or unreachable.').first()).toBeVisible({ timeout: 10000 });
});
