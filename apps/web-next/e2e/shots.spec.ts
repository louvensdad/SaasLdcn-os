import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { mockApi, useEnglish } from './mock-api';

/**
 * The screenshot sweep: every built screen, at desktop and phone width, with the same mocked backend the other specs
 * use — so a fixture never drifts between what is tested and what is pictured. It also fails on a page that scrolls
 * sideways or logs a console error, which is how the layout bugs of the earlier waves were caught.
 */
const OUT = process.env.LDCN_SHOTS_DIR ?? path.join(process.cwd(), 'e2e', 'shots');

const PROJECT = '/p/room_5b9e2c71a0d4';
const SESSION = 'as_4d81b6f02e37';
const GUIDED = 'msn_2a7c91e4f0b8';
const MISSION = `${PROJECT}/missions/genjob_9f14c7b2e08a55`;

const SCREENS: readonly (readonly [string, string])[] = [
  ['command', '/'],
  ['inbox', '/inbox'],
  ['activity', '/inbox/activity'],
  ['projects', '/projects'],
  ['cockpit', PROJECT],
  ['missions', `${PROJECT}/missions`],
  ['mission', MISSION],
  ['evidence', `${PROJECT}/evidence`],
  ['test-room', `${PROJECT}/evidence/test-room`],
  ['delivery', `${PROJECT}/delivery`],
  ['company', `${MISSION}/company`],
  ['agent', `${MISSION}/company/agents/ai_1`],
  ['company-job', `${MISSION}/jobs/cjob_2`],
  ['workforce', '/workforce'],
  ['planner', '/workforce/planner'],
  ['library', '/library'],
  ['certification', '/library/certification'],
  ['engineering', `${PROJECT}/engineering`],
  ['changes', `${PROJECT}/engineering/changes`],
  ['change', `${PROJECT}/engineering/changes/chg_6f0a4b12d7e9`],
  ['verification', `${PROJECT}/engineering/verification`],
  ['runtime', `${PROJECT}/runtime`],
  ['modernize', `${PROJECT}/modernize`],
  ['governance', `${PROJECT}/governance`],
  ['settings', '/settings'],
  ['settings-ai', '/settings/ai'],
  ['settings-plan', '/settings/plan'],
  ['settings-account', '/settings/account'],
  ['settings-workspace', '/settings/workspace'],
  ['settings-preferences', '/settings/preferences'],
  ['settings-integrations', '/settings/integrations'],
  ['discovery', `${PROJECT}/define/discovery`],
  ['requirements', `${PROJECT}/define/requirements`],
  ['architecture', `${PROJECT}/define/architecture`],
  ['review', `${PROJECT}/define/review`],
  ['memory', `${PROJECT}/memory`],
  ['start', '/new'],
  ['guided-mission', `/missions/${GUIDED}`],
  ['studio', '/studio'],
  ['studio-data', '/studio/data'],
  ['studio-session', `/studio/data/${SESSION}`],
  ['studio-automations', '/studio/automations'],
  ['library-technology', '/library/technology'],
  ['library-templates', '/library/templates'],
  ['library-knowledge', '/library/knowledge'],
  ['library-marketplace', '/library/marketplace'],
  ['library-research', '/library/research'],
  ['platform', '/platform'],
  ['platform-decisions', '/platform/decisions'],
  ['platform-config', '/platform/config'],
  ['platform-roadmap', '/platform/roadmap'],
  ['learn', '/learn'],
  ['learn-terms', '/learn/terms'],
];

/** What a person sees on their first day: the screens that do not need a project to exist yet. */
const FIRST_DAY = [
  'command', 'inbox', 'activity', 'projects', 'start', 'workforce', 'planner',
  'library', 'library-technology', 'library-templates', 'library-knowledge', 'library-marketplace',
  'library-research', 'certification', 'studio', 'studio-data', 'studio-automations',
  'platform', 'platform-decisions', 'platform-config', 'platform-roadmap', 'learn', 'learn-terms',
  'settings', 'settings-ai', 'settings-plan', 'settings-account', 'settings-workspace',
  'settings-preferences', 'settings-integrations',
];

