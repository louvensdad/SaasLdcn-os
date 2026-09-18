import { expect, test } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const COMPANY = '/p/room_5b9e2c71a0d4/missions/genjob_9f14c7b2e08a55/company';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('a seat nobody could fill reads differently from a seat not yet started', async ({ page }) => {
  await page.goto(COMPANY);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The company hired for this mission');
  await expect(page.getByText('nobody could be staffed')).toBeVisible();
  await expect(page.getByText('NO_CERTIFIED_SPECIALIST').first()).toBeVisible();
  await expect(page.getByText('No agent is certified for warehouse.dbt.')).toBeVisible();
});

test('the company map draws each seat with its own state and who it reports to', async ({ page }) => {
  await page.goto(COMPANY);
  const map = page.getByRole('group', { name: 'Company map' });
  await expect(map.getByRole('button', { name: 'Backend engineer: CERTIFIED' })).toBeVisible();
  await expect(map.getByRole('button', { name: 'Frontend engineer: QUALIFIED' })).toBeVisible();
  // Nobody could be staffed: the seat is drawn as unstaffed with the refusal code, never as merely waiting.
  const refused = map.getByRole('button', { name: 'Data engineer: Unstaffed' });
  await expect(refused).toContainText('NO_CERTIFIED_SPECIALIST');
  await refused.click();
  const inspector = page.getByRole('complementary', { name: 'Data engineer' });
  await expect(inspector).toContainText('The invoice export asks for a warehouse model.');
  await expect(inspector).toContainText('No cognitive run was recorded for this role.');
});

test('a refused unit of work is never drawn as merely blocked', async ({ page }) => {
  await page.goto(COMPANY);
  const refused = page.getByText('Invoice export model');
  await expect(refused).toBeVisible();
  await expect(page.getByText('Nobody in this company can do warehouse.dbt.')).toBeVisible();
  await expect(page.getByText('Waits for the invoice endpoints.')).toBeVisible();
  await expect(page.getByText('REFUSED is the platform saying')).toBeVisible();
});

test('an execution served by a fallback says so', async ({ page }) => {
  await page.goto(COMPANY);
  const row = page.getByRole('row', { name: /frontend_engineer/ });
  await expect(row).toContainText('FALLBACK');
});

