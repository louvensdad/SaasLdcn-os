import { expect, test } from '@playwright/test';

const routes = [
  { path: '/dashboard', heading: /Executive Dashboard|Painel/i },
  { path: '/architecture', heading: /Architecture Center|Centro de Arquitetura/i },
  { path: '/templates', heading: /Template Marketplace|Templates/i },
  { path: '/skills', heading: /Outcome Library|Biblioteca/i },
] as const;

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  for (const route of routes) {
    test(`${route.path} premium visual ${viewport.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto(route.path);
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`${route.path.slice(1)}-${viewport.name}.png`), fullPage: true });
    });
  }
}
