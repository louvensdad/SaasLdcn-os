import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';

function authFixture() {
  const now = '2026-06-26T00:00:00Z';
  return {
    user: {
      user_id: 'modernize-user',
      email: 'modernize@example.com',
      full_name: 'Modernize User',
      role: 'admin',
      locale: 'pt-BR',
      is_active: true,
      consent_accepted_at: now,
      consent_policy_version: '1.0.0',
      created_at: now,
      updated_at: now,
    },
    tokens: { access_token: 'modernize-token', token_type: 'bearer', expires_in: 3600 },
  };
}

function modernizeFixture() {
  return {
    inventory: {
      ingest_id: 'ingest-modernize-cockpit',
      source: 'git',
      file_count: 12,
      total_bytes: 98432,
      skipped_count: 4,
      languages: { TypeScript: 7, Java: 3, SQL: 2 },
      files: [
        { path: 'apps/web/src/app/dashboard/page.tsx', size_bytes: 12500, language: 'TypeScript' },
        { path: 'apps/web/src/app/api/orders/route.ts', size_bytes: 4200, language: 'TypeScript' },
        { path: 'apps/api/src/main/java/com/ldcn/AuthController.java', size_bytes: 8300, language: 'Java' },
        { path: 'apps/api/src/main/java/com/ldcn/OrderService.java', size_bytes: 10400, language: 'Java' },
        { path: 'db/migrations/001_init.sql', size_bytes: 2400, language: 'SQL' },
        { path: 'docker-compose.yml', size_bytes: 1800, language: 'YAML' },
        { path: 'README.md', size_bytes: 3500, language: 'Markdown' },
        { path: 'apps/web/src/app/dashboard/page.spec.tsx', size_bytes: 5200, language: 'TypeScript' },
        { path: 'package.json', size_bytes: 1900, language: 'JSON' },
        { path: 'pom.xml', size_bytes: 3200, language: 'XML' },
        { path: '.github/workflows/ci.yml', size_bytes: 1600, language: 'YAML' },
        { path: 'apps/api/src/main/resources/application.yml', size_bytes: 1200, language: 'YAML' },
      ],
    },
    diagnosis: {
      detected_stack: 'Spring Boot + React',
      primary_language: 'TypeScript',
      languages: ['TypeScript', 'Java', 'SQL'],
      dependency_notes: ['package.json contains outdated dependency ranges'],
      smells: [
        {
          code: 'large-service',
          message: 'OrderService mixes orchestration and persistence concerns.',
          related_paths: ['apps/api/src/main/java/com/ldcn/OrderService.java'],
        },
      ],
      security_findings: [
        {
          severity: 'critical',
          code: 'secret-inline',
          message: 'Hardcoded API key found in configuration.',
          path: 'apps/api/src/main/resources/application.yml',
          line: 14,
        },
        {
          severity: 'high',
          code: 'jwt-secret',
          message: 'JWT secret is too short for production usage.',
          path: 'apps/api/src/main/java/com/ldcn/AuthController.java',
          line: 48,
        },
      ],
    },
    plan: {
      target_architecture: 'Clean Architecture',
      preserved_logic_note: 'Business flow and endpoint contracts are preserved before structural changes.',
      steps: [
        'Freeze current behavior with smoke tests',
        'Build dependency graph',
        'Refactor security configuration',
        'Extract application services',
        'Run validation pipeline',
      ],
      mappings: [
        {
          legacy_path: 'apps/api/src/main/java/com/ldcn/OrderService.java',
          target_path: 'apps/api/src/main/java/com/ldcn/application/OrderUseCase.java',
          action: 'migrate',
          note: 'Move orchestration into application layer.',
        },
      ],
    },
    stats: {
      files_found: 16,
      ignored_count: 4,
      analyzable_count: 12,
      total_bytes: 98432,
      lines_of_code: 4120,
      languages: { TypeScript: 7, Java: 3, SQL: 2 },
      frameworks: ['React', 'Spring Boot', 'Docker'],
      complexity: 'medium',
      truncated: false,
    },
    executive_summary: {
      overall_health: 82,
      health_label: 'Modernization advised',
      modernization_estimate: '34 min',
      complexity: 'medium',
      risk_level: 'high',
      analysis_confidence: 91,
      scores: [
        { id: 'overall', label: 'Overall Health', value: 82, basis: 'Derived from diagnosis and inventory.' },
        { id: 'architecture', label: 'Architecture Score', value: 76, basis: 'Derived from architecture smells.' },
        { id: 'security', label: 'Security Score', value: 58, basis: 'Derived from security findings.' },
        { id: 'performance', label: 'Performance Score', value: 74, basis: 'Derived from static project evidence.' },
        { id: 'maintainability', label: 'Maintainability', value: 79, basis: 'Derived from smells and dependency notes.' },
        { id: 'tests', label: 'Test Coverage', value: 66, basis: 'Derived from test file evidence.' },
        { id: 'production_readiness', label: 'Project Health', value: 80, basis: 'Derived from delivery evidence.' },
        { id: 'devops', label: 'Documentation', value: 72, basis: 'Derived from documentation and CI evidence.' },
      ],
      findings: {
        critical: 1,
        high: 1,
        medium: 2,
        low: 0,
        info: 0,
        total: 4,
        technical_debt: 2,
        duplicated_code: 0,
        dead_code: 0,
        dependencies: 1,
      },
      technologies: [
        { name: 'Spring Boot + React', category: 'stack', confidence: 88, evidence: 'Detected by backend stack markers.' },
        { name: 'TypeScript', category: 'language', confidence: 90, evidence: '7 indexed files.' },
        { name: 'Spring Boot', category: 'framework', confidence: 85, evidence: 'Detected by Smart Ingest framework markers.' },
        { name: 'Docker', category: 'container', confidence: 80, evidence: 'docker-compose.yml indexed.' },
      ],
      review:
        'Backend deterministic analysis completed. It found 4 governed improvement points. Main risk areas: security findings, dependency drift and architecture smells.',
      priority: 'Security first, then architecture, tests and delivery automation.',
    },
    // Persistent-job ingest fields (ModernizeProjectIngest).
    project_id: 'ingest-modernize-cockpit',
    source: 'git',
    created_at: '2026-06-26T00:00:00Z',
  };
}

