import { expect, test, type Page } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:8001/api';
const PROJECT_URL = 'http://127.0.0.1:3000/projects/project_local';

function projectFixture() {
  return {
    contractVersion: '1.0.0',
    project_id: 'project_local',
    project_name: 'Local Static Project',
    status: 'ready_for_generation',
    locale: 'pt-BR',
    generation_mode: 'local_build_90',
    technology_graph: {
      language: { id: 'typescript', name: 'TypeScript', ecosystem: 'node' },
      runtime: { id: 'nodejs', name: 'Node.js' },
      framework: { id: 'nextjs', name: 'Next.js' },
      architecture: { id: 'modular_monolith', name: 'Modular Monolith' },
    },
    architecture_id: 'modular_monolith',
    archetype_id: 'landing_page',
    selected_capabilities: ['seo', 'analytics'],
    selected_business_modules: ['notifications', 'reports'],
    selected_endpoints: ['analytics.overview'],
    blueprint_snapshot: {
      contractVersion: '1.0.0',
      blueprint_id: 'blueprint_local',
      project_name: 'Local Static Project',
      locale: 'pt-BR',
      generation_mode: 'local_build_90',
      generated_at: '2026-05-28T00:00:00Z',
      technology_graph: {
        language: { id: 'typescript', name: 'TypeScript', ecosystem: 'node' },
        runtime: { id: 'nodejs', name: 'Node.js' },
        framework: { id: 'nextjs', name: 'Next.js' },
        architecture: { id: 'modular_monolith', name: 'Modular Monolith' },
      },
      architecture_profile: { architecture_id: 'modular_monolith' },
      archetype_profile: { archetype_id: 'landing_page' },
      capabilities: [{ id: 'seo' }, { id: 'analytics' }],
      business_modules: [{ id: 'notifications' }, { id: 'reports' }],
      endpoints: [{ id: 'analytics.overview' }],
      infrastructure_profile: {
        contractVersion: '1.0.0',
        architecture_level: 'level_1_mvp',
        selected_component_ids: ['vercel'],
        recommended_component_ids: [],
        required_component_ids: [],
        optional_component_ids: [],
        warnings: [],
        rationale: [],
      },
      complexity_profile: {
        overall_score: 42,
        risk_level: 'low',
        learning_curve: 'low',
        implementation_effort: 'low',
        infrastructure_cost: 'low',
        maintenance_cost: 'low',
      },
      recommendations: [],
      validation: { valid: true, errors: [], warnings: [] },
    },
    architectural_graph_snapshot: {
      contractVersion: '1.0.0',
      source: 'preview',
      graph: {
        contractVersion: '1.0.0',
        graph_id: 'graph_local',
        architecture_id: 'modular_monolith',
        nodes: [{
          contractVersion: '1.0.0',
          id: 'nextjs',
          label: 'Next.js',
          type: 'frontend',
          category: 'framework',
          status: 'healthy',
          burden_score: 'low',
          risk_level: 'low',
          readiness_score: 92,
          ownership_role: 'Frontend Engineer',
          required_skills: [],
          warnings: [],
          recommendations: [],
          health: { contractVersion: '1.0.0', status: 'healthy', summary: 'Healthy' },
          risk: { contractVersion: '1.0.0', level: 'low', score: 10, warnings: [] },
          readiness: { contractVersion: '1.0.0', score: 92, status: 'ready', recommendations: [] },
          ownership: { contractVersion: '1.0.0', role: 'Frontend Engineer', required_skills: [], boundary: 'Static UI' },
        }],
        edges: [],
        layout: { contractVersion: '1.0.0', width: 800, height: 500, direction: 'horizontal', simplified_mobile: false, points: [{ node_id: 'nextjs', x: 120, y: 160, layer: 1 }] },
        warnings: [],
        recommendations: [],
      },
      generated_at: '2026-05-28T00:00:00Z',
    },
    prompt_master_snapshot: {
      contractVersion: '1.0.0',
      prompt_master_id: 'prompt_local',
      blueprint_id: 'blueprint_local',
      project_name: 'Local Static Project',
      source_blueprint_valid: true,
      sections: [{ id: 'scope', title: 'Scope', body: 'Scope', items: [] }],
      validation: { valid: true, errors: [], warnings: [] },
      trace: { blueprint_id: 'blueprint_local', contains_secrets: false },
      generated_at: '2026-05-28T00:00:00Z',
    },
    gatekeeper_snapshot: {
      contractVersion: '1.0.0',
      gatekeeper_report_id: 'gatekeeper_local',
      blueprint_id: 'blueprint_local',
      prompt_master_id: 'prompt_local',
      decision: 'approved',
      summary: 'Approved',
      checks: [],
      blockers: [],
      warnings: [],
      generated_at: '2026-05-28T00:00:00Z',
    },
    readiness_status: 'ready',
    created_at: '2026-05-28T00:00:00Z',
    updated_at: '2026-05-28T00:00:00Z',
  };
}

