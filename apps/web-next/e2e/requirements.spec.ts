import { expect, test } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const ROOM = '/p/room_5b9e2c71a0d4/define/requirements';

/** The mocked room is past its approval, so each state is reached by saying which status it is in. */
async function roomAt(page: import('@playwright/test').Page, status: string) {
  await page.goto(ROOM);
  const room = await page.evaluate(async () => (await fetch('/api/project-rooms/room_5b9e2c71a0d4')).json());
  await page.route('**/api/project-rooms/room_5b9e2c71a0d4', (route, request) => (
    request.method() === 'GET'
      ? route.fulfill({ json: { ...(room as Record<string, unknown>), status } })
      : route.fallback()
  ));
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('the approval is a decision the screen states, with a verb that names it', async ({ page }) => {
  await roomAt(page, 'PROMPT_READY');
  const decision = page.locator('.decision');
  await expect(decision).toContainText('The decision this screen exists for');
  await expect(decision).toContainText('version 2 stays');
  // The verb names what it approves, in the page head and on the decision itself.
  await expect(page.getByRole('button', { name: 'Approve the PromptMaster' })).toHaveCount(2);
});

test('approving states its scope first, and the cancel leaves the room untouched', async ({ page }) => {
  await roomAt(page, 'PROMPT_READY');
  let approvals = 0;
  await page.route('**/api/project-rooms/*/approve', (route) => { approvals += 1; return route.fulfill({ json: { ok: true } }); });

  await page.locator('.decision').getByRole('button', { name: 'Approve the PromptMaster' }).click();
  const dialog = page.getByRole('dialog', { name: 'The decision this screen exists for' });
  await expect(dialog).toContainText('Nova Commerce · version 2');
  await expect(dialog).toContainText('writes a new version instead of editing this one');
  // Cancel is on the left and the real verb on the right, and cancelling sends nothing.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(approvals).toBe(0);

  await page.locator('.decision').getByRole('button', { name: 'Approve the PromptMaster' }).click();
  await page.getByRole('button', { name: 'Approve version 2' }).click();
  await expect.poll(() => approvals).toBe(1);
});

test('a room that cannot take the approval says why, instead of only grey', async ({ page }) => {
  await roomAt(page, 'SPEC_GENERATING');
  const decision = page.locator('.decision');
  await expect(decision).toContainText('Not yet — this room cannot take the approval');
  // The reason is a sentence, and the room's state in it is read, not spelled.
  await expect(decision).toContainText('This room is at Writing the spec.');
  await expect(decision.getByRole('button', { name: 'Approve the PromptMaster' })).toBeDisabled();
});

test('a room already past the approval offers the next step instead of the verb', async ({ page }) => {
  await roomAt(page, 'PROMPT_APPROVED');
  await expect(page.locator('.decision')).toContainText('This definition is approved');
  await expect(page.getByRole('button', { name: 'Approve the PromptMaster' })).toHaveCount(0);
  await expect(page.locator('.decision').getByRole('link', { name: 'Plan the architecture' }))
    .toHaveAttribute('href', '/p/room_5b9e2c71a0d4/define/architecture');
});
