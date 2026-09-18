import { expect, test } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const ROOM = '/p/room_5b9e2c71a0d4/define/discovery';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('the conversation is held while the model answers, and never asks for the idea twice', async ({ page }) => {
  /* The real POST calls the provider and takes as long as the model takes. Hold the reply open so the
     screen can be looked at mid-answer, which is exactly the moment the bug happened in. */
  let release: (() => void) | undefined;
  const answered = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/project-rooms/*/message', async (route) => {
    await answered;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto(ROOM);
  const composer = page.getByRole('textbox', { name: 'Say what you want to build' });
  // The room already carries a conversation, so the box asks for the next thing, not for the idea again.
  await expect(composer).toHaveAttribute('placeholder', 'Add something, or answer one of the open questions');

  await composer.fill('It also needs refunds.');
  await page.getByRole('button', { name: 'Send' }).click();

  // The wait is shown where the answer will land, not only on the button.
  await expect(page.getByText('Reading what you said and answering with your provider')).toBeVisible();
  await expect(page.getByText('The conversation is held while the model answers')).toBeVisible();
  // And the composer is closed, so the same message cannot be sent into a conversation still being answered.
  await expect(composer).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Write the PromptMaster' })).toBeDisabled();

  release?.();
  await expect(composer).toBeEnabled();
  await expect(page.getByText('Reading what you said and answering with your provider')).toBeHidden();
});

test('a room the backend is still working on says so, instead of asking for the idea again', async ({ page }) => {
  /* The case a person lands in straight from the start screen: the room exists, the intent is in it, and
     the backend is still writing the answer. Nothing in this tab issued that request. */
  await page.goto(ROOM);
  const room = await page.evaluate(async () => (await fetch('/api/project-rooms/room_5b9e2c71a0d4')).json());
  let answering = true;
  await page.route('**/api/project-rooms/room_5b9e2c71a0d4', (route, request) => (
    request.method() === 'GET'
      ? route.fulfill({ json: { ...(room as Record<string, unknown>), status: answering ? 'SPEC_GENERATING' : 'PROMPT_READY' } })
      : route.fallback()
  ));
  await page.reload();

  await expect(page.getByText('Reading what you said and answering with your provider')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Say what you want to build' })).toBeDisabled();

  // The screen keeps asking while that state holds, so the answer lands without a reload.
  answering = false;
  await expect(page.getByRole('textbox', { name: 'Say what you want to build' })).toBeEnabled({ timeout: 15_000 });
});


test('the PromptMaster the room carries is on the screen that asked for it', async ({ page }) => {
  await page.goto(ROOM);
  const document = page.locator('.pm-doc');
  await expect(document).toContainText('A storefront with a catalogue, a cart and invoices.');
  await expect(page.getByText('version 2 ·')).toBeVisible();
  // Long documents open in place rather than sending the reader somewhere else to see them.
  const whole = page.getByRole('button', { name: 'Read the whole document' });
  await expect(whole).toHaveAttribute('aria-expanded', 'false');
  await whole.click();
  await expect(page.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  // Approving it is still a decision taken where decisions are taken.
  await expect(page.getByRole('link', { name: 'Review and approve it' })).toHaveAttribute('href', '/p/room_5b9e2c71a0d4/define/requirements');
});
