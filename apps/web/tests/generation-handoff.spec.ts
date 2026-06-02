import { expect, test, type Page } from '@playwright/test';

const PROJECT_URL = 'http://127.0.0.1:3000/projects/project_handoff';
const API_BASE = 'http://127.0.0.1:8001/api';

function projectFixture(decision: 'approved' | 'blocked' = 'approved') {
  const blocked = decision === 'blocked';
  return {
    contractVersion: '1.0.0',
    project_id: 'project_handoff',
    project_name: blocked ? 'Blocked Handoff Project' : 'Ready Handoff Project',
    status: blocked ? 'generation_blocked' : 'ready_for_generation',
    locale: 'pt-BR',
    generation_mode: 'local_build_90',
    technology_graph: {
      contractVersion: '1.0.0',
      language: { id: 'typescript', name: 'TypeScript', ecosystem: 'node' },
      runtime: { id: 'nodejs', name: 'Node.js' },
      framework: { id: 'nestjs', name: 'NestJS' },
      architecture: { id: 'modular_monolith', name: 'Modular Monolith' },
    },
    architecture_id: 'modular_monolith',
    archetype_id: 'ai_saas',
    selected_capabilities: ['authentication', 'observability'],
    selected_business_modules: ['users', 'reports'],
    selected_endpoints: ['auth.login', 'reports.list'],
    blueprint_snapshot: {
      contractVersion: '1.0.0',
      blueprint_id: 'blueprint_handoff',
      project_name: blocked ? 'Blocked Handoff Project' : 'Ready Handoff Project',
      locale: 'pt-BR',
      generation_mode: 'local_build_90',
      generated_at: '2026-05-28T00:00:00Z',
      technology_graph: {
        language: { id: 'typescript', name: 'TypeScript', ecosystem: 'node' },
        runtime: { id: 'nodejs', name: 'Node.js' },
        framework: { id: 'nestjs', name: 'NestJS' },
        architecture: { id: 'modular_monolith', name: 'Modular Monolith' },
      },
      architecture_profile: { architecture_id: 'modular_monolith' },
      archetype_profile: { archetype_id: 'ai_saas' },
      capabilities: [{ id: 'authentication' }, { id: 'observability' }],
      business_modules: [{ id: 'users' }, { id: 'reports' }],
      endpoints: [{ id: 'auth.login' }, { id: 'reports.list' }],
      infrastructure_profile: {
        contractVersion: '1.0.0',
        architecture_level: 'level_3_enterprise',
        selected_component_ids: ['postgresql', 'redis'],
        recommended_component_ids: ['opentelemetry'],
        required_component_ids: [],
        optional_component_ids: [],
        warnings: [],
        rationale: [],
      },
      complexity_profile: {
        overall_score: 66,
        risk_level: 'medium',
        learning_curve: 'medium',
        implementation_effort: 'medium',
        infrastructure_cost: 'medium',
        maintenance_cost: 'medium',
      },
      recommendations: [],
      validation: { valid: !blocked, errors: blocked ? [{ code: 'blocked', message: 'Gatekeeper blocked this project.' }] : [], warnings: [] },
    },
    architectural_graph_snapshot: {
      contractVersion: '1.0.0',
      source: 'preview',
      graph: {
        contractVersion: '1.0.0',
        graph_id: 'graph_handoff',
        architecture_id: 'modular_monolith',
        nodes: [{
          contractVersion: '1.0.0',
          id: 'nestjs',
          label: 'NestJS',
          type: 'backend',
          category: 'framework',
          status: 'healthy',
          burden_score: 'medium',
          risk_level: 'low',
          readiness_score: 88,
          ownership_role: 'Backend Engineer',
          required_skills: [],
          warnings: [],
          recommendations: [],
          health: { contractVersion: '1.0.0', status: 'healthy', summary: 'Healthy' },
          risk: { contractVersion: '1.0.0', level: 'low', score: 18, warnings: [] },
          readiness: { contractVersion: '1.0.0', score: 88, status: 'ready', recommendations: [] },
          ownership: { contractVersion: '1.0.0', role: 'Backend Engineer', required_skills: [], boundary: 'API' },
        }],
        edges: [],
        layout: { contractVersion: '1.0.0', width: 800, height: 500, direction: 'horizontal', simplified_mobile: false, points: [{ node_id: 'nestjs', x: 120, y: 160, layer: 1 }] },
        warnings: [],
        recommendations: [],
      },
      generated_at: '2026-05-28T00:00:00Z',
    },
    prompt_master_snapshot: {
      contractVersion: '1.0.0',
      prompt_master_id: 'prompt_handoff',
      blueprint_id: 'blueprint_handoff',
      project_name: blocked ? 'Blocked Handoff Project' : 'Ready Handoff Project',
      source_blueprint_valid: !blocked,
      sections: [{ id: 'scope', title: 'Scope', body: 'Scope', items: [] }],
      validation: { valid: !blocked, errors: [], warnings: [] },
      trace: { blueprint_id: 'blueprint_handoff', contains_secrets: false },
      generated_at: '2026-05-28T00:00:00Z',
    },
    gatekeeper_snapshot: {
      contractVersion: '1.0.0',
      gatekeeper_report_id: 'gatekeeper_handoff',
      blueprint_id: 'blueprint_handoff',
      prompt_master_id: 'prompt_handoff',
      decision,
      summary: blocked ? 'Generation blocked by Gatekeeper' : 'Generation handoff ready',
      checks: [],
      blockers: blocked ? [{ code: 'gatekeeper_blocked', message: 'Generation blocked by Gatekeeper.' }] : [],
      warnings: [],
      generated_at: '2026-05-28T00:00:00Z',
    },
    readiness_status: blocked ? 'blocked' : 'ready',
    created_at: '2026-05-28T00:00:00Z',
    updated_at: '2026-05-28T00:00:00Z',
  };
}