function reportFixture() {
  return {
    report: {
      project_id: 'ingest-modernize-cockpit',
      detected_stack: 'Spring Boot + React',
      primary_language: 'TypeScript',
      scores: {
        architecture: 76, security: 58, backend: 70, frontend: 74, database: 68,
        tests: 66, devops: 72, maintainability: 79, performance: 74,
        production_readiness: 80, overall: 72,
      },
      executive: {
        health: 'Moderado', risk_level: 'high',
        top_problems: ['Hardcoded secret'], business_impact: 'Risco de vazamento.',
        effort_estimate: '34 min', priority: 'Segurança primeiro.',
      },
      technical: {
        issues: [
          { id: 'sec:secret:app.yml:14', title: 'Hardcoded API key', severity: 'critical', category: 'security', file: 'application.yml', line: 14, root_cause: 'Segredo no código.', recommendation: 'Mover para variável de ambiente.', auto_fixable: false },
          { id: 'smell:large-service', title: 'OrderService grande', severity: 'medium', category: 'architecture', file: 'OrderService.java', line: null, root_cause: 'Mistura camadas.', recommendation: 'Separar camadas.', auto_fixable: false },
        ],
      },
      degraded: true,
      generated_at: '2026-06-26T00:00:00Z',
    },
    plan: {
      project_id: 'ingest-modernize-cockpit',
      phases: [
        { id: 'critical', title: 'Fase 1 — Correções críticas', actions: [{ id: 'remove_real_env', title: 'Remover .env reais', phase_id: 'critical', auto_fixable: true, requires_extra_confirmation: false }] },
        { id: 'devops', title: 'Fase 5 — DevOps', actions: [{ id: 'readme_missing', title: 'Criar README', phase_id: 'devops', auto_fixable: true, requires_extra_confirmation: false }] },
      ],
    },
  };
}

function generationFixture() {
  return {
    ok: true,
    project_id: 'modernized-cockpit',
    file_count: 18,
    written: true,
    degraded: false,
    errors: [],
    validation_report: {
      contractVersion: '1.0.0',
      project_id: 'modernized-cockpit',
      score: 91,
      passed: true,
      quality: {
        contractVersion: '1.0.0',
        project_id: 'modernized-cockpit',
        framework: 'nextjs',
        template_id: 'modernize-clean',
        profile_id: 'enterprise',
        passed: true,
        failed: false,
        score: 92,
        checks: [
          {
            contractVersion: '1.0.0',
            id: 'test-smoke',
            label: 'Smoke tests',
            category: 'structure',
            status: 'passed',
            required: true,
            message: 'Smoke tests generated.',
            paths: ['tests/smoke.spec.ts'],
          },
          {
            contractVersion: '1.0.0',
            id: 'docker-compose',
            label: 'Docker Compose',
            category: 'manifest',
            status: 'passed',
            required: false,
            message: 'Docker manifest present.',
            paths: ['docker-compose.yml'],
          },
        ],
        warnings: [],
        missing_files: [],
        security_findings: [],
      },
      security_findings: [],
      dependency_audit: { status: 'passed', skipped_reason: null, findings: [] },
      build: {
        installed: 'passed',
        built: 'passed',
        ok: true,
        skipped_reason: null,
        logs_tail: 'npm run build\nCompiled successfully.',
      },
      warnings: [],
    },
  };
}

