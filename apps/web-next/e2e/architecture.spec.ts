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
