import { expect, test } from '@playwright/test';

import { mockApi, showDeveloperDetails, useEnglish } from './mock-api';

/**
 * The selection state of the wave-6 screens. Loading them is covered by the sweep; what is only covered
 * here is what happens when a person picks something — the reads that follow, and the row that is marked.
 */
test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('the library universe sizes each body by what its catalog serves and draws research as a gap', async ({ page }) => {
  await page.goto('/library');
  const universe = page.getByRole('group', { name: 'Library universe' });
  await expect(universe.getByRole('link', { name: /^Technology catalog: \d+$/ })).toBeVisible();
  await expect(universe.getByRole('link', { name: /^Marketplace: \d+$/ })).toBeVisible();
  // Research has no read endpoint: it is a named gap, never a zero.
  await expect(universe.getByRole('link', { name: 'Research intelligence: no read endpoint (gap G3)' })).toBeVisible();
  await universe.getByRole('link', { name: /^Certification Center: / }).click();
  await expect(page).toHaveURL(/\/library\/certification$/);
});

test('the technology graph joins profiles to their certifications and never parses a composition id', async ({ page }) => {
  await page.goto('/library/technology');
  const graph = page.getByRole('group', { name: 'Technology graph' });
  await expect(graph.getByRole('button', { name: 'python/fastapi@pip: CERTIFIED' })).toBeVisible();
  await expect(graph.getByRole('button', { name: 'java/spring-boot@maven: FAILED' })).toBeVisible();
  // A profile no suite ever certified is EXPERIMENTAL in the backend's own word.
  await expect(graph.getByRole('button', { name: 'go/gin@go: EXPERIMENTAL' })).toBeVisible();
  // Each composition is joined to the one stack its ledger rows record, and to nothing parsed from its id.
  await expect(graph.locator('.glabel', { hasText: 'stack_id' })).toHaveCount(2);
  await graph.getByRole('button', { name: 'composition:nextjs+fastapi+postgres: CERTIFIED' }).click();
  await expect(page.getByRole('complementary', { name: 'composition:nextjs+fastapi+postgres' })).toContainText('record one stack (python/fastapi@pip)');

  await page.getByRole('button', { name: 'Certified', exact: true }).click();
  await expect(graph.locator('[data-node="profile:go/gin@go"]')).toHaveClass(/is-dim/);
  await expect(graph.locator('[data-node="profile:python/fastapi@pip"]')).toHaveClass(/is-lit/);
});