function generationResult(status: 'generated' | 'blocked' = 'generated') {
  return {
    contractVersion: '1.0.0',
    generation_id: 'localgen_preview',
    project_id: 'project_local',
    project_name: 'Local Static Project',
    status,
    runtime: 'local_static_v0',
    template_id: status === 'generated' ? 'landing-page' : null,
    template_name: status === 'generated' ? 'Next.js Static Landing' : null,
    output_path: 'generated-projects/active/local-static',
    handoff_readiness: status === 'generated' ? 'ready' : 'blocked',
    artifacts: status === 'generated' ? [
      { contractVersion: '1.0.0', id: 'artifact_readme', kind: 'file', relative_path: 'README.md', size_bytes: 120, checksum: 'abc' },
      { contractVersion: '1.0.0', id: 'artifact_page', kind: 'file', relative_path: 'app/page.tsx', size_bytes: 240, checksum: 'def' },
    ] : [],
    file_map: {
      contractVersion: '1.0.0',
      root_path: 'generated-projects/active/local-static',
      files: status === 'generated' ? [
        { relative_path: 'README.md', size_bytes: 120, checksum: 'abc' },
        { relative_path: 'app/page.tsx', size_bytes: 240, checksum: 'def' },
      ] : [],
      directories: status === 'generated' ? ['app'] : [],
    },
    trace: [
      { contractVersion: '1.0.0', timestamp: '2026-05-28T00:00:00Z', step: 'handoff_validation', status: status === 'generated' ? 'completed' : 'blocked', message: status === 'generated' ? 'Handoff readiness is ready.' : 'Generation blocked by unsupported architecture.', safe: true },
      { contractVersion: '1.0.0', timestamp: '2026-05-28T00:00:00Z', step: 'template_resolution', status: status === 'generated' ? 'completed' : 'blocked', message: status === 'generated' ? "Template 'landing-page' resolved with 5 files." : 'Generation blocked by unsupported architecture.', safe: true },
    ],
    failures: status === 'blocked' ? [{ contractVersion: '1.0.0', code: 'unsupported_architecture', message: 'Generation blocked by unsupported architecture.', recoverable: true, related_ids: ['microservices'] }] : [],
    metadata: { no_ai: true, no_agents: true },
  };
}

function generatedFilesFixture() {
  return {
    contractVersion: '1.0.0',
    project_id: 'project_local',
    root_path: 'generated-projects/active/local-static',
    files: [
      { relative_path: 'README.md', kind: 'file', size_bytes: 120, checksum: 'abc', extension: '.md', preview_supported: true },
      { relative_path: 'app/page.tsx', kind: 'file', size_bytes: 240, checksum: 'def', extension: '.tsx', preview_supported: true },
      { relative_path: 'public/logo.png', kind: 'file', size_bytes: 2048, checksum: 'ghi', extension: '.png', preview_supported: false },
    ],
    directories: [
      { relative_path: 'app', kind: 'directory', size_bytes: 0, checksum: null, extension: null, preview_supported: false },
      { relative_path: 'public', kind: 'directory', size_bytes: 0, checksum: null, extension: null, preview_supported: false },
    ],
    file_count: 3,
    total_size_bytes: 2408,
    security: {
      status: 'safe',
      message: 'Generated project files passed local safety filters.',
      blocked_files: [],
      blocked_count: 0,
    },
  };
}

