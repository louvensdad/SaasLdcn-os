import { expect, test } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const LOCALES = ['pt-BR', 'en-US', 'es-ES', 'fr-FR'];
const THEMES = ['dark', 'light'];

function contrastRatio(foreground: string, background: string) {
  const rgb = (value: string) => value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
  const luminance = (value: string) => {
    const channels = rgb(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('all localization selects and options respect theme colors and contrast', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings`);

  const selects = page.locator('select');
  await expect(selects).toHaveCount(6);

  for (const theme of THEMES) {
    await page.evaluate((themeId) => {
      document.documentElement.dataset.theme = themeId;
    }, theme);

    const styles = await selects.evaluateAll((elements) =>
      elements.map((element) => {
        const nativeSelect = element as HTMLSelectElement;
        const select = getComputedStyle(element);
        return {
          background: select.backgroundColor,
          color: select.color,
          border: select.borderColor,
          options: [...nativeSelect.options].map((option) => {
            const style = getComputedStyle(option);
            return { value: option.value, label: option.text, background: style.backgroundColor, color: style.color };
          }),
        };
      }),
    );

    for (const style of styles) {
      expect(style.background).not.toBe('rgb(255, 255, 255)');
      expect(style.border).not.toBe('rgb(255, 255, 255)');
      expect(contrastRatio(style.color, style.background)).toBeGreaterThanOrEqual(4.5);
      expect(style.options.map((option) => option.value)).toEqual(LOCALES);
      for (const option of style.options) {
        expect(option.label.trim().length).toBeGreaterThan(0);
        expect(option.background).not.toBe('rgb(255, 255, 255)');
        expect(contrastRatio(option.color, option.background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});
