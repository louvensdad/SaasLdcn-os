import { expect, test, type Page } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

const PROJECT = '/p/room_5b9e2c71a0d4';
const COMPANY = `${PROJECT}/missions/genjob_9f14c7b2e08a55/company`;

type Transition = { readonly from: string | null; to?: string | null };

/* Records, for every view transition the page starts, the element carried into it and the one it landed on. Landing
   is not asserted as always happening: the morph waits a bounded time for the new title and otherwise fades. */
async function recordTransitions(page: Page) {
  await page.addInitScript(() => {
    const log: Transition[] = [];
    (window as unknown as { __transitions: Transition[] }).__transitions = log;
    const named = () => {
      const hero = document.querySelector<HTMLElement>('[style*="view-transition-name"]');
      return hero ? hero.getAttribute('aria-label') ?? hero.textContent : null;
    };
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((update: ViewTransitionUpdateCallback) => {
      const entry: Transition = { from: named() };
      log.push(entry);
      return start(async () => {
        await update();
        entry.to = named();
      });
    }) as typeof document.startViewTransition;
  });
}

const transitions = (page: Page) => page.evaluate(() => (window as unknown as { __transitions: Transition[] }).__transitions);

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
  await recordTransitions(page);
});

test('a project chosen on the board travels into the title of its cockpit, and leaves nothing named behind', async ({ page }) => {
  await page.goto('/');
  await page.locator('.mboard').getByRole('link', { name: 'Nova Commerce' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nova Commerce' })).toBeVisible();
  // The title can be in the page before the update that waits for it has returned; read the move once it has.
  await expect.poll(async () => (await transitions(page))[0]?.to !== undefined).toBe(true);
  const [move, ...more] = await transitions(page);
  expect(more).toEqual([]);
  expect(move?.from).toBe('Nova Commerce');
  // It lands on the project's name or nowhere -- never on the room key the title shows while the name is read.
  expect(['Nova Commerce', null]).toContain(move?.to);
  if (move?.to) await expect(page.locator('.canvas-inner.is-morphed')).toHaveCount(1);
  await expect.poll(() => page.locator('[style*="view-transition-name"]').count()).toBe(0);
});

test('a seat opened from the company map travels into the agent it names', async ({ page }) => {
  await page.goto(COMPANY);
  await page.getByRole('group', { name: 'Company map' }).getByRole('button', { name: 'Backend engineer: CERTIFIED' }).dblclick();
  await expect(page).toHaveURL(/\/company\/agents\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect((await transitions(page)).map((move) => move.from)).toEqual(['Backend engineer: CERTIFIED']);
});

test("a mission's Test Room chain travels into the runtime screen, and the chain's heading into the evidence", async ({ page }) => {
  await page.goto(`${PROJECT}/missions/genjob_9f14c7b2e08a55`);
  const panel = page.locator('section.panel', { has: page.getByRole('heading', { name: 'Runtime and evidence' }) });
  await panel.getByRole('link', { name: 'Open runtime' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Runtime control room' })).toBeVisible();
  await page.getByRole('link', { name: 'Open evidence' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Why this project is where it is' })).toBeVisible();
  expect((await transitions(page)).map((move) => move.from)).toEqual(['Gates of the latest Test Room session', 'How it was proven to run']);
});

test('the Test room panel of the evidence travels into the Test Room', async ({ page }) => {
  await page.goto(`${PROJECT}/evidence`);
  const panel = page.locator('section.panel', { has: page.getByRole('heading', { name: 'Test room', exact: true }) });
  await panel.getByRole('link', { name: 'Open Test Room' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Test Room' })).toBeVisible();
  expect((await transitions(page)).map((move) => move.from)).toEqual(['Test room']);
});

test('reduced motion, from the system or the switch, makes every navigation a cut', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('.mboard').getByRole('link', { name: 'Nova Commerce' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nova Commerce' })).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.localStorage.setItem('ldcn-next-motion', 'reduced'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.locator('.mboard').getByRole('link', { name: 'Nova Commerce' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nova Commerce' })).toBeVisible();
  expect(await transitions(page)).toEqual([]);
});

test('a modified click keeps the browser\'s own behaviour and starts no transition', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('.mboard').getByRole('link', { name: 'Nova Commerce' });
  const opened = page.context().waitForEvent('page');
  await link.click({ modifiers: ['ControlOrMeta'] });
  await (await opened).close();
  await expect(page).toHaveURL(/\/$/);
  expect(await transitions(page)).toEqual([]);
});
