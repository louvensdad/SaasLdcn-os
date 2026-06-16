import { expect, test, type Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT ?? '3100'}`;

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 900, height: 1100 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const localeExpectations = {
  'pt-BR': ['Inteligência de arquitetura', 'Requisitos do Projeto'],
  'en-US': ['Architecture intelligence', 'Project Requirements'],
  'es-ES': ['Inteligencia de arquitectura', 'Requisitos del Proyecto'],
  'fr-FR': ['Intelligence d’architecture', 'Exigences du Projet'],
} as const;

async function setLocale(page: Page, locale: keyof typeof localeExpectations) {
  await page.addInitScript((selectedLocale) => {
    localStorage.setItem(
      'ldcn-locale-preferences',
      JSON.stringify({
        state: {
          interfaceLocale: selectedLocale,
          generatedProjectLocale: selectedLocale,
          documentationLocale: selectedLocale,
          codeCommentsLocale: selectedLocale,
          fallbackLocale: 'en-US',
        },
        version: 0,
      }),
    );
  }, locale);
}

for (const locale of Object.keys(localeExpectations) as Array<keyof typeof localeExpectations>) {
  test(`wizard critical copy is localized in ${locale}`, async ({ page }) => {
    await setLocale(page, locale);
    await page.goto(`${BASE_URL}/wizard`);

    for (const text of localeExpectations[locale]) {
      await expect(page.getByText(text, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    }
  });
}

for (const viewport of viewports) {
  test(`wizard content remains visible without horizontal overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setLocale(page, 'pt-BR');
    await page.goto(`${BASE_URL}/wizard`);

    await expect(page.getByText('Inteligência de arquitetura', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Requisitos do Projeto', exact: true })).toBeVisible();

    const visibility = await page.evaluate(() => {
      const root = document.documentElement;
      const clipped = [...document.querySelectorAll<HTMLElement>('[data-visibility-audit]')]
        .filter((element) => element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.dataset.visibilityAudit);
      return {
        horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
        clipped,
      };
    });

    expect(visibility.horizontalOverflow).toBeFalsy();
    expect(visibility.clipped).toEqual([]);

    await page.screenshot({
      path: `../../reports/screenshots/responsive-wizard-${viewport.name}.png`,
      fullPage: true,
    });
  });
}
