import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';
const PROJECT_ID = 'ingest-auto-fix-spec';

function authFixture() {
  const now = '2026-06-26T00:00:00Z';
  return {
    user: {
      user_id: 'auto-fix-user',
      email: 'autofix@example.com',
      full_name: 'Auto Fix User',
      role: 'admin',
      locale: 'pt-BR',
      is_active: true,
      consent_accepted_at: now,
      consent_policy_version: '1.0.0',
      created_at: now,
      updated_at: now,
    },
    tokens: { access_token: 'auto-fix-token', token_type: 'bearer', expires_in: 3600 },
  };
}

function summaryFixture() {
  return {
    project_id: PROJECT_ID,
    source: 'git',
    file_count: 2853,
    total_bytes: 98432,
    languages: { TypeScript: 7, Java: 3 },
    created_at: '2026-06-26T00:00:00Z',
    updated_at: '2026-06-26T00:00:00Z',
    has_report: true,
    detected_stack: 'Spring Boot + React',
    overall_score: 72,
    findings_count: 2,
    scores: {
      architecture: 76, security: 58, backend: 70, frontend: 74, database: 68,
      tests: 66, devops: 72, maintainability: 79, performance: 74,
      production_readiness: 80, overall: 72,
    },
  };
}

function reportFixture() {
  return {
    report: {
      project_id: PROJECT_ID,
      detected_stack: 'Spring Boot + React',
      primary_language: 'TypeScript',
      scores: summaryFixture().scores,
      executive: {
        health: 'Moderado', risk_level: 'high', top_problems: ['Hardcoded secret'],
        business_impact: 'Risco de vazamento.', effort_estimate: '34 min', priority: 'Segurança primeiro.',
      },
      technical: {
        issues: [
          { id: 'sec:secret:app.yml:14', title: 'Hardcoded API key', severity: 'critical', category: 'security', file: 'application.yml', line: 14, root_cause: 'Segredo no código-fonte.', recommendation: 'Mover para variável de ambiente.', auto_fixable: false },
          { id: 'smell:large-service', title: 'OrderService mistura camadas', severity: 'medium', category: 'architecture', file: 'OrderService.java', line: null, root_cause: 'Orquestração e persistência juntas.', recommendation: 'Separar camadas.', auto_fixable: false },
        ],
      },
      degraded: true,
      generated_at: '2026-06-26T00:00:00Z',
    },
    plan: {
      project_id: PROJECT_ID,
      phases: [
        { id: 'critical', title: 'Fase 1 — Correções críticas', actions: [{ id: 'remove_real_env', title: 'Remover .env reais', phase_id: 'critical', auto_fixable: true, requires_extra_confirmation: false }] },
        { id: 'devops', title: 'Fase 5 — DevOps', actions: [{ id: 'readme_missing', title: 'Criar README', phase_id: 'devops', auto_fixable: true, requires_extra_confirmation: false }] },
      ],
    },
  };
}

async function mockAutoFix(page: Page, { latest }: { latest: unknown }) {
  const auth = authFixture();
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes('/api/modernize/projects/latest')) return route.fulfill({ json: latest });
    if (url.endsWith('/api/modernize/projects') || url.includes('/api/modernize/projects?')) {
      return route.fulfill({ json: latest ? [summaryFixture()] : [] });
    }
    if (/\/api\/modernize\/[^/]+\/report/.test(url)) return route.fulfill({ json: reportFixture() });
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

test('Auto-Fix shows the empty state and never offers upload when there is no analysis', async ({ page }) => {
  await mockAutoFix(page, { latest: null });
  await page.goto(`${WEB_BASE}/auto-fix`);

  await expect(page.getByText('Nenhuma análise disponível')).toBeVisible();
  await expect(page.getByRole('button', { name: /Abrir Modernize/ })).toBeVisible();
  // The execution phase must never re-ingest: no file input, no ZIP prompt.
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.getByText(/Enviar ZIP/i)).toHaveCount(0);
});

test('Auto-Fix loads an existing analysis with header, categories and grouped fixes', async ({ page }) => {
  await mockAutoFix(page, { latest: summaryFixture() });
  await page.goto(`${WEB_BASE}/auto-fix?project=${PROJECT_ID}`);

  // Header from the persisted analysis — no upload.
  await expect(page.getByRole('heading', { name: 'Spring Boot + React' })).toBeVisible();
  await expect(page.getByText('Analisado')).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);

  // Category menu + grouped findings.
  await expect(page.getByText('Segurança')).toBeVisible();
  await expect(page.getByText('Hardcoded API key')).toBeVisible();

  // Execution panel maps selection to the real apply pipeline.
  await expect(page.getByText('Plano de execução')).toBeVisible();
  await expect(page.getByText('Fase 1 — Correções críticas')).toBeVisible();

  await page.getByRole('button', { name: 'Apenas críticas' }).click();
  await expect(page.getByRole('button', { name: /Executar Correções/ })).toBeEnabled();
});