test('an agent shows what it was hired as and what its runs say now', async ({ page }) => {
  await page.goto(`${COMPANY}/agents/ai_1`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Backend engineer');
  // The state is read as a sentence; the backend's own code stays reachable as the badge's title.
  await expect(page.getByText('Certified').first()).toBeVisible();
  await expect(page.getByText('Passed with reservations').first()).toBeVisible();
  await expect(page.locator('.badge', { hasText: 'Passed with reservations' }).first()).toHaveAttribute('title', 'QUALIFIED');
  await expect(page.getByText('The hired state is what the company was assembled under')).toBeVisible();
  // The latest cognitive run of the role, axis by axis, with the depth it was measured at.
  await expect(page.getByRole('img', { name: 'Axes passed in the latest cognitive run: 2 of 2' })).toBeVisible();
  await expect(page.getByText('refuses_without_evidence', { exact: true })).toBeVisible();
});

test('the workforce lists seats without a pipeline step and says which are certified', async ({ page }) => {
  await page.goto('/workforce');
  await expect(page.getByRole('row', { name: /Architect/ })).toContainText('architecture');
  await expect(page.getByText('12 runs · 9 passed · 2 failed')).toBeVisible();
  await expect(page.getByText('No run has been recorded for this definition.')).toBeVisible();
  await expect(page.getByText('Would refuse').first()).toBeVisible();
});

test('the planner composes a plan and names what it cannot cover', async ({ page }) => {
  await page.goto('/workforce/planner');
  const posted = page.waitForRequest((request) => request.url().endsWith('/api/workforce/plan') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Compose the plan' }).click();
  const request = await posted;
  expect(request.postDataJSON()).toMatchObject({ criticality: 'MEDIUM', auth: true });
  await expect(page.getByText('No security specialist is certified at depth deep.')).toBeVisible();
  await expect(page.getByText('data → backend → frontend')).toBeVisible();
  // Coverage: the gap is drawn on the competency it leaves open, and nobody is shown in a seat the plan could not staff.
  const security = page.getByRole('row', { name: /security_engineer/ });
  await expect(security).toContainText('Not staffed');
  await expect(security).toContainText('security.auth');
  await expect(security).toContainText('deep');
  await expect(page.getByRole('row', { name: /frontend_engineer/ })).toContainText('DERIVED_BELOW_HIRED');
  await expect(page.getByRole('group', { name: 'Build order' })).toContainText('HEALTHY');
});

test('the certification center separates an integrated run from a family record', async ({ page }) => {
  await page.goto('/library/certification');
  await expect(page.getByText('composition:nextjs+fastapi+postgres')).toBeVisible();
  await expect(page.getByText('integrated', { exact: true })).toBeVisible();
  await expect(page.getByText('Only the family record exists; the composition never ran together.')).toBeVisible();
  await expect(page.getByRole('row', { name: /frontend_engineer/ })).toContainText('FAILED');
});

test('the cognitive matrix shows every measured axis and marks the axes a role was never measured on', async ({ page }) => {
  await page.goto('/library/certification');
  const frontend = page.getByRole('row', { name: /frontend_engineer/ });
  // The frontend run measured one axis and failed it at shallow depth; the other axis stays an open gap, not a pass.
  await expect(frontend.getByRole('img', { name: 'command_becomes_proposal: FAILED' })).toBeVisible();
  await expect(frontend).toContainText('shallow');
  await expect(frontend.getByRole('img', { name: 'Not measured in this role’s latest run' })).toBeVisible();
  const backend = page.getByRole('row', { name: /backend_engineer/ });
  await expect(backend.getByRole('img', { name: 'refuses_without_evidence: PASSED' })).toBeVisible();
  // A composition's checks read as one line of gates.
  await expect(page.getByRole('group', { name: 'composition:nextjs+fastapi+postgres' })).toContainText('PASSED');
});

test('the units of work are drawn by served depth, and only the planner’s critical path is platinum', async ({ page }) => {
  await page.goto(COMPANY);
  const graph = page.getByRole('group', { name: 'Units of work' });
  await expect(graph.getByRole('button', { name: 'backend.invoices: READY' })).toBeVisible();
  await expect(graph.getByRole('button', { name: 'data.invoice_export: REFUSED' })).toBeVisible();
  await expect(graph.getByRole('button', { name: 'frontend.invoices: BLOCKED' })).toBeVisible();
  // critical_path is ['backend.invoices', 'frontend.invoices']: one platinum edge, and the refused export is off it.
  await expect(graph.locator('.gedge.e-critical')).toHaveCount(1);
  await expect(graph.locator('[data-node="cjob_1"] .svc-card.is-critical')).toHaveCount(1);
  await expect(graph.locator('[data-node="cjob_2"] .svc-card.is-critical')).toHaveCount(0);
  await graph.getByRole('button', { name: 'data.invoice_export: REFUSED' }).click();
  const inspector = page.getByRole('complementary', { name: 'Invoice export model' });
  await expect(inspector).toContainText('Not on the critical path');
  await expect(inspector).toContainText('backend.invoices');
});

test('a unit of work lights its own neighbourhood: what it waits on and what waits on it', async ({ page }) => {
  await page.goto(`${COMPANY.replace('/company', '')}/jobs/cjob_2`);
  const graph = page.getByRole('group', { name: 'Units of work' });
  await expect(graph.locator('[data-node="cjob_2"]')).toHaveClass(/is-lit/);
  await expect(graph.locator('[data-node="cjob_1"]')).toHaveClass(/is-lit/);
  await expect(graph.locator('[data-node="cjob_3"]')).toHaveClass(/is-dim/);
});
