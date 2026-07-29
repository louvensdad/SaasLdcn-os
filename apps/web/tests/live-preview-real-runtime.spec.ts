import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

import { API_BASE_URL, WEB_BASE_URL } from './test-urls';

// Phase 2 "Sala de Execução": the REAL-runtime companion to
// live-preview-external-open.spec.ts (Phase 1, network-mocked, kept
// unmodified as a fast interface/state-transition smoke test). This suite
// intentionally does NOT intercept /api/live-preview/*, the preview URL, or
// the fixture project's own backend/frontend -- every request below is real:
// real npm install, real uvicorn, real next dev, real HTTP calls between the
// generated frontend and its own generated backend.
//
// Run with: npm run test:e2e:real-runtime (separate config/harness --
// see playwright.real-runtime.config.ts for why this can't reuse the
// standard mocked-runtime harness).

const apiRoot = resolve(import.meta.dirname, '..', '..', 'api');

interface FixtureProject {
  projectId: string;
  accessToken: string;
  email: string;
  password: string;
}

async function createFixtureProject(page: Page): Promise<FixtureProject> {
  const email = `real-runtime-${Date.now()}@e2e.test`;
  const password = 'StrongPass1!';
  const registerResponse = await page.request.post(`${API_BASE_URL}/auth/register`, {
    data: { email, password, full_name: 'Real Runtime E2E', privacy_policy_accepted: true },
  });
  expect(registerResponse.ok(), `register failed: ${await registerResponse.text()}`).toBeTruthy();
  const registerBody = await registerResponse.json();
  const userId: string = registerBody.user.user_id;
  const accessToken: string = registerBody.tokens.access_token;

  // The fixture-creation script needs its OWN sqlite connection to insert a
  // `projects` row alongside the real files it writes via ProjectWriter --
  // it must point at the EXACT same db file this run's API process uses.
  // The path formula must match scripts/start-real-runtime-api.mjs exactly.
  const runId = process.env.LDCN_E2E_RUN_ID;
  if (!runId) throw new Error('LDCN_E2E_RUN_ID was not propagated from the Playwright config/webServer env.');
  const databaseUrl = `sqlite:///${resolve(apiRoot, 'tests', '.tmp', `ldcn-${runId}.db`).replaceAll('\\', '/')}`;

  const stdout = execFileSync(
    'python',
    ['scripts/create_e2e_fixture_project.py', userId, API_BASE_URL],
    {
      cwd: apiRoot,
      env: { ...process.env, LDCN_DATABASE_URL: databaseUrl, E2E_FIXTURE_TOKEN: accessToken, PYTHONIOENCODING: 'utf-8' },
      encoding: 'utf-8',
    },
  );
  const projectId = stdout.trim().split('\n').pop()!.trim();
  if (!projectId.startsWith('e2e-real-runtime-fixture_')) {
    throw new Error(`Fixture project creation did not print a project id, got: ${stdout}`);
  }
  return { projectId, accessToken, email, password };
}