function handoffFixture(readiness: 'ready' | 'blocked') {
  const project = projectFixture(readiness === 'blocked' ? 'blocked' : 'approved');
  return {
    contractVersion: '1.0.0',
    handoff_id: 'handoff_preview',
    project_id: project.project_id,
    project_name: project.project_name,
    handoff_readiness: readiness,
    project_record: project,
    blueprint_snapshot: project.blueprint_snapshot,
    prompt_master_snapshot: project.prompt_master_snapshot,
    gatekeeper_snapshot: project.gatekeeper_snapshot,
    architectural_graph_snapshot: project.architectural_graph_snapshot,
    infrastructure_recommendations: { contractVersion: '1.0.0', recommended: ['opentelemetry'], required: [], optional: ['grafana'], warnings: [], rationale: [] },
    dependency_impact: { contractVersion: '1.0.0', score: 72, infra_complexity: 'medium', deployment_complexity: 'medium', operational_burden: 'medium', scaling_complexity: 'medium', maintenance_cost: 'medium', security_surface: 'medium', learning_curve: 'medium', team_maturity_required: 'medium', rationale: [] },
    engineering_readiness: { contractVersion: '1.0.0', overall_readiness: 84, team_size: 4, recommended_roles: [], required_seniority: 'senior', onboarding_complexity: 'medium', production_risk: 20, operational_risk: 25, maintenance_risk: 28, scaling_risk: 24, delivery_estimate: { contractVersion: '1.0.0', target: 'production_ready', estimated_weeks: 6, confidence: 'medium', complexity: { contractVersion: '1.0.0', score: 52, level: 'medium', maintenance_effort: 'medium', onboarding_effort: 'medium', deployment_burden: 'medium', complexity_drivers: [] }, phases: [] }, learning_curve: { contractVersion: '1.0.0', score: 40, level: 'medium', onboarding_complexity: 'medium', ramp_up_weeks: 2, learning_focus: [] }, enterprise_readiness: 80, deployment_readiness: 78, team_recommendation: { contractVersion: '1.0.0', team_size: 4, required_seniority: 'senior', roles: [], required_expertise: [], rationale: [] }, operational_burden: { contractVersion: '1.0.0', score: 30, level: 'low', service_ownership: 30, deployment_burden: 30, observability_burden: 30, incident_burden: 30, maintenance_effort: 'low', signals: [] }, delivery_complexity: { contractVersion: '1.0.0', score: 52, level: 'medium', maintenance_effort: 'medium', onboarding_effort: 'medium', deployment_burden: 'medium', complexity_drivers: [] }, production_readiness: { contractVersion: '1.0.0', score: 82, readiness: 'production_ready', production_ready: true, enterprise_ready: false, deployment_readiness: 80, operational_readiness: 84, team_readiness: 86, missing_baselines: [] }, engineering_risks: [] },
    selected: { endpoints: project.selected_endpoints, modules: project.selected_business_modules, capabilities: project.selected_capabilities },
    checklist: [
      { contractVersion: '1.0.0', id: 'blueprint_exists', label: 'Blueprint exists', required: true, status: 'passed', summary: 'Blueprint exists.' },
      { contractVersion: '1.0.0', id: 'gatekeeper_approved', label: 'Gatekeeper approved or approved with warnings', required: true, status: readiness === 'ready' ? 'passed' : 'failed', summary: readiness === 'ready' ? 'Approved.' : 'Blocked.' },
    ],
    artifacts: [
      { contractVersion: '1.0.0', id: 'blueprint_snapshot', kind: 'blueprint_snapshot', label: 'Blueprint snapshot', included: true, source: 'project_registry', summary: 'Saved blueprint.' },
      { contractVersion: '1.0.0', id: 'engineering_readiness', kind: 'engineering_readiness', label: 'Engineering readiness', included: true, source: 'engineering_readiness_engine', summary: 'Readiness profile.' },
    ],
    blockers: readiness === 'blocked' ? [{ contractVersion: '1.0.0', code: 'gatekeeper_blocked', source: 'gatekeeper', message: 'Generation blocked by Gatekeeper.', severity: 'critical', related_ids: [] }] : [],
    warnings: [],
    trace: { contractVersion: '1.0.0', generated_at: '2026-05-28T00:00:00Z', project_id: project.project_id, operations: ['read_project_record', 'compose_generation_handoff_package'], included_artifact_ids: ['blueprint_snapshot'], omitted_sensitive_fields: ['token'], contains_secrets: false },
    generation_disabled: true,
    metadata: { no_code_generation: true },
  };
}

