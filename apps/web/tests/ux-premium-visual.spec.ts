import { expect, test } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 900, height: 1100 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

for (const viewport of viewports) {
  test(`architecture studio ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`${BASE_URL}/architecture`);
    await expect(page.getByRole('heading', { name: /Architecture|Arquitetura/i }).first()).toBeVisible();
    await expect(page.getByText(/Advanced architecture|Arquitetura avançada/i)).toBeVisible();
    await page.screenshot({
      path: `../../reports/screenshots/ux-premium-${viewport.name}.png`,
      fullPage: true,
    });
  });
}
