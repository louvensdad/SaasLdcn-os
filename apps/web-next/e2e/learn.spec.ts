import { expect, test } from '@playwright/test';

import { ACTIONS, RAIL, RAIL_BOTTOM } from '@/lib/routes';

import { mockApi, useEnglish } from './mock-api';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
  await mockApi(page, { signedIn: true });
});

test('first steps are read from recorded facts, not from clicks', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learn LDCN OS by doing the real work');
  await expect(page.getByText('1. Sign in')).toBeVisible();
  await expect(page.getByText('Signed in as nora.lima@novalabs.example')).toBeVisible();
  await expect(page.getByText('A step is done when the platform recorded it')).toBeVisible();
  // The fixture account never started a second mission after its first preview.
  await expect(page.getByText('8. Start the next mission')).toBeVisible();
  await expect(page.getByRole('link', { name: /Do this now/ })).toBeVisible();
});

test('the next move says the briefing has nothing for this state instead of inventing advice', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.getByText('The briefing has no next move for this state.')).toBeVisible();
  await expect(page.getByTitle('The briefing next-move table covers 4 of 16 ProjectRoomStatus values')).toBeVisible();
});

test('guides can be filtered and opened, and reading one is remembered', async ({ page }) => {
  await page.goto('/learn');
  await page.getByLabel('Filter guides').fill('delivery');
  const guide = page.getByRole('link', { name: /Delivering a project/ });
  await expect(guide).toBeVisible();
  await guide.click();
  await expect(page).toHaveURL(/\/learn\/delivery$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delivering a project');
  await page.getByRole('button', { name: 'Mark as read' }).click();
  await expect(page.getByRole('button', { name: 'Read' })).toBeDisabled();
});

test('terms and signals shows the glossary as the backend serves it', async ({ page }) => {
  await page.goto('/learn/terms');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every word and shape on screen');
  await expect(page.getByText('PromptMaster.md')).toBeVisible();
  await page.getByLabel('Find a term').fill('gate');
  await expect(page.getByRole('cell', { name: 'Gate', exact: true })).toBeVisible();
});

test('pressing ? explains the screen you are on', async ({ page }) => {
  await page.goto('/learn');
  // The shortcut is registered by the shell, so wait until it is interactive.
  await expect(page.getByRole('button', { name: 'Learn about this screen' })).toBeVisible();
  await page.keyboard.press('?');
  const panel = page.getByRole('complementary');
  await expect(panel.getByText('This screen answers')).toBeVisible();
  await expect(panel.getByText('What should I do next, and how does this platform work?')).toBeVisible();
});

test('every destination in the route model is built, so nothing sends you back to the old app', async () => {
  const pending = [...ACTIONS, ...RAIL, ...RAIL_BOTTOM].filter((destination) => !destination.built);
  expect(pending.map((destination) => destination.path)).toEqual([]);
});

test('a path that belongs to no destination says so instead of guessing', async ({ page }) => {
  await page.goto('/not-a-real-place');
  await expect(page.getByRole('status')).toContainText('Nothing here');
  await expect(page.getByRole('status')).toContainText('/not-a-real-place');
  // The drawing beside the state names the kind of emptiness and is not announced on top of the words.
  await expect(page.getByRole('status').locator('svg.illo')).toHaveAttribute('aria-hidden', 'true');
});

test('a guide sends a project screen to the project list, and says why', async ({ page }) => {
  await page.goto('/learn/evidence');
  /* The guide names P-EVD and P-GOV: both live inside a project, so both land on the project list. */
  const row = page.getByRole('link', { name: 'Evidence Graph P-EVD' });
  await expect(row).toHaveAttribute('href', '/projects');
  await expect(row).toContainText('pick one first');
});

test('a guide whose screen is global links straight to it', async ({ page }) => {
  await page.goto('/learn/templates');
  await expect(page.getByRole('link', { name: 'Templates & Skills L-TPL' })).toHaveAttribute('href', '/library/templates');
  await expect(page.getByRole('link', { name: 'Marketplace L-MKT' })).toHaveAttribute('href', '/library/marketplace');
  await expect(page.getByRole('link', { name: 'Open Templates & Skills' })).toHaveAttribute('href', '/library/templates');
});