async function mockModernize(page: Page) {
  const auth = authFixture();
  await page.addInitScript((payload) => {
    window.localStorage.removeItem('ldcn-modernize-cockpit-open-panels');
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const jsonHeaders = { 'Content-Type': 'application/json' };
      if (url.includes('/api/auth/refresh')) {
        return new Response(JSON.stringify(payload.auth), { status: 200, headers: jsonHeaders });
      }
      if (url.includes('/api/modernize/projects/git')) {
        return new Response(JSON.stringify(payload.modernize), { status: 201, headers: jsonHeaders });
      }
      if (/\/api\/modernize\/[^/]+\/analyze/.test(url)) {
        return new Response(JSON.stringify(payload.report), { status: 200, headers: jsonHeaders });
      }
      if (url.includes('/api/modernize/generate')) {
        return new Response(JSON.stringify(payload.generation), { status: 200, headers: jsonHeaders });
      }
      return originalFetch(input, init);
    };
  }, { auth, modernize: modernizeFixture(), generation: generationFixture(), report: reportFixture() });
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes('/api/modernize/projects/git')) return route.fulfill({ status: 201, json: modernizeFixture() });
    if (/\/api\/modernize\/[^/]+\/analyze/.test(url)) return route.fulfill({ json: reportFixture() });
    if (url.includes('/api/modernize/generate')) return route.fulfill({ json: generationFixture() });
    if (url.includes('/api/registry/')) return route.fulfill({ json: [] });
    if (url.includes('/api/skills')) return route.fulfill({ json: { contractVersion: '1.0.0', categories: [], skills: [] } });
    if (url.includes('/api/templates')) return route.fulfill({ json: { contractVersion: '1.0.0', templates: [], categories: [], stacks: [] } });
    if (url.includes('/api/system-status')) {
      return route.fulfill({
        json: {
          contractVersion: '1.0.0',
          backend_status: { contractVersion: '1.0.0', id: 'backend', label: 'Backend', status: 'healthy', detail: 'ok' },
          frontend_status: { contractVersion: '1.0.0', id: 'frontend', label: 'Frontend', status: 'healthy', detail: 'ok' },
          api_status: { contractVersion: '1.0.0', id: 'api', label: 'API', status: 'healthy', detail: 'ok' },
          build_status: { contractVersion: '1.0.0', id: 'build', label: 'Build', status: 'healthy', detail: 'ok' },
          last_validation: '2026-06-26',
          test_coverage: 'Modernize cockpit spec.',
          active_modules: ['modernize'],
          active_engines: ['modernize_analysis_engine'],
          active_templates: [],
          active_skills: [],
          planned_extensions: [],
          registry_health: [],
        },
      });
    }
    return route.fulfill({ status: 200, json: { contractVersion: '1.0.0' } });
  });
}

test('renders Modernize as an engineering cockpit with grouped analysis and generation flow', async ({ page }) => {
  await mockModernize(page);
  await page.goto(`${WEB_BASE}/modernize`);

  await expect(page.getByRole('heading', { name: 'Modernize', exact: true })).toBeVisible();
  await expect(page.getByText('Engineering Cockpit')).toBeVisible();
  await expect(page.getByTestId('modernize-panel-executive')).toBeVisible();
  await expect(page.getByTestId('modernize-panel-ingestion')).toBeVisible();

  await page.getByRole('button', { name: 'Repositorio Git', exact: true }).click();
  await page.getByPlaceholder('https://github.com/org/repo.git').fill('https://github.com/ldcn/example.git');
  await page.getByRole('button', { name: /Analisar/ }).click();

  await expect(page.getByText('Modernization advised').first()).toBeVisible();
  await expect(page.getByText('Software Architect Review')).toBeVisible();
  await page.getByTestId('modernize-panel-findings').click();
  await expect(page.getByText('Hardcoded API key found in configuration.')).toBeVisible();
  await expect(page.getByText('Spring Boot + React').first()).toBeVisible();
  await expect(page.getByTestId('modernize-panel-architecture')).toContainText('Architecture Graph');
  await expect(page.getByTestId('modernize-panel-auto-fix')).toContainText('Auto Fix Center');
  await expect(page.getByTestId('modernize-panel-security')).toContainText('Security Center');
  await expect(page.getByTestId('modernize-panel-conversation')).toContainText('Deterministico');

  await page.getByRole('button', { name: 'dependencies', exact: true }).click();
  await expect(page.getByText('package.json contains outdated dependency ranges')).toBeVisible();

  await page.getByTestId('modernize-panel-auto-fix').click();
  await page.getByLabel(/Gerar documentacao inicial/).check();
  await expect(page.getByTestId('modernize-panel-auto-fix')).toContainText('1 ligadas');

  await page.getByRole('button', { name: /Modernizar Projeto/ }).first().click();
  await page.getByTestId('modernize-panel-artifacts').click();
  await expect(page.getByText('Projeto modernizado gerado: modernized-cockpit')).toBeVisible();
  await expect(page.getByTestId('modernize-panel-pipeline')).toContainText('Executado');
  await page.getByTestId('modernize-panel-terminal').click();
  await expect(page.getByText('generated modernized-cockpit with 18 files')).toBeVisible();
});

test('keeps the Modernize cockpit readable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockModernize(page);
  await page.goto(`${WEB_BASE}/modernize`);

  await expect(page.getByRole('heading', { name: 'Modernize', exact: true })).toBeVisible();
  await expect(page.getByTestId('modernize-panel-executive')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ingerir projeto/ })).toBeVisible();
});
