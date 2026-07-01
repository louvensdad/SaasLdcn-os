import { expect, test, type Page } from '@playwright/test';

const WEB_BASE = 'http://127.0.0.1:3000';

function authFixture() {
  const now = '2026-06-26T00:00:00Z';
  return {
    user: {
      user_id: 'roadmap-user',
      email: 'roadmap@example.com',
      full_name: 'Roadmap User',
      role: 'admin',
      locale: 'pt-BR',
      is_active: true,
      consent_accepted_at: now,
      consent_policy_version: '1.0.0',
      created_at: now,
      updated_at: now,
    },
    tokens: { access_token: 'roadmap-token', token_type: 'bearer', expires_in: 3600 },
  };
}

async function mockAuth(page: Page) {
  const fixture = authFixture();
  await page.addInitScript((authResponse) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/auth/refresh')) {
        return new Response(JSON.stringify(authResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };
  }, fixture);
  await page.route('**/api/auth/refresh', async (route) => route.fulfill({ json: fixture }));
  await page.route('**/api/auth/me', async (route) => route.fulfill({ json: fixture.user }));
}

function item(overrides: Record<string, unknown>) {
  return {
    contractVersion: '1.0.0',
    id: 'item',
    title: 'Item',
    category: 'module',
    status: 'IMPLEMENTED',
    summary: 'Governed roadmap item.',
    progress: 100,
    dependencies: [],
    release: 'v1',
    updated_at: '2026-06-26',
    owner: 'Platform',
    priority: 'HIGH',
    maturity: 'BETA',
    risk: 'LOW',
    risk_basis: ['Derived from roadmap metadata.'],
    engines: [],
    apis: [],
    skills: [],
    contracts: [],
    documentation: [],
    impact: 'Downstream modules depend on this item.',
    tags: ['backend'],
    ...overrides,
  };
}

