import { expect, test } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

test.beforeEach(async ({ page }) => {
  await useEnglish(page);
});

test('the sign-in story names its stations, and under reduced motion its path is drawn at rest', async ({ page }) => {
  await mockApi(page, { signedIn: false });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/signin');
  const story = page.getByRole('img', { name: 'Idea, Architecture, Company, Code, Evidence, READY' });
  await expect(story).toBeVisible();
  const path = story.locator('.story-path');
  expect(await path.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  expect(await path.evaluate((node) => getComputedStyle(node).strokeDashoffset)).toMatch(/^0(px)?$/);

  // In one column the form is the job: the story is not drawn at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(story).toBeHidden();
});

test('a wrong password says the same thing whether or not the account exists', async ({ page }) => {
  await mockApi(page, { signedIn: false, loginStatus: 401 });
  await page.goto('/signin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('From an idea to software you can verify.');

  await page.getByLabel('E-mail').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('E-mail or password is incorrect')).toBeVisible();
  await expect(page.getByText('This message is the same whether or not an account exists')).toBeVisible();
});

test('the session-ended notice explains how to come back', async ({ page }) => {
  await mockApi(page, { signedIn: false });
  await page.goto('/signin?state=expired');
  await expect(page.getByText('Your session ended')).toBeVisible();
});

test('forgot password names the gap instead of pretending to send a link', async ({ page }) => {
  await mockApi(page, { signedIn: false });
  await page.goto('/signin?state=forgot');
  await expect(page.getByText('Password recovery is not available yet')).toBeVisible();
  await expect(page.getByTitle('No password reset or e-mail verification in the backend')).toBeVisible();
});

test('the provider return explains the backend reason', async ({ page }) => {
  await mockApi(page, { signedIn: false });
  await page.goto('/auth/callback?oauth=error&reason=invalid_state');
  await expect(page.getByText('The sign-in could not be verified')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
});

test('a screen that needs a session sends the person to sign in and remembers where they were', async ({ page }) => {
  await mockApi(page, { signedIn: false });
  await page.goto('/learn');
  await expect(page).toHaveURL(/\/signin\?next=%2Flearn/);
});

test('signing in leads to the workspace choice', async ({ page }) => {
  await mockApi(page, { signedIn: false, loginStatus: 200 });
  await page.goto('/signin');
  await page.getByLabel('E-mail').fill('nora.lima@novalabs.example');
  await page.getByLabel('Password').fill('a-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Choose where to work' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Nova Labs/ })).toBeVisible();
});
