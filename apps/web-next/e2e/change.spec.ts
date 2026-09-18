import { expect, test } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const CHANGE = '/p/room_5b9e2c71a0d4/engineering/changes/chg_6f0a4b12d7e9';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('the lifecycle shows where the change stands and what has not happened yet', async ({ page }) => {
  await page.goto(CHANGE);
  const line = page.getByRole('group', { name: 'Change lifecycle' });
  await expect(line).toContainText('Draft');
  await expect(line).toContainText('reached');
  await expect(line).toContainText('Analyzed');
  await expect(line).toContainText('NOT_RUN');
});

test('the change trace draws a diff that was never applied as planned, not as shipped code', async ({ page }) => {
  await page.goto(CHANGE);
  const trace = page.getByRole('group', { name: 'Change trace' });
  await expect(trace.getByRole('button', { name: 'backend/app/services/invoice_service.py: in scope' })).toBeVisible();
  const file = trace.getByRole('button', { name: 'backend/app/services/invoice_service.py: modified · not applied' });
  await expect(file).toBeVisible();
  await expect(trace.getByRole('button', { name: 'Build: NOT_RUN' })).toBeVisible();
  await expect(trace.getByRole('button', { name: 'Result: NOT_RUN' })).toBeVisible();
  await file.click();
  await expect(page.getByRole('complementary', { name: 'backend/app/services/invoice_service.py' })).toContainText('Planned only');
});

test('the architecture map traces a requirement to exactly the decisions that cite it', async ({ page }) => {
  await page.goto('/p/room_5b9e2c71a0d4/define/architecture');
  const map = page.getByRole('group', { name: 'Architecture map' });
  await map.getByRole('button', { name: 'Requirement: Invoices are issued by the store, never by the customer.' }).click();
  await expect(page.getByRole('complementary', { name: 'Requirement cited by the architect' })).toContainText('Cited by: backend, authorization');
  await expect(map.locator('[data-node="decision:backend"]')).toHaveClass(/is-lit/);
  await expect(map.locator('[data-node="decision:authorization"]')).toHaveClass(/is-lit/);
  await expect(map.locator('[data-node="decision:database"]')).toHaveClass(/is-dim/);

  // A dependency that names a decided area is drawn; one that names none stays as written.
  await map.getByRole('button', { name: 'frontend: Next.js with server-rendered catalogue' }).click();
  const inspector = page.getByRole('complementary', { name: 'Next.js with server-rendered catalogue' });
  await expect(inspector).toContainText('apis');
  await expect(inspector).toContainText('Locale from the spec');
});

test('a Test Room session reads as a line of gates, observed evidence drawn as proof and a skipped gate as not run', async ({ page }) => {
  await page.goto('/p/room_5b9e2c71a0d4/engineering/verification');
  const gates = page.getByRole('group', { name: 'Gates of session trs_88a1' });
  await expect(gates).toContainText('observed');
  await expect(gates).toContainText('failed');
  await expect(gates).toContainText('not_executed');
  await expect(gates.getByRole('img', { name: 'Build: proven' })).toBeVisible();
  await expect(gates.getByRole('img', { name: 'API: failed' })).toBeVisible();
});

test('the workbench traces a requirement to the gates, and files hang from the stage, never from an agent', async ({ page }) => {
  await page.goto('/p/room_5b9e2c71a0d4/engineering');
  const trace = page.getByRole('group', { name: 'Why this code exists' });
  await expect(trace.getByRole('button', { name: 'workflow:issue invoice' })).toBeVisible();
  await expect(trace.getByRole('button', { name: 'backend.invoices: READY' })).toBeVisible();
  await expect(trace.getByRole('button', { name: 'backend_engineer: SUCCESS' })).toBeVisible();
  await expect(trace.getByRole('button', { name: 'backend: running' })).toBeVisible();
  // The contracts stage wrote a file but no execution of this plan ran in it: it is not drawn.
  const files = trace.getByRole('button', { name: 'Files: 2 · backend' });
  await expect(files).toBeVisible();
  await expect(trace.getByRole('button', { name: 'Build: PENDING' })).toBeVisible();
  await expect(trace.getByRole('button', { name: 'API: failed' })).toBeVisible();

  await trace.getByRole('button', { name: 'Show the files written during backend' }).click();
  await expect(trace.getByRole('button', { name: 'backend/app/routes/invoices.py: valid: true' })).toBeVisible();
  await files.click();
  await expect(page.getByRole('complementary', { name: 'Files: 2' })).toContainText('Which agent wrote each one is not recorded');
});