function roadmapFixture() {
  const items = [
    item({ id: 'project_room', title: 'Project Room', category: 'module', tags: ['frontend', 'backend'], apis: ['GET /api/project-rooms'], contracts: ['project-room.contract.ts'], documentation: ['Project Room docs'] }),
    item({ id: 'prompt_master', title: 'PromptMaster', category: 'ai', dependencies: ['project_room'], tags: ['ia', 'documentation'], engines: ['prompt_master_md_engine'], apis: ['POST /api/project-rooms/{room_id}/generate-prompt'], contracts: ['prompt-master.contract.ts'], documentation: ['PromptMaster.md'], impact: 'Architect loses canonical project brief.' }),
    item({ id: 'architect', title: 'Architect', category: 'architecture', dependencies: ['prompt_master'], tags: ['architecture'], engines: ['architectural_graph_engine'], apis: ['GET /api/architectures'], contracts: ['architecture.contract.ts'], documentation: ['Architecture report'] }),
    item({ id: 'blueprint', title: 'Blueprint', category: 'architecture', dependencies: ['architect'], tags: ['architecture', 'api'], apis: ['POST /api/blueprints/preview'], contracts: ['blueprint.contract.ts'] }),
    item({ id: 'meta_factory', title: 'Meta-Factory', category: 'engine', dependencies: ['blueprint'], tags: ['backend', 'engine', 'quality'], engines: ['meta_factory_engine'], apis: ['POST /api/meta-factory/generate'], contracts: ['meta-factory.contract.ts'], risk: 'HIGH', impact: 'No generated artifact can be created.' }),
    item({ id: 'engineering_review', title: 'Engineering Review', category: 'module', dependencies: ['blueprint'], tags: ['quality', 'security', 'tests'], apis: ['POST /api/generated-projects/{project_id}/quality-check'], contracts: ['generated-project-quality.contract.ts'] }),
    item({ id: 'engineering_laboratory', title: 'Engineering Laboratory', category: 'laboratory', status: 'IN_PROGRESS', progress: 84, dependencies: ['meta_factory', 'engineering_review'], release: 'v2.5', owner: 'Engineering Tools', priority: 'CRITICAL', maturity: 'ALPHA', risk: 'HIGH', tags: ['laboratory', 'security', 'tests'], engines: ['engineering_lab_engine'], apis: ['GET /api/engineering-lab/projects/{project_id}/overview'], contracts: ['engineering_lab.py'], documentation: ['reports/engineering_laboratory.md'] }),
    item({ id: 'deploy_center', title: 'Deploy Center', category: 'deploy', status: 'IN_PROGRESS', progress: 58, dependencies: ['engineering_laboratory'], release: 'v2.5', tags: ['deploy', 'devops', 'cloud'], risk: 'HIGH' }),
    item({ id: 'analytics_center', title: 'Analytics Center', category: 'visualization', status: 'PLANNED', progress: 20, dependencies: ['engineering_laboratory'], release: 'v3', tags: ['analytics'] }),
    item({ id: 'agent_runtime', title: 'Agent Runtime', category: 'agent', status: 'FUTURE', progress: 0, dependencies: ['engineering_laboratory'], release: 'v4', risk: 'CRITICAL', tags: ['agents', 'ia', 'security'] }),
    item({ id: 'legacy_placeholders', title: 'Archived Placeholders', category: 'module', status: 'ARCHIVED', progress: 0, release: 'v1', tags: ['archive'] }),
  ];
  return {
    contractVersion: '1.0.0',
    statuses: ['IMPLEMENTED', 'IN_PROGRESS', 'PLANNED', 'FUTURE', 'ARCHIVED'],
    items,
    releases: [
      { contractVersion: '1.0.0', id: 'v1', title: 'Foundation', date: '2026-06-02', status: 'DELIVERED', progress: 100, features: ['project_room'], dependencies: [], risks: [] },
      { contractVersion: '1.0.0', id: 'v2.5', title: 'Engineering control plane', date: '2026-06-26', status: 'ACTIVE', progress: 72, features: ['engineering_laboratory', 'deploy_center'], dependencies: ['meta_factory'], risks: ['Execution boundaries required.'] },
      { contractVersion: '1.0.0', id: 'v3', title: 'Observability and analytics', date: '2026-07-30', status: 'PLANNED', progress: 20, features: ['analytics_center'], dependencies: ['engineering_laboratory'], risks: ['Telemetry unavailable.'] },
    ],
    platform_timeline: items.slice(0, 9).map((entry) => ({ contractVersion: '1.0.0', id: entry.id, title: entry.title, status: entry.status, description: entry.summary, dependencies: entry.dependencies, engines: entry.engines, apis: entry.apis, documentation: entry.documentation })),
    dependency_edges: [
      { contractVersion: '1.0.0', source: 'project_room', target: 'prompt_master', kind: 'dependency', impact: 'PromptMaster depends on Project Room.' },
      { contractVersion: '1.0.0', source: 'meta_factory', target: 'engineering_laboratory', kind: 'dependency', impact: 'Laboratory depends on generated artifacts.' },
    ],
    impact_edges: [
      { contractVersion: '1.0.0', source: 'engineering_laboratory', target: 'meta_factory', kind: 'impact', impact: 'Loss of artifacts degrades laboratory.' },
    ],
    executive_health: [
      { contractVersion: '1.0.0', id: 'runtime', label: 'Runtime', value: 98, status: 'healthy', basis: 'Derived from active runtime roadmap items.' },
      { contractVersion: '1.0.0', id: 'laboratory', label: 'Laboratorio', value: 84, status: 'warning', basis: 'Engineering Laboratory roadmap progress.' },
    ],
    coverage: [
      { contractVersion: '1.0.0', id: 'backend', label: 'Backend', value: 95, status: 'healthy', basis: 'Backend roadmap coverage.' },
      { contractVersion: '1.0.0', id: 'deploy', label: 'Deploy', value: 58, status: 'blocked', basis: 'Deploy Center progress.' },
    ],
    platform_metrics: [
      { contractVersion: '1.0.0', id: 'platform', label: 'Plataforma', value: '78%', detail: 'Average progress across non-archived roadmap items.' },
      { contractVersion: '1.0.0', id: 'projects', label: 'Projetos', value: '3', detail: 'Project repository count.' },
      { contractVersion: '1.0.0', id: 'engines', label: 'Motores', value: '6', detail: 'Backend engines.' },
      { contractVersion: '1.0.0', id: 'agents', label: 'Agentes', value: '1', detail: 'Agent roadmap items.' },
      { contractVersion: '1.0.0', id: 'modules', label: 'Modulos', value: '4', detail: 'Module roadmap items.' },
      { contractVersion: '1.0.0', id: 'skills', label: 'Skills', value: '2', detail: 'Skill registry count.' },
      { contractVersion: '1.0.0', id: 'templates', label: 'Templates', value: '2', detail: 'Template registry count.' },
      { contractVersion: '1.0.0', id: 'architectures', label: 'Arquiteturas', value: '2', detail: 'Architecture-tagged items.' },
    ],
    statistics: [
      { contractVersion: '1.0.0', id: 'deploys', label: 'Deploys', value: '1', detail: 'Deploy-related roadmap capabilities.' },
      { contractVersion: '1.0.0', id: 'validations', label: 'Validacoes', value: '2', detail: 'Quality and security validation items.' },
    ],
    sprints: [
      { contractVersion: '1.0.0', id: 'current', title: 'Sprint Atual', status: 'ACTIVE', progress: 71, tasks: 2, completed: 0, in_progress: 2 },
      { contractVersion: '1.0.0', id: 'next', title: 'Sprint Seguinte', status: 'PLANNED', progress: 0, tasks: 1, completed: 0, in_progress: 0 },
    ],
  };
}