async function authenticateBrowser(page: Page, project: FixtureProject) {
  // Real finding: page.request.post('/auth/register') DOES set the real
  // httpOnly refresh cookie in this browser context, but navigating straight
  // to /projects/{id} afterwards still redirected to /login -- the app's
  // client-side bootstrap evidently doesn't treat that cookie as sufficient
  // without the login/register flow having happened IN the page itself (and
  // web/api sit on different ports: 127.0.0.1:3300 vs 127.0.0.1:8301).
  // Driving the real login UI sidesteps the uncertainty entirely and is
  // arguably more real anyway -- it exercises the actual login page instead
  // of trying to shortcut around it.
  await page.goto(`${WEB_BASE_URL}/login`);
  await page.locator('input[type="email"]').fill(project.email);
  await page.locator('input[type="password"]').fill(project.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  await page.goto(`${WEB_BASE_URL}/projects/${project.projectId}`);
}

test.describe('Live Preview real runtime (unmocked)', () => {
  test.setTimeout(9 * 60 * 1000);

  test('full real lifecycle: start, iframe, external tab, read/write, restarts, refresh, stop', async ({ page, context }) => {
    const consoleErrors: string[] = [];
    const networkFailures: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', (req: Request) => networkFailures.push(`${req.method()} ${req.url()}: ${req.failure()?.errorText}`));

    // ---- 1-4: real user, real project, real page, confirm stopped state ----
    const project = await createFixtureProject(page);
    await authenticateBrowser(page, project);
    await page.locator('#live-preview-runtime').scrollIntoViewIfNeeded();

    const startButton = page.getByRole('button', { name: 'Iniciar preview ao vivo' });
    await expect(startButton).toBeVisible();
    await page.screenshot({ path: 'test-results/real-runtime-01-stopped.png', fullPage: true });

    // ---- 5-10: start, wait for REAL backend+frontend to become RUNNING ----
    await startButton.click();
    // Real npm install + uvicorn + next dev boot -- measured in minutes.
    await page.screenshot({ path: 'test-results/real-runtime-02-starting.png', fullPage: true }).catch(() => {});

    const openExternalButton = page.getByRole('button', { name: 'Ver frontend no navegador' });
    await expect(openExternalButton).toBeEnabled({ timeout: 8 * 60 * 1000 });
    await expect(page.getByText('ao vivo', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/real-runtime-03-running.png', fullPage: true });

    // ---- 11-14: real iframe loaded real generated content ----
    const iframe = page.frameLocator('iframe[title="Preview ao vivo do projeto"]');
    await expect(iframe.getByRole('heading', { name: 'E2E Real Runtime Fixture' })).toBeVisible({ timeout: 30_000 });
    await expect(iframe.getByTestId('backend-status')).toHaveText('Backend status: ok');
    const iframeBody = await page.frameLocator('iframe[title="Preview ao vivo do projeto"]').locator('body').innerText();
    expect(iframeBody.trim().length).toBeGreaterThan(0); // real content, not a blank/white iframe
    await page.screenshot({ path: 'test-results/real-runtime-04-iframe.png', fullPage: true });

    // ---- 15-19: "Ver frontend no navegador" -> real new tab ----
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      openExternalButton.click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForLoadState('networkidle');
    await expect(popup.getByRole('heading', { name: 'E2E Real Runtime Fixture' })).toBeVisible({ timeout: 15_000 });

    const popupUrl = popup.url();
    const popupTitle = await popup.title();
    expect(popupUrl).not.toBe('about:blank');
    expect(popupUrl.startsWith('http://127.0.0.1:')).toBeTruthy(); // real direct-port URL, no localhost:0/undefined
    expect(popupTitle).toBe('E2E Real Runtime Fixture');
    const popupBody = await popup.locator('body').innerText();
    expect(popupBody.trim().length).toBeGreaterThan(0);
    expect(popupBody).not.toMatch(/this site can.?t be reached|refused to connect/i);
    console.log(`[evidence] new-tab URL (real, direct-port, dev-only by design): ${popupUrl.replace(/:\d+/, ':<port>')}`);
    console.log(`[evidence] new-tab title: ${popupTitle}`);
    await popup.screenshot({ path: 'test-results/real-runtime-05-new-tab-full.png', fullPage: true });

    // ---- 20-21: real read + real write against the real backend, from the popup tab ----
    const itemList = popup.getByTestId('item-list');
    await expect(itemList).toContainText('seed-item'); // real read: seeded data from the real backend
    await popup.getByTestId('item-name-input').fill('e2e-written-item');
    await popup.getByTestId('item-submit').click();
    await expect(itemList).toContainText('e2e-written-item'); // real write round-tripped back

    // ---- 22-23: refresh the POPUP tab, confirm persistence (backend process untouched) ----
    await popup.reload();
    await expect(popup.getByTestId('item-list')).toContainText('e2e-written-item', { timeout: 15_000 });
    await popup.close();

    // ---- 24: back to the Sala de Execução ----
    await page.bringToFront();
    await expect(openExternalButton).toBeEnabled();

    // ---- 25-27: restart ONLY the frontend; backend (and its data) survives ----
    const restartFrontendButton = page.getByRole('button', { name: 'Reiniciar frontend' });
    await restartFrontendButton.click();
    await expect(openExternalButton).toBeEnabled({ timeout: 3 * 60 * 1000 });
    const [popupAfterFrontendRestart] = await Promise.all([
      context.waitForEvent('page'),
      openExternalButton.click(),
    ]);
    await popupAfterFrontendRestart.waitForLoadState('domcontentloaded');
    await expect(popupAfterFrontendRestart.getByTestId('item-list')).toContainText('e2e-written-item', { timeout: 15_000 });
    await page.screenshot({ path: 'test-results/real-runtime-06-after-frontend-restart.png', fullPage: true });
    await popupAfterFrontendRestart.close();
    await page.bringToFront();

    // ---- 28-29: restart ONLY the backend; frontend keeps running (data resets -- real, honest side effect of in-memory storage, not a bug) ----
    const restartBackendButton = page.getByRole('button', { name: 'Reiniciar backend' });
    await restartBackendButton.click();
    await expect(openExternalButton).toBeEnabled({ timeout: 3 * 60 * 1000 });
    await page.screenshot({ path: 'test-results/real-runtime-07-after-backend-restart.png', fullPage: true });

    // ---- 30-31: refresh the Sala de Execução page itself, confirm state recovers ----
    await page.reload();
    await page.locator('#live-preview-runtime').scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Ver frontend no navegador' })).toBeVisible();

    // ---- 32-35: stop the runtime, confirm real teardown ----
    const stopButton = page.getByRole('button', { name: 'Parar preview' });
    await stopButton.click();
    await expect(page.getByRole('button', { name: 'Iniciar preview ao vivo' })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'test-results/real-runtime-08-stopped-again.png', fullPage: true });

    console.log(`[evidence] console errors observed: ${consoleErrors.length}`);
    console.log(`[evidence] network failures observed: ${networkFailures.length}`);
    for (const err of consoleErrors) console.log(`[console-error] ${err}`);
    for (const failure of networkFailures) console.log(`[network-failure] ${failure}`);
  });
});