async function mockProjectDetail(page: Page, readiness: 'ready' | 'blocked' = 'ready') {
  const project = projectFixture(readiness === 'blocked' ? 'blocked' : 'approved');
  await page.route(`${API_BASE}/projects/project_handoff`, async (route) => route.fulfill({ json: project }));
  await page.route(`${API_BASE}/generation/handoff-preview`, async (route) => route.fulfill({ json: handoffFixture(readiness) }));
  await page.route(`${API_BASE}/engineering/**`, async (route) => route.abort('failed'));
  await page.route(`${API_BASE}/system-design/**`, async (route) => route.abort('failed'));
  await page.route(`${API_BASE}/architectural-graph/preview`, async (route) => route.fulfill({ json: project.architectural_graph_snapshot.graph }));
}

test('project detail prepares generation handoff preview', async ({ page }) => {
  await mockProjectDetail(page);
  await page.goto(PROJECT_URL);
  await page.getByRole('button', { name: 'Prepare Handoff' }).click();

  await expect(page.getByTestId('generation-handoff-section').getByText('ready', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Blueprint exists', { exact: true })).toBeVisible();
  await expect(page.getByText('Blueprint snapshot', { exact: true })).toBeVisible();
});

test('ready state appears and generate remains disabled', async ({ page }) => {
  await mockProjectDetail(page);
  await page.goto(PROJECT_URL);
  await page.getByRole('button', { name: 'Prepare Handoff' }).click();

  await expect(page.getByText('Handoff readiness')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Project' })).toBeDisabled();
});

test('blocked handoff state appears', async ({ page }) => {
  await mockProjectDetail(page, 'blocked');
  await page.goto(PROJECT_URL);
  await page.getByRole('button', { name: 'Prepare Handoff' }).click();

  await expect(page.getByTestId('generation-handoff-section').getByText('blocked', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Generation blocked by Gatekeeper.')).toBeVisible();
});

test('handoff preview keeps backend offline state safe', async ({ page }) => {
  await mockProjectDetail(page);
  await page.route(`${API_BASE}/generation/handoff-preview`, async (route) => route.abort('failed'));
  await page.goto(PROJECT_URL);
  await page.getByRole('button', { name: 'Prepare Handoff' }).click();

  await expect(page.getByText('Generation handoff unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Project' })).toBeDisabled();
});
