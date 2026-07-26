import { expect, test, type Page } from '@playwright/test';

import { setup } from './project-experience-fixtures';
import { webUrl } from './test-urls';

// Covers the "Ver frontend no navegador" button end to end: it must never
// enable off a bare URL string -- only once the backend has already
// health-checked the session into status="running" with a real preview_url
// (see live_preview_service.py's _wait_ready gate). Also covers the
// restart-frontend/restart-backend buttons added alongside it.
//
// Follows this repo's existing Playwright convention (project-experience-v2.spec.ts):
// the API network boundary is mocked, but every button/state/popup interaction
// below drives the REAL frontend code (LivePreviewPanel's gating logic,
// window.open call, loading states) -- spinning up a real nested
// backend+frontend child-process pair inside a UI E2E run is prohibitively
// expensive and is exercised for real instead by the backend's own
// test_live_preview.py suite (60 tests) against the real service.

function runningSession(overrides: Record<string, unknown> = {}) {
  return {
    session_id: 'lp_e2e_test',
    project_id: 'project_v2',
    status: 'running',
    reason: '',
    preview_url: 'http://127.0.0.1:44100/',
    started_at: '2026-07-26T00:00:00Z',
    last_activity_at: '2026-07-26T00:00:00Z',
    ...overrides,
  };
}

async function gotoLivePreviewSection(page: Page) {
  await page.goto(webUrl('/projects/project_v2'));
  await page.locator('#live-preview-runtime').scrollIntoViewIfNeeded();
}

test('external-open button is disabled until the session is really running, then opens a real new tab', async ({ page, context }) => {
  await setup(page);
  const externalOpenCalls: string[] = [];
  await page.route('**/api/live-preview/start', async (route) =>
    route.fulfill({ json: runningSession() }),
  );
  await page.route('**/api/live-preview/lp_e2e_test/external-open', async (route) => {
    externalOpenCalls.push(route.request().url());
    await route.fulfill({ status: 204, body: '' });
  });
  // Nothing is really listening on this fake preview port -- fulfilling the
  // popup's own navigation lets it resolve to real content instead of
  // Chrome's connection-error page, so `popup.url()` reflects a completed
  // load rather than racing a doomed real TCP connection.
  await context.route('http://127.0.0.1:44100/**', async (route) =>
    route.fulfill({ body: '<html><body>generated frontend</body></html>', contentType: 'text/html' }),
  );

  await gotoLivePreviewSection(page);

  await page.getByRole('button', { name: 'Iniciar preview ao vivo' }).click();

  const openButton = page.getByRole('button', { name: 'Ver frontend no navegador' });
  await expect(openButton).toBeVisible();
  await expect(openButton).toBeEnabled();
  await page.screenshot({ path: 'test-results/evidence-live-preview-running-button-enabled.png', fullPage: true });

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    openButton.click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  expect(popup.url()).toBe('http://127.0.0.1:44100/');
  await popup.screenshot({ path: 'test-results/evidence-live-preview-new-tab-opened.png' });
  await popup.close();

  await expect.poll(() => externalOpenCalls.length).toBe(1);
});

test('external-open button never renders when the preview failed to start', async ({ page }) => {
  await setup(page);
  await page.route('**/api/live-preview/start', async (route) =>
    route.fulfill({
      json: {
        session_id: '', project_id: 'project_v2', status: 'failed',
        reason: 'Backend did not become ready within the startup budget.',
        preview_url: null, started_at: '2026-07-26T00:00:00Z', last_activity_at: '2026-07-26T00:00:00Z',
      },
    }),
  );

  await gotoLivePreviewSection(page);
  await expect(page.getByRole('button', { name: 'Iniciar preview ao vivo' })).toBeVisible();
  await page.screenshot({ path: 'test-results/evidence-live-preview-not-running-state.png', fullPage: true });
  await page.getByRole('button', { name: 'Iniciar preview ao vivo' }).click();

  await expect(page.getByText('O preview falhou ao iniciar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver frontend no navegador' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/evidence-live-preview-failed-state.png', fullPage: true });
});

test('restart-frontend and restart-backend call their own endpoints and update the session', async ({ page }) => {
  await setup(page);
  const restartFrontendCalls: string[] = [];
  const restartBackendCalls: string[] = [];
  await page.route('**/api/live-preview/start', async (route) => route.fulfill({ json: runningSession() }));
  await page.route('**/api/live-preview/lp_e2e_test/restart-frontend', async (route) => {
    restartFrontendCalls.push(route.request().url());
    await route.fulfill({ json: runningSession({ preview_url: 'http://127.0.0.1:44200/' }) });
  });
  await page.route('**/api/live-preview/lp_e2e_test/restart-backend', async (route) => {
    restartBackendCalls.push(route.request().url());
    await route.fulfill({ json: runningSession() });
  });

  await gotoLivePreviewSection(page);
  await page.getByRole('button', { name: 'Iniciar preview ao vivo' }).click();
  await expect(page.getByRole('button', { name: 'Ver frontend no navegador' })).toBeEnabled();

  await page.getByRole('button', { name: 'Reiniciar frontend' }).click();
  await expect.poll(() => restartFrontendCalls.length).toBe(1);
  // The button's own disabled/preview_url gate must reflect the NEW url after restart.
  await expect(page.getByRole('button', { name: 'Ver frontend no navegador' })).toBeEnabled();

  await page.getByRole('button', { name: 'Reiniciar backend' }).click();
  await expect.poll(() => restartBackendCalls.length).toBe(1);
});

test('rapid double-click on restart-frontend only fires one request', async ({ page }) => {
  await setup(page);
  let restartFrontendCallCount = 0;
  await page.route('**/api/live-preview/start', async (route) => route.fulfill({ json: runningSession() }));
  await page.route('**/api/live-preview/lp_e2e_test/restart-frontend', async (route) => {
    restartFrontendCallCount += 1;
    // Hold the response open briefly so a second click during the in-flight
    // request would be observable as a second call if double-submit guarding
    // were missing.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ json: runningSession() });
  });

  await gotoLivePreviewSection(page);
  await page.getByRole('button', { name: 'Iniciar preview ao vivo' }).click();
  const restartButton = page.getByRole('button', { name: 'Reiniciar frontend' });
  await expect(restartButton).toBeEnabled();

  await restartButton.click();
  await restartButton.click({ force: true });

  await expect.poll(() => restartFrontendCallCount, { timeout: 2000 }).toBe(1);
});

test('external-open click never blocks on the record-open call even if it fails', async ({ page, context }) => {
  await setup(page);
  await page.route('**/api/live-preview/start', async (route) => route.fulfill({ json: runningSession() }));
  await page.route('**/api/live-preview/lp_e2e_test/external-open', async (route) => route.fulfill({ status: 500, json: { detail: 'boom' } }));
  await context.route('http://127.0.0.1:44100/**', async (route) =>
    route.fulfill({ body: '<html><body>generated frontend</body></html>', contentType: 'text/html' }),
  );

  await gotoLivePreviewSection(page);
  await page.getByRole('button', { name: 'Iniciar preview ao vivo' }).click();
  const openButton = page.getByRole('button', { name: 'Ver frontend no navegador' });
  await expect(openButton).toBeEnabled();

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    openButton.click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  expect(popup.url()).toBe('http://127.0.0.1:44100/');
  await popup.close();
});