const PHONE = ['command', 'inbox', 'cockpit', 'mission', 'evidence', 'test-room', 'company', 'workforce', 'engineering', 'runtime'];

/** Dark is a first-class theme, not an inversion: these run with `data-theme="dark"` set before the first paint. */
const DARK = ['command', 'cockpit', 'mission', 'evidence', 'delivery', 'engineering', 'library-technology', 'studio-data', 'start', 'settings-ai'];

/** pt-BR is the default locale and its words are longer; a layout that only fits English fails here. */
const BR = ['command', 'inbox', 'cockpit', 'mission', 'delivery', 'discovery', 'review', 'library-knowledge', 'start', 'guided-mission'];

/** Signed out: the screens a person sees before they have a session, plus the ones a session only passes through. */
const PUBLIC: readonly (readonly [string, string])[] = [
  ['signin', '/signin'],
  ['signin-register', '/signin?mode=register'],
  ['auth-callback', '/auth/callback?error=provider_denied'],
  ['pricing', '/pricing'],
  ['legal-terms', '/legal/terms'],
  ['legal-privacy', '/legal/privacy'],
];

/**
 * A small, certain subset of accessibility: the failures below are defects on any page, in any design.
 * Returns one line per problem so the test names the element rather than just the count.
 */
async function a11y(page: import('@playwright/test').Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const name = (element: Element) => {
      const aria = element.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim();
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const target = document.getElementById(labelledBy);
        if (target?.textContent?.trim()) return target.textContent.trim();
      }
      if (element.getAttribute('title')?.trim()) return String(element.getAttribute('title')).trim();
      return (element as HTMLElement).innerText?.trim() ?? '';
    };
    const where = (element: Element) => {
      const cls = element.getAttribute('class');
      return `<${element.tagName.toLowerCase()}${cls ? ` class="${cls.slice(0, 40)}"` : ''}>`;
    };

    const headings = Array.from(document.querySelectorAll('h1'));
    if (headings.length !== 1) problems.push(`${headings.length} <h1> on the page, expected exactly 1`);

    for (const element of Array.from(document.querySelectorAll('button, a[href]'))) {
      if ((element as HTMLElement).hidden) continue;
      if (element.getAttribute('aria-hidden') === 'true') continue;
      if (!name(element)) problems.push(`no accessible name: ${where(element)}`);
    }

    for (const field of Array.from(document.querySelectorAll('input, select, textarea'))) {
      if (field.getAttribute('type') === 'hidden') continue;
      const id = field.getAttribute('id');
      const labelled = (id && document.querySelector(`label[for="${id}"]`)) || field.closest('label');
      if (!labelled && !name(field)) problems.push(`no label: ${where(field)}`);
    }

    for (const image of Array.from(document.querySelectorAll('img'))) {
      if (image.getAttribute('alt') === null) problems.push(`no alt: ${where(image)}`);
    }

    return problems;
  });
}

