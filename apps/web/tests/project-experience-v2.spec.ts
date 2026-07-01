import { expect, test, type Page } from '@playwright/test';

import { webUrl } from './test-urls';

const API_BASE = 'http://127.0.0.1:8001/api';

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

function projectFixture() {
  return {
    contractVersion: '1.0.0',
    project_id: 'project_v2',
    project_name: 'Clinic Command Center',
    status: 'generated',
    locale: 'pt-BR',
    generation_mode: 'local_build_90',
    technology_graph: {
      language: { id: 'typescript', name: 'TypeScript', ecosystem: 'node' },
      runtime: { id: 'nodejs', name: 'Node.js' },
      framework: { id: 'nextjs', name: 'Next.js' },
      architecture: { id: 'modular_monolith', name: 'Modular Monolith' },
    },
    architecture_id: 'modular_monolith',
    archetype_id: 'medical_crm',
    selected_capabilities: ['authentication', 'observability'],
    selected_business_modules: ['patients', 'appointments'],
    selected_endpoints: ['patients.list', 'appointments.create'],
    blueprint_snapshot: {
      contractVersion: '1.0.0',
      blueprint_id: 'blueprint_v2',
      project_name: 'Clinic Command Center',
      locale: 'pt-BR',
      generation_mode: 'local_build_90',
      generated_at: '2026-06-25T00:00:00Z',
      technology_graph: {
        language: { id: 'typescript', name: 'TypeScript', ecosystem: 'node' },
        runtime: { id: 'nodejs', name: 'Node.js' },
        framework: { id: 'nextjs', name: 'Next.js' },
        architecture: { id: 'modular_monolith', name: 'Modular Monolith' },
      },
      project_requirements: {
        project_goal: 'Clinic CRM',
        business_context: 'medical clinic patient scheduling',
        target_users: ['admin'],
        business_rules: ['LGPD'],
        entities: ['Patient', 'Appointment'],
        workflows: ['schedule'],
        constraints: ['secure'],
        delivery_target: 'production',
      },
      architecture_profile: { architecture_id: 'modular_monolith' },
      archetype_profile: { archetype_id: 'medical_crm' },
      capabilities: [{ id: 'authentication' }, { id: 'observability' }],
      business_modules: [{ id: 'patients' }, { id: 'appointments' }],
      endpoints: [{ id: 'patients.list' }, { id: 'appointments.create' }],
      infrastructure_profile: {
        contractVersion: '1.0.0',
        architecture_level: 'level_2_growth',
        selected_component_ids: ['postgresql', 'vercel'],
        recommended_component_ids: [],
        required_component_ids: [],
        optional_component_ids: [],
        warnings: [],
        rationale: [],
      },
      complexity_profile: {
        overall_score: 52,
        risk_level: 'medium',
        learning_curve: 'medium',
        implementation_effort: 'medium',
        infrastructure_cost: 'medium',
        maintenance_cost: 'medium',
      },
      recommendations: [],
      validation: { valid: true, errors: [], warnings: [] },
    },
    architectural_graph_snapshot: null,
    prompt_master_snapshot: {
      contractVersion: '1.0.0',
      prompt_master_id: 'prompt_v2',
      blueprint_id: 'blueprint_v2',
      project_name: 'Clinic Command Center',
      locale: 'pt-BR',
      locale_profile: {},
      generation_mode: 'local_build_90',
      source_blueprint_valid: true,
      version: { document_version: '1.0.0', engine_version: '1.0.0', generated_at: '2026-06-25T00:00:00Z' },
      validation: { valid: true, errors: [], warnings: [], constraints: [] },
      sections: [],
      trace: { blueprint_id: 'blueprint_v2', source_selection_ids: { language_id: 'typescript', runtime_id: 'nodejs', framework_id: 'nextjs', architecture_id: 'modular_monolith', archetype_id: 'medical_crm', capability_ids: [], business_module_ids: [], endpoint_ids: [] }, included_sections: [], redacted_fields: [], contains_secrets: false },
      compiled_prompt: '',
      generated_at: '2026-06-25T00:00:00Z',
    },
    gatekeeper_snapshot: {
      contractVersion: '1.0.0',
      gatekeeper_report_id: 'gate_v2',
      blueprint_id: 'blueprint_v2',
      prompt_master_id: 'prompt_v2',
      decision: 'approved',
      summary: 'Approved',
      checks: [],
      blockers: [],
      warnings: [],
      generated_at: '2026-06-25T00:00:00Z',
    },
    readiness_status: 'generated',
    created_at: '2026-06-25T00:00:00Z',
    updated_at: '2026-06-25T00:30:00Z',
    generated_project_path: 'generated-projects/project_v2',
  };
}

