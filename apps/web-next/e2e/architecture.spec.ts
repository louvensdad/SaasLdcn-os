import { expect, test } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const ROOM = '/p/room_5b9e2c71a0d4/define/architecture';

/** The mocked room already has a blueprint, so the empty states are reached by taking one away. */
async function roomWithout(page: import('@playwright/test').Page, patch: Record<string, unknown>) {
  await page.goto(ROOM);
  const room = await page.evaluate(async () => (await fetch('/api/project-rooms/room_5b9e2c71a0d4')).json());
  await page.route('**/api/project-rooms/room_5b9e2c71a0d4', (route, request) => (
    request.method() === 'GET'
      ? route.fulfill({ json: { ...(room as Record<string, unknown>), ...patch } })
      : route.fallback()
  ));
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('with a PromptMaster in hand, the empty architecture offers the planning instead of restating it', async ({ page }) => {
  await roomWithout(page, { architecture_blueprint: null, blueprint_versions: [] });
  const state = page.getByRole('status').filter({ hasText: 'Nothing has been planned yet' });
  await expect(state).toContainText('already carries everything the planning reads');
  // The way forward is in the state itself, not only in the corner of the page head.
  await expect(state.getByRole('button', { name: 'Plan the architecture' })).toBeEnabled();
});

test('without one, the empty architecture names what is missing and where it is written', async ({ page }) => {
  await roomWithout(page, { architecture_blueprint: null, blueprint_versions: [], prompt_master_md: null });
  const state = page.getByRole('status').filter({ hasText: 'There is nothing to plan from yet' });
  await expect(state).toContainText('this room has not written one yet');
  await expect(state.getByRole('link', { name: 'Go to the PromptMaster' }))
    .toHaveAttribute('href', '/p/room_5b9e2c71a0d4/define/requirements');
});

test('a refusal says what the backend said, without the exception class in front of it', async ({ page }) => {
  await roomWithout(page, { architecture_blueprint: null, blueprint_versions: [] });
  await page.route('**/api/project-rooms/*/blueprint', (route) => route.fulfill({
    status: 409,
    json: { detail: 'Aprove o PromptMaster.md antes de gerar o Blueprint arquitetural.' },
  }));
  await page.getByRole('status').getByRole('button', { name: 'Plan the architecture' }).click();

  const failure = page.locator('.panel.is-fault');
  await expect(failure).toContainText('Aprove o PromptMaster.md antes de gerar o Blueprint arquitetural.');
  // The class name is not part of what the backend said.
  await expect(failure).not.toContainText('ApiError');
  // Trying again is offered, and the status the backend answered with is a technical detail.
  await expect(failure.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(failure.locator('.src')).toHaveText(/HTTP 409/);
});

test('a refusal the room has moved past stops being shown next to what it refused', async ({ page }) => {
  await roomWithout(page, { architecture_blueprint: null, blueprint_versions: [] });
  await page.route('**/api/project-rooms/*/blueprint', (route) => route.fulfill({
    status: 409,
    json: { detail: 'Aprove o PromptMaster.md antes de gerar o Blueprint arquitetural.' },
  }));
  await page.getByRole('status').getByRole('button', { name: 'Plan the architecture' }).click();
  await expect(page.locator('.panel.is-fault')).toBeVisible();

  // The room is now drawing the blueprint, so the earlier refusal is no longer true of this screen.
  await page.unroute('**/api/project-rooms/room_5b9e2c71a0d4');
  const room = await page.evaluate(async () => (await fetch('/api/project-rooms/room_5b9e2c71a0d4')).json());
  await page.route('**/api/project-rooms/room_5b9e2c71a0d4', (route, request) => (
    request.method() === 'GET'
      ? route.fulfill({ json: { ...(room as Record<string, unknown>), architecture_blueprint: null, blueprint_versions: [], status: 'BLUEPRINT_GENERATING' } })
      : route.fallback()
  ));
  await page.getByRole('link', { name: 'Cockpit' }).click();
  await page.goBack();
  await expect(page.locator('.panel.is-fault')).toBeHidden();
});

test('a long stack choice never squeezes the area it belongs to', async ({ page }) => {
  const long = 'Java 17 + Spring Boot 3.3 (Maven) com modulos controller/service/repository/domain, Spring Web, Spring Data JPA, Validation, Security, Flyway e PostgreSQL Driver';
  await page.goto(ROOM);
  const room = await page.evaluate(async () => (await fetch('/api/project-rooms/room_5b9e2c71a0d4')).json());
  const source = room as { stack_proposal: { items: { choice: string }[] } };
  await page.route('**/api/project-rooms/room_5b9e2c71a0d4', (route, request) => (
    request.method() === 'GET'
      ? route.fulfill({ json: { ...room as Record<string, unknown>, stack_proposal: {
          ...source.stack_proposal,
          items: source.stack_proposal.items.map((item, index) => (index === 0 ? { ...item, choice: long } : item)),
        } } })
      : route.fallback()
  ));
  await page.reload();
  /* The title used to collapse to one character wide and wrap down the page, because the value column
     was `auto` and won the whole row. */
  const title = page.locator('.li-title').first();
  const box = await title.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(60);
});

test('a blueprint says who wrote it and at what cost, without the developer switch', async ({ page }) => {
  await page.goto(ROOM);
  const section = page.locator('.sec').filter({ hasText: 'Blueprint' }).last();
  await expect(section).toContainText('Written by');
  await expect(section).toContainText('Decisions');
  // The raw payload stays a developer detail; the provenance does not.
  await expect(section.locator('details.dev-only')).toBeHidden();
});

test('a stack already approved reads as a state, and the planning is not offered while it runs', async ({ page }) => {
  await page.goto(ROOM);
  const room = await page.evaluate(async () => (await fetch('/api/project-rooms/room_5b9e2c71a0d4')).json());
  await page.route('**/api/project-rooms/room_5b9e2c71a0d4', (route, request) => (
    request.method() === 'GET'
      ? route.fulfill({
          json: {
            ...(room as Record<string, unknown>),
            status: 'BLUEPRINT_GENERATING',
            stack_proposal: { ...(room as { stack_proposal: object }).stack_proposal, status: 'APPROVED' },
          },
        })
      : route.fallback()
  ));
  await page.reload();
  // Not a greyed-out verb: the state, and what it means.
  await expect(page.getByText('The stack is locked for this generation.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve the stack' })).toHaveCount(0);
  // The room is drawing one right now, so asking for one again is not an action.
  await expect(page.getByRole('button', { name: 'Planning…' })).toBeDisabled();
});
