import { expect, test } from '@playwright/test';

test('wizard reveals steps progressively and validates a real blueprint', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/wizard');

  await expect(page.getByLabel('1. Language')).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('2. Runtime')).toHaveCount(0);
  await expect(page.getByText('Runtime unlocks after selecting a language.')).toBeVisible();

  await page.getByLabel('1. Language').selectOption('typescript');
  await expect(page.getByLabel('2. Runtime')).toBeVisible();

  await page.getByLabel('2. Runtime').selectOption('nodejs');
  await expect(page.getByLabel('3. Framework')).toBeVisible();

  await page.getByLabel('3. Framework').selectOption('nestjs');
  await page.getByRole('button', { name: 'Continue to Architecture' }).click();

  await expect(page.getByLabel('4. Architecture')).toBeVisible();
  await page.getByLabel('4. Architecture').selectOption('modular_monolith');
  await page.getByRole('button', { name: 'Continue to Project Type' }).click();

  await page.getByLabel('5. Archetype').selectOption('ai_saas');
  await page.getByRole('button', { name: 'Continue to Capabilities' }).click();

  await expect(page.getByText('Recommended for this blueprint')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View advanced capabilities' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to Business Modules' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Business Modules' }).click();

  await expect(page.getByText(/^Users$/)).toBeVisible();
  await expect(page.getByText(/^Notifications$/)).toBeVisible();
  await page.getByLabel('Reports').check();
  await page.getByRole('button', { name: 'Continue to Endpoints' }).click();

  await expect(page.getByText('Endpoints grouped by module')).toBeVisible();
  await page.getByRole('button', { name: /Users Identity and account management\./ }).click();
  await expect(page.getByRole('button', { name: 'Select recommended' })).toBeVisible();
  await expect(page.getByText('POST /auth/login')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Blueprint Review' }).click();

  await expect(page.getByRole('heading', { name: 'Blueprint Review' })).toBeVisible();
  await expect(page.getByText('The backend blueprint preview will appear here once you run the preview action.')).toBeVisible();
  await page.getByRole('button', { name: 'Preview blueprint' }).click();
  await expect(page.getByText('Valid blueprint')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Technology graph', { exact: true })).toBeVisible();
  await expect(page.getByText('Architecture profile', { exact: true })).toBeVisible();
  await expect(page.getByText('Complexity profile', { exact: true })).toBeVisible();
  await expect(page.getByText('AI SaaS', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('TypeScript', { exact: true }).first()).toBeVisible();

  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog', { name: 'Search LDCN OS' });
  const searchBox = page.getByRole('textbox', { name: 'Search LDCN OS' });
  await expect(dialog).toBeVisible();
  await searchBox.fill('typescript');
  await expect(dialog.getByRole('button', { name: /^TypeScript/ })).toBeVisible();
  await searchBox.fill('nestjs');
  await expect(dialog.getByRole('button', { name: /^NestJS/ })).toBeVisible();
  await searchBox.fill('modular monolith');
  await expect(dialog.getByRole('button', { name: /^Modular Monolith Architecture/ })).toBeVisible();
  await searchBox.fill('ai saas');
  await expect(dialog.getByRole('button', { name: /^AI SaaS/ })).toBeVisible();
  await searchBox.fill('rbac');
  await expect(dialog.getByRole('button', { name: /^RBAC/ })).toBeVisible();
});

test('wizard stays responsive on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:3000/wizard');

  await expect(page.getByLabel('1. Language')).toBeVisible({ timeout: 15000 });

  const hasHorizontalOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth;
  });

  expect(hasHorizontalOverflow).toBe(false);
});