const filesFixture = {
  contractVersion: '1.0.0',
  project_id: 'project_v2',
  root_path: 'generated-projects/project_v2',
  files: [
    { relative_path: 'package.json', kind: 'file', size_bytes: 300, checksum: 'pkg', extension: '.json', preview_supported: true },
    { relative_path: 'app/page.tsx', kind: 'file', size_bytes: 640, checksum: 'page', extension: '.tsx', preview_supported: true },
    { relative_path: 'components/PatientPanel.tsx', kind: 'file', size_bytes: 420, checksum: 'component', extension: '.tsx', preview_supported: true },
    { relative_path: 'README.md', kind: 'file', size_bytes: 500, checksum: 'readme', extension: '.md', preview_supported: true },
    { relative_path: 'Dockerfile', kind: 'file', size_bytes: 120, checksum: 'docker', extension: null, preview_supported: true },
  ],
  directories: [
    { relative_path: 'app', kind: 'directory', size_bytes: 0, checksum: null, extension: null, preview_supported: false },
    { relative_path: 'components', kind: 'directory', size_bytes: 0, checksum: null, extension: null, preview_supported: false },
  ],
  file_count: 5,
  total_size_bytes: 1980,
  security: { status: 'safe', message: 'safe', blocked_files: [], blocked_count: 0 },
};

const qualityFixture = {
  contractVersion: '1.0.0',
  project_id: 'project_v2',
  framework: 'nextjs',
  template_id: 'nextjs-clinic',
  profile_id: 'medical_crm',
  passed: true,
  failed: false,
  score: 94,
  checks: [
    { contractVersion: '1.0.0', id: 'nextjs_package', label: 'Next.js package exists', category: 'structure', status: 'passed', required: true, message: 'package exists', paths: ['package.json'] },
    { contractVersion: '1.0.0', id: 'dockerfile', label: 'Dockerfile exists', category: 'structure', status: 'passed', required: false, message: 'docker exists', paths: ['Dockerfile'] },
  ],
  warnings: [],
  missing_files: [],
  security_findings: [],
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
  await page.route('**/api/auth/refresh**', async (route) => route.fulfill({ json: authFixture }));
  await page.route('**/api/auth/me**', async (route) => route.fulfill({ json: authFixture.user }));
  await page.route('**/api/registry/**', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/skills**', async (route) => route.fulfill({ json: { skills: [], categories: [] } }));
  await page.route('**/api/templates**', async (route) => route.fulfill({ json: [] }));
  await page.route('**/api/system-status**', async (route) => route.fulfill({ json: { status: 'ok', services: [] } }));
  await page.route('**/api/projects/project_v2', async (route) => route.fulfill({ json: projectFixture() }));
  await page.route('**/api/generation/project_v2/files', async (route) => route.fulfill({ json: filesFixture }));
  await page.route('**/api/generation/project_v2/file-content**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path') ?? 'app/page.tsx';
    await route.fulfill({
      json: {
        contractVersion: '1.0.0',
        project_id: 'project_v2',
        relative_path: path,
        size_bytes: 640,
        preview_supported: true,
        content_type: 'text',
        content: path.endsWith('README.md') ? '# Clinic Command Center' : 'export default function Page() { return <main>Clinic Command Center</main>; }',
        unsupported_reason: null,
      },
    });
  });
  await page.route('**/api/generated-projects/project_v2/quality-check', async (route) => route.fulfill({ json: qualityFixture }));
  await page.route('**/api/integrations/git/github', async (route) => route.fulfill({ json: { provider: 'github', status: 'connected', username: 'ldcn-test', connected_at: '2026-06-25T00:00:00Z' } }));
  await page.route('**/api/integrations/git/gitlab', async (route) => route.fulfill({ json: { provider: 'gitlab', status: 'not_connected', username: null, connected_at: null } }));
  await page.route('**/api/generation/project_v2/prepare-download', async (route) => route.fulfill({ json: { contractVersion: '1.0.0', project_id: 'project_v2', status: 'prepared', download_url: '/api/generation/project_v2/download', zip_size_bytes: 1024, file_count: 5, source_size_bytes: 1980, security: { status: 'safe', message: 'safe', blocked_files: [], blocked_count: 0 } } }));
}

test('Project Experience V2 presents a cinematic project journey from real data', async ({ page }) => {
  await setup(page);
  await page.goto(webUrl('/projects/project_v2'));

  await expect(page.getByRole('heading', { name: 'Clinic Command Center' })).toBeVisible();
  await expect(page.getByText('Saude / Operacao Clinica')).toBeVisible();
  await expect(page.getByText('Live Project Preview')).toBeVisible();
  await expect(page.getByText('Technology Verified')).toBeVisible();
  await expect(page.getByText('TypeScript', { exact: true })).toBeVisible();
  await expect(page.getByText('Architecture Experience')).toBeVisible();
  await page.getByRole('button', { name: /Backend/ }).click();
  await expect(page.getByText('No selecionado')).toBeVisible();
  await expect(page.getByText('Engineering Dashboard')).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir Laboratorio/ }).first()).toHaveAttribute('href', '/engineering-laboratory?projectId=project_v2');
  await expect(page.getByText('Deploy Center')).toBeVisible();
  await expect(page.getByText('GitHub', { exact: true })).toBeVisible();
  await expect(page.getByText('Documentation')).toBeVisible();
  await expect(page.getByText('README.md').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible();
});

test('Project Experience V2 remains usable on mobile', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(webUrl('/projects/project_v2'));

  await expect(page.getByRole('heading', { name: 'Clinic Command Center' })).toBeVisible();
  await page.getByRole('button', { name: 'Mobile' }).click();
  await expect(page.getByText('app/page.tsx').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir Laboratorio/ }).first()).toBeVisible();
});