test.describe('screenshots', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  for (const [name, route] of SCREENS) {
    test(`desktop · ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await useEnglish(page);
      await mockApi(page, { signedIn: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${name} scrolls sideways at 1440`).toBe(false);
      expect(errors, `${name} logged errors`).toEqual([]);
      expect(await a11y(page), `${name} has accessibility defects`).toEqual([]);
    });
  }

  /* The design's central claim, put to every screen: a read that failed is named, never drawn as proof. */
  for (const [name, route] of SCREENS) {
    test(`every read fails · ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        /* The browser logs every 500 the page asked for; those are the point of this test. */
        if (/Failed to load resource.*500/.test(message.text())) return;
        errors.push(message.text());
      });
      await useEnglish(page);
      await mockApi(page, { signedIn: true, failEveryRead: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      /* The shell renders and the screen has a heading: nothing crashed into a blank page. */
      await expect(page.locator('h1')).toHaveCount(1);
      expect(errors, `${name} threw when its reads failed`).toEqual([]);

      /* Nothing may claim proof: no green signal, no verdict badge, when nothing was read. A `data-legend`
         list is excluded on purpose -- it documents what each word means and reports nothing. So is a signal
         marked `data-read="session"`: GET /api/auth/me is the one read this mode keeps answering (the signed-in
         shell needs it), and "you signed in" is proven by it. Without the mark the check depended on whether the
         failing reads had finished retrying when it counted. */
      const proof = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.s-proof, .b-proof')).filter((node) => !node.closest('[data-legend], [data-read="session"]')).length);
      expect(proof, `${name} drew ${proof} proof signal(s) with every read failing`).toBe(0);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${name} scrolls sideways with failing reads`).toBe(false);
    });
  }

  /* A real account with nothing in it: every list empty. The screen must say so, not look broken. */
  for (const name of FIRST_DAY) {
    const route = SCREENS.find(([id]) => id === name)?.[1] ?? '/';
    test(`first day · ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await useEnglish(page);
      await mockApi(page, { signedIn: true, emptyEveryList: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(OUT, `e-${name}.png`), fullPage: true });

      await expect(page.locator('h1')).toHaveCount(1);
      expect(errors, `${name} threw with everything empty`).toEqual([]);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${name} scrolls sideways with everything empty`).toBe(false);
      expect(await a11y(page), `${name} has accessibility defects when empty`).toEqual([]);
    });
  }

  for (const name of DARK) {
    const route = SCREENS.find(([id]) => id === name)?.[1] ?? '/';
    test(`dark · ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await useEnglish(page);
      await mockApi(page, { signedIn: true });
      await page.addInitScript(() => window.localStorage.setItem('ldcn-next-theme', 'dark'));
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(theme, `${name} did not apply the dark theme`).toBe('dark');
      await page.screenshot({ path: path.join(OUT, `d-${name}.png`), fullPage: true });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${name} scrolls sideways in dark at 1440`).toBe(false);
      expect(errors, `${name} logged errors in dark`).toEqual([]);
    });
  }

  for (const name of BR) {
    const route = SCREENS.find(([id]) => id === name)?.[1] ?? '/';
    test(`pt-BR · ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await mockApi(page, { signedIn: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(OUT, `br-${name}.png`), fullPage: true });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${name} scrolls sideways in pt-BR at 1440`).toBe(false);
      expect(errors, `${name} logged errors in pt-BR`).toEqual([]);
    });
  }

  test('desktop · cockpit, compact', async ({ page }) => {
    await useEnglish(page);
    await mockApi(page, { signedIn: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(PROJECT);
    await page.waitForLoadState('networkidle');
    const comfortable = await page.evaluate(() => document.body.scrollHeight);

    await page.addInitScript(() => window.localStorage.setItem('ldcn-next-density', 'compact'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    const density = await page.evaluate(() => document.documentElement.getAttribute('data-density'));
    expect(density, 'the compact preference was not applied').toBe('compact');
    await page.screenshot({ path: path.join(OUT, 'cockpit-compact.png'), fullPage: true });

    /* The control has to do something a reader can see: compact fits more of the page on one screen. */
    const compact = await page.evaluate(() => document.body.scrollHeight);
    expect(compact, 'compact density did not shorten the page').toBeLessThan(comfortable);
  });

  for (const [name, route] of PUBLIC) {
    test(`public · ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        /* Signed out, the session refresh answers 401 and the browser logs every failed request. That 401 is the
           correct answer, and the page renders the signed-out state because of it -- so only it is allowed here. */
        const text = message.text();
        if (message.type() !== 'error') return;
        if (/Failed to load resource.*401/.test(text)) return;
        errors.push(text);
      });
      await useEnglish(page);
      await mockApi(page, { signedIn: false });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${name} scrolls sideways at 1440`).toBe(false);
      expect(errors, `${name} logged errors`).toEqual([]);
    });
  }

  test('desktop · select-workspace', async ({ page }) => {
    await useEnglish(page);
    await mockApi(page, { signedIn: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/select-workspace');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(OUT, 'select-workspace.png'), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, 'select-workspace scrolls sideways at 1440').toBe(false);
  });

  for (const name of PHONE) {
    const route = SCREENS.find(([id]) => id === name)?.[1] ?? '/';
    test(`phone · ${name}`, async ({ page }) => {
      await useEnglish(page);
      await mockApi(page, { signedIn: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(OUT, `m-${name}.png`), fullPage: true });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${name} scrolls sideways at 390`).toBe(false);
    });
  }
});
