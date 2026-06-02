import { expect, test, type Page } from '@playwright/test';

async function selectLanguage(page: Page, languageId: string, runtimeId: string) {
  await page.goto('http://127.0.0.1:3000/wizard');
  const languageSelect = page.locator('select').first();
  await expect(languageSelect).toBeVisible({ timeout: 15000 });
  await languageSelect.selectOption(languageId);

  const runtimeSelect = page.locator('select').nth(1);
  await expect(runtimeSelect).toBeVisible({ timeout: 15000 });
  await runtimeSelect.selectOption(runtimeId);

  const frameworkSelect = page.locator('select').nth(2);
  await expect(frameworkSelect).toBeVisible({ timeout: 15000 });
}

test('Java language domain loads Spring Boot and related recommendations', async ({ page }) => {
  await selectLanguage(page, 'java', 'jvm');

  const frameworkOptions = page.getByLabel('3. Framework').locator('option');
  await expect(frameworkOptions).toContainText(['Spring Boot', 'Quarkus', 'Micronaut']);
  await expect(page.getByText('Java recommendations')).toBeVisible();
  await expect(page.getByText('Observing Java ecosystem')).toBeVisible();
});

test('TypeScript language domain loads Node-focused framework choices', async ({ page }) => {
  await selectLanguage(page, 'typescript', 'nodejs');

  const frameworkOptions = page.getByLabel('3. Framework').locator('option');
  await expect(frameworkOptions).toContainText(['NestJS', 'Next.js', 'Express', 'Fastify', 'Angular', 'React']);
  await expect(page.getByText('TypeScript recommendations')).toBeVisible();
});

test('Python language domain loads FastAPI, Django and Flask', async ({ page }) => {
  await selectLanguage(page, 'python', 'python_runtime');

  const frameworkOptions = page.getByLabel('3. Framework').locator('option');
  await expect(frameworkOptions).toContainText(['FastAPI', 'Django', 'Flask']);
  await expect(page.getByText('Python recommendations')).toBeVisible();
});

test('wizard shows a safe offline state when the language domain profile endpoint fails', async ({ page }) => {
  await page.route('http://127.0.0.1:8001/api/languages/java/profile', async (route) => {
    await route.abort('failed');
  });

  await page.goto('http://127.0.0.1:3000/wizard');
  await page.locator('select').first().selectOption('java');

  await expect(page.getByText('Technology graph unavailable')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Backend is offline or unreachable.')).toBeVisible({ timeout: 15000 });
});