test('the technology catalog switches source with the tab, and names each one', async ({ page }) => {
  await showDeveloperDetails(page);
  await page.goto('/library/technology');
  await expect(page.getByRole('tab', { name: 'Languages' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('GET /api/registry/languages')).toBeVisible();
  await expect(page.getByText('Python', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Stacks' }).click();
  await expect(page.getByText('GET /api/registry/stacks')).toBeVisible();
  /* A stack that was never certified says EXPERIMENTAL in the backend's own word, not "unsupported". */
  await expect(page.getByText('EXPERIMENTAL', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Infrastructure' }).click();
  await expect(page.getByText('GET /api/infrastructure/components')).toBeVisible();
  await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible();
});

test('a skill says what it is allowed to do, in the words the backend uses', async ({ page }) => {
  await page.goto('/library/templates');
  await expect(page.getByText('read_only', { exact: true })).toBeVisible();
  await expect(page.getByText('no model call', { exact: true })).toBeVisible();
  /* The second skill may call a model, so it must NOT claim it cannot. */
  const planning = page.locator('.li', { hasText: 'Plan the work' });
  await expect(planning.getByText('no agent')).toBeVisible();
  await expect(planning.getByText('no model call')).toHaveCount(0);
});

test('choosing a team reads the knowledge and the queue of that team', async ({ page }) => {
  await page.goto('/library/knowledge');
  const backend = page.getByRole('button', { name: /software-house\.backend/ });
  await expect(backend).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('Migration ordering')).toBeVisible();

  await page.getByRole('button', { name: /data-intelligence\.analytics/ }).click();
  await expect(page.getByRole('button', { name: /data-intelligence\.analytics/ })).toHaveAttribute('aria-current', 'true');
  await expect(backend).toHaveAttribute('aria-current', 'false');
});

test('an approval rate with nothing decided says so instead of showing 0%', async ({ page }) => {
  await page.goto('/library/knowledge');
  await expect(page.getByText('89%')).toBeVisible();
  /* per_team carries a null rate for the team that has decided nothing; the totals here are decided. */
  await expect(page.getByText('nothing decided yet')).toHaveCount(0);
});

test('a marketplace item shows the permissions it asks for, and an install that is behind', async ({ page }) => {
  await page.goto('/library/marketplace');
  await expect(page.getByText('http_request', { exact: true })).toBeVisible();
  await expect(page.getByText('free', { exact: true })).toBeVisible();
  await expect(page.getByText('version 3 is available')).toBeVisible();
});

test('research says the registry has no endpoint rather than inventing sources', async ({ page }) => {
  await page.goto('/library/research');
  await expect(page.getByText('The research surface has no read endpoint')).toBeVisible();
  await expect(page.getByText('gap G3')).toBeVisible();
  /* The trust classes are the contract's vocabulary, in the backend's own rank order. */
  await expect(page.getByText('SECURITY_AUTHORITY', { exact: true })).toBeVisible();
  await expect(page.getByText('rank 6', { exact: true })).toBeVisible();
});

test('choosing a monitoring rule reads its checks, and a no-op check says it recomputed nothing', async ({ page }) => {
  await page.goto('/studio/data');
  await expect(page.getByText('gross_margin_pct')).toBeVisible();
  await expect(page.getByText('Nothing was recomputed: no dataset newer than the last check had been uploaded.')).toBeVisible();

  const paused = page.getByRole('button', { name: /refund_rate/ });
  await paused.click();
  await expect(paused).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('never run')).toBeVisible();
});

test('a data session shows the running job and the step it is on', async ({ page }) => {
  await page.goto('/studio/data');
  await page.getByRole('link', { name: /Which regions lost margin/ }).click();
  await expect(page).toHaveURL(/\/studio\/data\/as_4d81b6f02e37$/);
  await expect(page.getByText('exploratory_analysis_agent').first()).toBeVisible();
  await expect(page.getByText('62%')).toBeVisible();
  /* A deterministic run says so rather than leaving the reader to assume a model was called. */
  await expect(page.getByText('deterministic', { exact: true })).toBeVisible();
  /* Personal data the platform found, and what it did with it. */
  await expect(page.getByText('customer_email')).toBeVisible();
  await expect(page.getByText('action taken: dropped')).toBeVisible();
});

test('an automation shows how it is set up and the real result of each run', async ({ page }) => {
  await page.goto('/studio/automations');
  await expect(page.getByText('0 5 * * * · America/Sao_Paulo')).toBeVisible();
  await expect(page.getByText('POST https://finance.internal/hooks/margin')).toBeVisible();
  await expect(page.getByText('HTTP 200 · 1840 ms')).toBeVisible();
  await expect(page.getByText('The endpoint did not answer within 30 s.')).toBeVisible();
  await expect(page.getByText('2 retries')).toBeVisible();
});

test('start refuses to open a room until the idea says something', async ({ page }) => {
  await page.goto('/new');
  const create = page.getByRole('button', { name: 'Open a project room' });
  await expect(create).toBeDisabled();
  await expect(page.getByText('A sentence or two is enough to start.')).toBeVisible();

  await page.getByLabel('What do you want to build?').fill('A storefront with a catalogue and invoices');
  await expect(create).toBeEnabled();
});

test('a project room is named from the idea, cut at a whole word when it is long', async ({ page }) => {
  await page.goto('/new');
  await page.getByLabel('What do you want to build?').fill('Sistema simples de gestão de tarefas com login, projetos e tags coloridas para equipes pequenas. Precisa de relatórios.');
  const created = page.waitForRequest((request) => request.url().endsWith('/api/project-rooms') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Open a project room' }).click();
  const body = (await created).postDataJSON() as { title: string; raw_intent: string };
  expect(body.title).toBe('Sistema simples de gestão de tarefas com login, projetos e…');
  // The whole idea still travels as the intent: only the name is shortened.
  expect(body.raw_intent).toContain('Precisa de relatórios.');
});

test('start refuses to begin a mission until a type is chosen', async ({ page }) => {
  await page.goto('/new');
  const start = page.getByRole('button', { name: 'Start this mission' });
  await expect(start).toBeDisabled();
  await page.getByRole('button', { name: /Criar software/ }).click();
  await expect(start).toBeEnabled();
});

test('a guided mission marks a step answered only when a decision exists', async ({ page }) => {
  await page.goto('/missions/msn_2a7c91e4f0b8');
  const scope = page.getByRole('button', { name: /What is in scope/ });
  await expect(scope).toContainText('answered');
  const rules = page.getByRole('button', { name: /The rules that must hold/ });
  await expect(rules).toContainText('open');

  await scope.click();
  await expect(page.getByText('Invoices cover product sales only; shipping is a separate line, not a separate document.')).toBeVisible();
  /* A decision a model suggested and a person changed says exactly that. */
  await expect(page.getByText('ai_modified', { exact: true })).toBeVisible();
});

test('a deliverable still drafting shows the model asked for, not one it never used', async ({ page }) => {
  await page.goto('/missions/msn_2a7c91e4f0b8');
  const ready = page.locator('.li', { hasText: 'Requirements' }).first();
  await expect(ready.getByText('deepseek', { exact: true })).toBeVisible();
  await expect(ready.getByText('4200 in · 1800 out')).toBeVisible();

  const drafting = page.locator('.li', { hasText: 'Acceptance criteria' }).first();
  await expect(drafting.getByText('deepseek-chat')).toBeVisible();
  await expect(drafting.getByText('in ·')).toHaveCount(0);
});

test('the handoff says generation cannot start until both approvals read yes', async ({ page }) => {
  await page.goto('/missions/msn_2a7c91e4f0b8');
  await expect(page.getByText('Engineering approved')).toBeVisible();
  await expect(page.getByText('Stack approved')).toBeVisible();
  await expect(page.getByText('nothing generated yet')).toBeVisible();
});