function fileContentFixture(path: string) {
  if (path === 'public/logo.png') {
    return {
      contractVersion: '1.0.0',
      project_id: 'project_local',
      relative_path: path,
      size_bytes: 2048,
      preview_supported: false,
      content_type: 'binary',
      content: null,
      unsupported_reason: 'Binary file preview is unsupported.',
    };
  }
  return {
    contractVersion: '1.0.0',
    project_id: 'project_local',
    relative_path: path,
    size_bytes: path === 'README.md' ? 120 : 240,
    preview_supported: true,
    content_type: 'text',
    content: path === 'README.md' ? '# Local Static Project\n\nGenerated preview.' : 'export default function Page() {\n  return <main>Local Static Project</main>;\n}',
    unsupported_reason: null,
  };
}

function preparedDownloadFixture() {
  return {
    contractVersion: '1.0.0',
    project_id: 'project_local',
    status: 'prepared',
    download_url: '/api/generation/project_local/download',
    zip_size_bytes: 1536,
    file_count: 3,
    source_size_bytes: 2408,
    security: {
      status: 'safe',
      message: 'Generated project files passed local safety filters.',
      blocked_files: [],
      blocked_count: 0,
    },
  };
}

function templateDetailFixture() {
  return {
    contractVersion: '1.0.0',
    id: 'landing-page',
    name: 'Next.js Static Landing',
    description: 'Static landing page generated from the local template registry.',
    version: '1.0.0',
    category: 'marketing',
    supported_languages: ['typescript'],
    supported_frameworks: ['nextjs'],
    supported_architectures: ['modular_monolith'],
    supported_archetypes: ['landing_page'],
    capabilities: ['seo', 'analytics'],
    complexity: 'medium',
    maturity: 'stable',
    preview_images: ['/templates/landing-page/preview.png'],
    tags: ['landing', 'static'],
    changelog: [
      {
        contractVersion: '1.0.0',
        version: '1.0.0',
        date: '2026-06-02',
        changes: ['Initial local marketplace metadata'],
      },
    ],
  };
}

async function mockProject(
  page: Page,
  status: 'generated' | 'blocked' = 'generated',
  delayMs = 0,
  filesMode: 'ready' | 'offline' | 'not_generated' = 'ready',
) {
  const project = projectFixture();
  await page.route(`${API_BASE}/projects/project_local`, async (route) => route.fulfill({ json: project }));
  await page.route(`${API_BASE}/engineering/**`, async (route) => route.abort('failed'));
  await page.route(`${API_BASE}/system-design/**`, async (route) => route.abort('failed'));
  await page.route(`${API_BASE}/architectural-graph/preview`, async (route) => route.fulfill({ json: project.architectural_graph_snapshot.graph }));
  await page.route(`${API_BASE}/generation/project_local/files`, async (route) => {
    if (filesMode === 'offline') {
      await route.abort('failed');
      return;
    }
    if (filesMode === 'not_generated') {
      await route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'http_409',
            message: 'Project has no generated project path. Run local generation first.',
            details: [],
          },
        },
      });
      return;
    }
    await route.fulfill({ json: generatedFilesFixture() });
  });
  await page.route(`${API_BASE}/generation/project_local/file-content**`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ json: fileContentFixture(url.searchParams.get('path') ?? 'README.md') });
  });
  await page.route(`${API_BASE}/generation/project_local/prepare-download`, async (route) => route.fulfill({ json: preparedDownloadFixture() }));
  await page.route(`${API_BASE}/generation/project_local/download`, async (route) =>
    route.fulfill({ status: 200, contentType: 'application/zip', body: 'PK mock zip' }),
  );
  await page.route(`${API_BASE}/templates/landing-page`, async (route) => route.fulfill({ json: templateDetailFixture() }));
  await page.route(`${API_BASE}/generation/local-run`, async (route) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ json: generationResult(status) });
  });
}

