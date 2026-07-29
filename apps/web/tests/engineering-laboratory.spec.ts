import { expect, test, type Page } from '@playwright/test';

import { webUrl } from './test-urls';

const authFixture = {
  user: {
    user_id: 'test-user',
    email: 'test@example.com',
    full_name: 'Test User',
    role: 'admin',
    locale: 'pt-BR',
    is_active: true,
    consent_accepted_at: '2026-06-25T00:00:00Z',
    consent_policy_version: '1.0.0',
    created_at: '2026-06-25T00:00:00Z',
    updated_at: '2026-06-25T00:00:00Z',
  },
  tokens: { access_token: 'test-access-token', token_type: 'bearer', expires_in: 3600 },
};

const labOverview = {
  contractVersion: '1.0.0',
  project_id: 'lab_project',
  project_path: 'C:/ldcn-os/generated-projects/lab_project',
  project_name: 'lab_project',
  stack: 'Node.js',
  primary_language: 'typescript',
  languages: { typescript: 4, json: 1 },
  file_count: 5,
  line_count: 140,
  dependency_count: 2,
  dependencies: [
    { name: 'next', version: '^15.0.0', source: 'package.json:dependencies' },
    { name: 'vitest', version: '^2.0.0', source: 'package.json:devDependencies' },
  ],
  containers: ['Dockerfile'],
  databases: ['postgresql'],
  cloud: ['Vercel'],
  build: 'configured',
  coverage: 'tests_detected_no_coverage',
  status: 'ready',
  health_score: 88,
  last_analysis: '2026-06-25T12:00:00Z',
  inventory: { ingest_id: 'reanalyze_123', source: 'zip', file_count: 5, total_bytes: 5000, skipped_count: 0, languages: { typescript: 4, json: 1 }, files: [] },
  diagnosis: {
    detected_stack: 'Node.js',
    primary_language: 'typescript',
    languages: ['typescript', 'json'],
    dependency_notes: ['Nenhuma dependencia criticamente obsoleta detectada pela varredura heuristica.'],
    smells: [{ code: 'no_ci', message: 'Sem pipeline CI/CD detectado.', related_paths: [] }],
    security_findings: [],
  },
  api_endpoints: [{ method: 'GET', path: '/health', source: 'src/server.ts' }],
  architecture_nodes: [{ id: 'src', label: 'src (4)', kind: 'module' }],
  architecture_edges: [],
  modules: [
    { id: 'overview', label: 'Overview', status: 'ready', summary: 'Inventario real gerado a partir dos arquivos do projeto.', evidence: [] },
    { id: 'terminal', label: 'Terminal', status: 'ready', summary: 'Executa comandos reais no backend com cwd restrito ao projeto.', evidence: [] },
    { id: 'api-explorer', label: 'API Explorer', status: 'ready', summary: 'Endpoints detectados.', evidence: ['src/server.ts'] },
    { id: 'security', label: 'Security Center', status: 'ready', summary: '0 achados reais.', evidence: [] },
    { id: 'quality', label: 'Code Quality', status: 'ready', summary: '1 code smell detectado.', evidence: [] },
    { id: 'performance', label: 'Performance', status: 'not_configured', summary: 'Benchmark exige ferramenta externa configurada.', evidence: [] },
    { id: 'ai-assistant', label: 'AI Assistant', status: 'not_configured', summary: 'Sem provider real selecionado.', evidence: [] },
  ],
};

async function setup(page: Page) {
  await page.addInitScript((auth) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes('/api/auth/refresh')) return new Response(JSON.stringify(auth), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return original(input, init);
    };
  }, authFixture);
  await page.route('**/api/auth/me', async (route) => route.fulfill({ json: authFixture.user }));
  await page.route('**/api/registry/**', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/engineering-lab/projects/lab_project/overview', async (route) => route.fulfill({ json: labOverview }));
  await page.route('**/api/engineering-lab/projects/lab_project/terminal', async (route) => route.fulfill({
    json: {
      project_id: 'lab_project',
      command: 'git status --short',
      cwd: 'C:/ldcn-os/generated-projects/lab_project',
      exit_code: 0,
      duration_ms: 18,
      output: [{ kind: 'stdout', text: ' M src/server.ts\n' }],
    },
  }));
}

test('engineering laboratory renders real modules and terminal output', async ({ page }) => {
  await setup(page);
  await page.goto(webUrl('/engineering-laboratory?projectId=lab_project'));

  await expect(page.getByRole('heading', { name: /Bancada real/ })).toBeVisible();
  await expect(page.getByText('88%')).toBeVisible();
  await expect(page.getByText('Node.js').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Terminal/ })).toBeVisible();

  await page.getByRole('button', { name: /Terminal/ }).click();
  await page.getByRole('button', { name: /Executar/ }).click();
  await expect(page.getByText('exit 0')).toBeVisible();
  await expect(page.getByText('M src/server.ts')).toBeVisible();

  await page.getByRole('button', { name: /Performance/ }).click();
  await expect(page.getByText(/Nenhum P95\/P99 foi inventado/)).toBeVisible();
});
