import { expect, test, type Page } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:8001/api';
const WEB_BASE = 'http://127.0.0.1:3000';

function skillsFixture() {
  return {
    contractVersion: '1.0.0',
    categories: ['architecture', 'planning', 'generation', 'support'],
    skills: [
      {
        contractVersion: '1.0.0',
        id: 'review_blueprint',
        name: 'Review Blueprint',
        description: 'Inspect blueprint validation and selected scope.',
        category: 'architecture',
        tags: ['blueprint', 'architecture'],
        requirements: ['Project blueprint exists'],
        examples: ['Review blueprint validation before handoff'],
        dependencies: [{ contractVersion: '1.0.0', id: 'blueprints.preview', label: 'Blueprint preview endpoint', kind: 'endpoint', required: true }],
        metadata: {
          contractVersion: '1.0.0',
          category: 'architecture',
          maturity: 'stable',
          execution_mode: 'read_only',
          safe: true,
          no_ai: true,
          no_agents: true,
          no_external_integrations: true,
        },
      },
      {
        contractVersion: '1.0.0',
        id: 'prepare_download',
        name: 'Prepare Download',
        description: 'Prepare secure ZIP download for generated project.',
        category: 'generation',
        tags: ['download', 'zip'],
        requirements: ['Project has generated path'],
        examples: ['Prepare ZIP after inspecting generated files'],
        dependencies: [{ contractVersion: '1.0.0', id: 'generation.prepare_download', label: 'Prepare download endpoint', kind: 'endpoint', required: true }],
        metadata: {
          contractVersion: '1.0.0',
          category: 'generation',
          maturity: 'stable',
          execution_mode: 'manual_assist',
          safe: true,
          no_ai: true,
          no_agents: true,
          no_external_integrations: true,
        },
      },
    ],
  };
}

function systemStatusFixture() {
  const signal = (id: string, label: string, detail: string) => ({ contractVersion: '1.0.0', id, label, status: 'healthy', detail });
  return {
    contractVersion: '1.0.0',
    backend_status: signal('backend', 'Backend status', 'Foundation API v0.1.0'),
    frontend_status: signal('frontend', 'Frontend status', 'Next.js shell is present.'),
    api_status: signal('api', 'API status', 'Core API routers are registered locally.'),
    build_status: signal('build', 'Build status', 'Last validation passed.'),
    last_validation: '2026-06-02',
    test_coverage: 'Backend pytest and frontend build.',
    active_modules: ['api', 'web', 'contracts'],
    active_engines: ['skill_registry_engine', 'system_status_engine'],
    active_templates: ['landing-page', 'docs-site'],
    active_skills: ['review_blueprint', 'prepare_download'],
    registry_health: [
      signal('templates', 'Active templates', '2 local templates indexed.'),
      signal('skills', 'Active skills', '2 operational skills registered.'),
    ],
  };
}

function roadmapFixture() {
  return {
    contractVersion: '1.0.0',
    statuses: ['IMPLEMENTED', 'IN_PROGRESS', 'PLANNED', 'FUTURE', 'ARCHIVED'],
    items: [
      { contractVersion: '1.0.0', id: 'skill_registry', title: 'Skill Registry Foundation', category: 'skill', status: 'IMPLEMENTED', summary: 'Read-only operational skill registry.' },
      { contractVersion: '1.0.0', id: 'agent_runtime', title: 'Agent Runtime', category: 'module', status: 'FUTURE', summary: 'Agents remain out of scope.' },
      { contractVersion: '1.0.0', id: 'legacy_placeholders', title: 'Archived Placeholders', category: 'module', status: 'ARCHIVED', summary: 'Reserved folders documented.' },
    ],
  };
}

async function mockGovernanceEndpoints(page: Page) {
  await page.route(`${API_BASE}/skills`, async (route) => route.fulfill({ json: skillsFixture() }));
  await page.route(`${API_BASE}/skills/preview`, async (route) =>
    route.fulfill({
      json: {
        contractVersion: '1.0.0',
        skill_id: 'review_blueprint',
        title: 'Review Blueprint preview',
        summary: 'Read-only operational preview for Review Blueprint. No action is executed.',
        steps: ['Load local registry metadata.', 'Return a safe preview plan without mutation or execution.'],
        safety_notes: ['No AI execution.', 'No agents.'],
        execution_enabled: false,
      },
    }),
  );
  await page.route(`${API_BASE}/system-status`, async (route) => route.fulfill({ json: systemStatusFixture() }));
  await page.route(`${API_BASE}/roadmap`, async (route) => route.fulfill({ json: roadmapFixture() }));
}

test('skills page renders registry, filters and safe preview', async ({ page }) => {
  await mockGovernanceEndpoints(page);
  await page.goto(`${WEB_BASE}/skills`);

  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
  await expect(page.getByText('Skill registry synchronized')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review Blueprint' }).first()).toBeVisible();
  await page.getByLabel('Search skills').fill('download');
  await expect(page.getByText('Prepare Download')).toBeVisible();
  await page.getByLabel('Search skills').fill('');
  await page.getByRole('button', { name: 'View skill details' }).first().click();
  await page.getByRole('button', { name: 'Preview safe plan' }).click();
  await expect(page.getByText('No action is executed.')).toBeVisible();
});

test('system status page renders platform health cards', async ({ page }) => {
  await mockGovernanceEndpoints(page);
  await page.goto(`${WEB_BASE}/system-status`);

  await expect(page.getByRole('heading', { name: 'System Status', exact: true })).toBeVisible();
  await expect(page.getByText('Runtime Health', { exact: true })).toBeVisible();
  await expect(page.getByText('Validation Status', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Build Health', { exact: true })).toBeVisible();
  await expect(page.getByText('Active skills', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('review_blueprint')).toBeVisible();
});

test('architecture page renders active and future maps', async ({ page }) => {
  await mockGovernanceEndpoints(page);
  await page.goto(`${WEB_BASE}/architecture`);

  await expect(page.getByRole('heading', { name: 'Architecture', exact: true })).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Advanced architecture' }).click();
  await expect(page.getByText('Active Runtime Map')).toBeVisible();
  await expect(page.getByText('Future Modules Map')).toBeVisible();
  await expect(page.getByText('Engine Overview')).toBeVisible();
  await expect(page.getByText('Registry Overview')).toBeVisible();
});

test('roadmap page groups implemented future and archived work', async ({ page }) => {
  await mockGovernanceEndpoints(page);
  await page.goto(`${WEB_BASE}/roadmap`);

  await expect(page.getByRole('heading', { name: 'Roadmap', exact: true })).toBeVisible();
  await expect(page.getByText('IMPLEMENTED').first()).toBeVisible();
  await expect(page.getByText('Skill Registry Foundation')).toBeVisible();
  await expect(page.getByText('Agent Runtime')).toBeVisible();
  await expect(page.getByText('Archived Placeholders')).toBeVisible();
});