async function openAndFill(page: Page) {
  await page.goto(PROJECT_URL);
  await page.getByLabel('Local generation output path').fill('generated-projects/active/local-static');
}

test('local generation shows progress while running', async ({ page }) => {
  await mockProject(page, 'generated', 400);
  await openAndFill(page);
  await page.getByRole('button', { name: 'Generate Locally' }).click();

  await expect(page.getByRole('button', { name: 'Generating locally' })).toBeVisible();
});

test('local generation success renders artifacts and file tree', async ({ page }) => {
  await mockProject(page);
  await openAndFill(page);
  await page.getByRole('button', { name: 'Generate Locally' }).click();

  await expect(page.getByTestId('local-generation-section').getByText('generated', { exact: true })).toBeVisible();
  await expect(page.getByText('File System Snapshot')).toBeVisible();
  await expect(page.getByText('app/page.tsx', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('README.md', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('project-template-section').getByText('Next.js Static Landing')).toBeVisible();
  await expect(page.getByText('Template maturity verified')).toBeVisible();
});

test('local generation blocked state is visible', async ({ page }) => {
  await mockProject(page, 'blocked');
  await openAndFill(page);
  await page.getByRole('button', { name: 'Generate Locally' }).click();

  await expect(page.getByText('Safe failure handling')).toBeVisible();
  await expect(page.getByText('Generation blocked by unsupported architecture.', { exact: true }).first()).toBeVisible();
});

test('local generation stays safe when backend is offline', async ({ page }) => {
  await mockProject(page);
  await page.route(`${API_BASE}/generation/local-run`, async (route) => route.abort('failed'));
  await openAndFill(page);
  await page.getByRole('button', { name: 'Generate Locally' }).click();

  await expect(page.getByText('Local generation unavailable')).toBeVisible();
});

test('generated file explorer appears with indexed files', async ({ page }) => {
  await mockProject(page);
  await page.goto(PROJECT_URL);

  await expect(page.getByTestId('generated-file-explorer-section')).toBeVisible();
  await expect(page.getByText('Generated File Explorer')).toBeVisible();
  await expect(page.getByText('Generated files indexed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select generated file README.md' })).toBeVisible();
});

test('selecting generated file shows text preview', async ({ page }) => {
  await mockProject(page);
  await page.goto(PROJECT_URL);
  await page.getByRole('button', { name: 'Select generated file app/page.tsx' }).click();

  await expect(page.getByText('export default function Page')).toBeVisible();
  await expect(page.getByText('text only')).toBeVisible();
});

test('prepare generated download enables zip button', async ({ page }) => {
  await mockProject(page);
  await page.goto(PROJECT_URL);
  await page.getByRole('button', { name: 'Prepare Download' }).click();

  await expect(page.getByRole('link', { name: 'Download ZIP' })).toBeVisible();
  await expect(page.getByText('Secure ZIP prepared')).toBeVisible();
  await expect(page.getByText('Download ready')).toBeVisible();
  await expect(page.getByText('1.5 KB')).toBeVisible();
});

test('generated file explorer has backend offline safe state', async ({ page }) => {
  await mockProject(page, 'generated', 0, 'offline');
  await page.goto(PROJECT_URL);

  await expect(page.getByText('Generated files unavailable')).toBeVisible();
});

test('generated file explorer shows empty state before project is generated', async ({ page }) => {
  await mockProject(page, 'generated', 0, 'not_generated');
  await page.goto(PROJECT_URL);

  await expect(page.getByTestId('generated-files-empty-state')).toBeVisible();
  await expect(page.getByText('Project not generated yet')).toBeVisible();
});

test('binary generated file shows unsupported preview presence', async ({ page }) => {
  await mockProject(page);
  await page.goto(PROJECT_URL);
  await page.getByRole('button', { name: 'Select generated file public/logo.png' }).click();

  await expect(page.getByText('Unsupported preview')).toBeVisible();
  await expect(page.getByText('Preview blocked for binary/large file')).toBeVisible();
});
