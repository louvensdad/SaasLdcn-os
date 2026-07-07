import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';

function authFixture() {
  const now = '2026-06-26T00:00:00Z';
  return {
    user: {
      user_id: 'jobs-user', email: 'jobs@example.com', full_name: 'Jobs User',
      role: 'admin', locale: 'pt-BR', is_active: true, consent_accepted_at: now,
      consent_policy_version: '1.0.0', created_at: now, updated_at: now,
    },
    tokens: { access_token: 'jobs-token', token_type: 'bearer', expires_in: 3600 },
  };
}

function jobSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'genjob-1', projectId: 'room-1', generatedProjectId: 'orders-app',
    projectName: 'Orders', status: 'READY', currentStage: 'READY',
    provider: 'anthropic', providerLabel: 'Claude', model: 'claude-sonnet-4',
    progress: 100, valid: true, packageReady: true, buildStatus: 'PASSED',
    archived: false, createdAt: '2026-06-20T10:00:00Z', updatedAt: '2026-06-20T10:30:00Z',
    startedAt: '2026-06-20T10:00:00Z', finishedAt: '2026-06-20T10:30:00Z',
    ...overrides,
  };
}

async function mockJobs(page: Page, { active, archived }: { active: unknown[]; archived: unknown[] }) {
  const auth = authFixture();
  const patched = new Set<string>();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.pathname.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (request.method() === 'PATCH' && /\/api\/meta-factory\/jobs\/[^/]+\/archive/.test(url.pathname)) {
      const jobId = url.pathname.split('/').at(-2)!;
      const body = request.postDataJSON() as { archived: boolean };
      if (body.archived) patched.add(jobId);
      else patched.delete(jobId);
      return route.fulfill({ json: { ...jobSummary({ id: jobId }), archived: body.archived } });
    }
    if (request.method() === 'DELETE' && /\/api\/meta-factory\/jobs\/[^/]+$/.test(url.pathname)) {
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname === '/api/meta-factory/jobs') {
      const archivedParam = url.searchParams.get('archived');
      const activeNow = active.filter((job) => !patched.has((job as { id: string }).id));
      const archivedNow = [...archived, ...active.filter((job) => patched.has((job as { id: string }).id))];
      if (archivedParam === 'true') return route.fulfill({ json: archivedNow });
      return route.fulfill({ json: activeNow });
    }
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

test('Generations page lists active jobs and switches to the archive tab', async ({ page }) => {
  await mockJobs(page, {
    active: [jobSummary()],
    archived: [jobSummary({ id: 'genjob-2', projectName: 'Legacy CRM', archived: true })],
  });
  await page.goto(`${WEB_BASE}/jobs`);

  await expect(page.getByText('Orders')).toBeVisible();
  await expect(page.getByText('Legacy CRM')).not.toBeVisible();

  await page.getByRole('button', { name: /Arquivados/ }).click();
  await expect(page.getByText('Legacy CRM')).toBeVisible();
  await expect(page.getByText('Orders')).not.toBeVisible();
});

test('Generations page archives a job and it disappears from the active tab', async ({ page }) => {
  await mockJobs(page, { active: [jobSummary()], archived: [] });
  await page.goto(`${WEB_BASE}/jobs`);

  await expect(page.getByText('Orders')).toBeVisible();
  await page.getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.getByText('Nenhuma geração ativa ainda')).toBeVisible();
});

test('Generations page requires confirmation before deleting a job', async ({ page }) => {
  let deleteRequests = 0;
  const auth = authFixture();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.pathname.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (request.method() === 'DELETE' && /\/api\/meta-factory\/jobs\/[^/]+$/.test(url.pathname)) {
      deleteRequests += 1;
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname === '/api/meta-factory/jobs') return route.fulfill({ json: [jobSummary()] });
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
  await page.goto(`${WEB_BASE}/jobs`);

  await page.getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Orders');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  expect(deleteRequests).toBe(0);

  await page.getByRole('button', { name: 'Excluir' }).click();
  await page.getByRole('button', { name: 'Excluir permanentemente' }).click();
  await expect.poll(() => deleteRequests).toBe(1);
});