async function mockRoadmap(page: Page) {
  const auth = authFixture();
  await mockAuth(page);
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: auth });
    if (url.includes('/api/auth/me')) return route.fulfill({ json: auth.user });
    if (url.includes('/api/roadmap')) return route.fulfill({ json: roadmapFixture() });
    if (url.includes('/api/registry/')) {
      return route.fulfill({ json: [] });
    }    if (url.includes('/api/skills')) {
      return route.fulfill({ json: { contractVersion: '1.0.0', categories: [], skills: [] } });
    }
    if (url.includes('/api/templates')) {
      return route.fulfill({ json: { contractVersion: '1.0.0', templates: [], categories: [], stacks: [] } });
    }    if (url.includes('/api/system-status')) {
      return route.fulfill({
        json: {
          contractVersion: '1.0.0',
          backend_status: { contractVersion: '1.0.0', id: 'backend', label: 'Backend', status: 'healthy', detail: 'ok' },
          frontend_status: { contractVersion: '1.0.0', id: 'frontend', label: 'Frontend', status: 'healthy', detail: 'ok' },
          api_status: { contractVersion: '1.0.0', id: 'api', label: 'API', status: 'healthy', detail: 'ok' },
          build_status: { contractVersion: '1.0.0', id: 'build', label: 'Build', status: 'healthy', detail: 'ok' },
          last_validation: '2026-06-26',
          test_coverage: 'Focused specs.',
          active_modules: ['api', 'web'],
          active_engines: ['roadmap_engine'],
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

test('renders executive roadmap center with releases, timeline, health and maps', async ({ page }) => {
  await mockRoadmap(page);
  await page.goto(`${WEB_BASE}/roadmap`);

  await expect(page.getByRole('heading', { name: 'Roadmap Center', exact: true })).toBeVisible();
  await expect(page.getByText('Centro de planejamento estrategico da plataforma.')).toBeVisible();
  await expect(page.getByRole('main').getByText('Plataforma', { exact: true })).toBeVisible();
  await expect(page.getByText('78%')).toBeVisible();

  await expect(page.getByTestId('release-v2.5')).toBeVisible();
  await page.getByTestId('release-v2.5').click({ force: true });
  await expect(page.getByText('Engineering control plane').first()).toBeVisible();
  await expect(page.getByText('Execution boundaries required.')).toBeVisible();

  await expect(page.getByText('Fluxo de engenharia')).toBeVisible();
  await page.getByRole('button', { name: /Engineering Laboratory/ }).first().click();
  await expect(page.getByText('Modulo aberto')).toBeVisible();
  await expect(page.getByText('engineering_lab_engine')).toBeVisible();

  await expect(page.getByText('Saude da plataforma')).toBeVisible();
  await expect(page.getByText('Laboratorio', { exact: true })).toBeVisible();
  await expect(page.getByText('Mapa de Dependencias')).toBeVisible();
  await expect(page.getByText('Mapa de Impacto')).toBeVisible();
});

test('filters, searches and opens accordion module details', async ({ page }) => {
  await mockRoadmap(page);
  await page.goto(`${WEB_BASE}/roadmap`);

  await page.getByLabel('Pesquisar roadmap').fill('Blueprint');
  await page.waitForTimeout(100);
  await page.getByTestId('roadmap-section-implemented').click({ force: true });
  await expect(page.getByText('Blueprint').first()).toBeVisible();

  await page.getByLabel('Pesquisar roadmap').fill('');
  await page.getByRole('button', { name: 'Seguranca' }).click();
  await page.waitForTimeout(100);
  await page.getByTestId('roadmap-section-development').click({ force: true });
  await expect(page.getByText('Engineering Laboratory').first()).toBeVisible();

  await page.getByRole('button', { name: 'Todos' }).click();
  await page.waitForTimeout(100);
  await page.getByTestId('roadmap-section-backlog').click({ force: true });
  await expect(page.getByText('Agent Runtime').first()).toBeVisible();
  await page.locator('article').filter({ hasText: 'Agent Runtime' }).getByRole('button', { name: 'Abrir' }).click();
  await expect(page.getByText('Base do risco')).toBeVisible();
});

test('keeps roadmap usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockRoadmap(page);
  await page.goto(`${WEB_BASE}/roadmap`);

  await expect(page.getByRole('heading', { name: 'Roadmap Center', exact: true })).toBeVisible();
  await page.getByLabel('Pesquisar roadmap').fill('Deploy');
  await page.waitForTimeout(100);
  await page.getByTestId('roadmap-section-development').click({ force: true });
  await expect(page.getByText('Deploy Center').first()).toBeVisible();
  await expect(page.getByText('Roadmap visual')).toBeVisible();
});
















