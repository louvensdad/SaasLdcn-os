import { expect, test, type Page } from '@playwright/test';

// Architect Engine premium: tabbed layout, deep decision cards with per-decision
// confidence, and the deterministic structured architecture views (context diagram,
// bounded contexts, strategies) — all real-data, nothing invented.

const WEB_BASE = 'http://127.0.0.1:3000';

const authFixture = {
  user: {
    user_id: 'test-user', email: 'test@example.com', full_name: 'Test User', role: 'admin',
    locale: 'pt-BR', is_active: true, consent_accepted_at: '2026-06-25T00:00:00Z',
    consent_policy_version: '1.0.0', created_at: '2026-06-25T00:00:00Z', updated_at: '2026-06-25T00:00:00Z',
  },
  tokens: { access_token: 'test-access-token', token_type: 'bearer', expires_in: 3600 },
};

function architectRoom() {
  return {
    room_id: 'room_arch', workspace_id: null, title: 'Clinic Platform', status: 'BLUEPRINT_READY',
    raw_intent: 'SaaS para clínica', locale: 'pt-BR', confidence: 0.64, degraded: true,
    spec: {
      raw_intent: 'SaaS para clínica', product_summary: 'Plataforma para clínicas.', system_type: 'SaaS de saúde',
      target_users: ['admin'], business_rules: ['RBAC'], entities: ['User', 'Appointment'], core_workflows: ['book'],
      non_functional: {}, suggested_stack: { language: 'python', framework: 'fastapi', architecture: 'modular_monolith' },
      locale: 'pt-BR', assumptions: [], open_questions: [], confidence: 0.64,
    },
    open_questions: [], messages: [], prompt_master_md: '# PromptMaster', prompt_master_versions: [],
    architecture_blueprint: {
      project_id: 'room_arch', degraded: true, preview_acknowledged: false, generated_at: '2026-06-25T00:00:00Z',
      provider: null, providerLabel: 'Nenhum', mode: 'deterministic', model: 'Motor determin?stico', source: 'deterministic', version: 1,
      generatedAt: '2026-06-25T00:00:00Z', tokensUsed: 0, latencyMs: 5, generatedBy: 'architect_engine', llmMetadata: { provider: null, providerLabel: 'Nenhum', model: 'Motor determin?stico', servedByFallback: true }, origin: 'LDCN deterministic preview', confidence: 0.64,
      llm_model: null, generation_time_ms: 5, tokens: {}, fallback: true,
      decisions: [
        {
          area: 'database', choice: 'PostgreSQL', justification: 'Relacional.', alternatives_considered: ['MongoDB'],
          confidence: 0.98, confidence_basis: 'requisitos citados', context: 'No contexto de SaaS de saúde.',
          security_impact: 'Médio', scalability_impact: 'Alto', cost_impact: 'Médio (estimativa qualitativa, não monetária)',
          maintainability_impact: 'Médio', evidence: ['2 entidade(s) no domínio'], impact: 'Persiste o domínio.',
          tradeoffs: ['ACID forte.'], risks: ['Modelagem ruim.'], when_to_reconsider: 'Volume massivo.', dependencies: ['Backend'], requirement_links: ['Entidades: User, Appointment'],
        },
      ],
    },
    architecture_model: {
      deterministic: true,
      context_diagram: {
        nodes: [
          { id: 'user', label: 'Usuário', kind: 'actor' }, { id: 'frontend', label: 'Frontend', kind: 'layer' },
          { id: 'api', label: 'API', kind: 'layer' }, { id: 'backend', label: 'Serviços', kind: 'layer' },
          { id: 'db', label: 'Banco', kind: 'store' },
        ],
        edges: [{ from_id: 'user', to_id: 'frontend', label: 'usa' }],
      },
      bounded_contexts: [
        { name: 'Identity & Access', responsibility: 'Autenticação e permissões.', entities: ['User'], relationships: ['Core Domain'], evidence: 'auth decidido' },
      ],
      data_flow: [{ step: 'Usuário', detail: 'Inicia.' }, { step: 'Banco', detail: 'Persiste.' }],
      auth_flow: [{ step: 'Login', detail: 'Credenciais.' }, { step: 'RBAC', detail: 'Papel.' }],
      dependencies: [{ module: 'database', depends_on: ['Backend'] }],
      events: { available: false, summary: 'Sem eventos.', items: [] },
      cache_strategy: { available: false, summary: 'Sem cache na v1.', items: [] },
      deploy_strategy: { available: true, summary: 'Docker.', items: ['Escolha: Docker'] },
      disaster_recovery: { available: true, backup: 'Diário.', restore: 'Testado.', rto: 'Baixo.', rpo: '~1 dia.', replication: 'Réplica.' },
    },
    readiness_checklist: [], engineering_review: null, generation_handoff: null,
    created_at: '2026-06-25T00:00:00Z', updated_at: '2026-06-25T00:00:00Z',
  };
}

async function setup(page: Page, room: ReturnType<typeof architectRoom>) {
  await page.addInitScript(([auth, data]) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      const headers = { 'Content-Type': 'application/json' };
      if (url.includes('/api/auth/refresh')) return new Response(JSON.stringify(auth), { status: 200, headers });
      if (/\/api\/project-rooms\/[^/?]+(?:\?.*)?$/.test(url)) return new Response(JSON.stringify(data), { status: 200, headers });
      if (url.includes('/user-ai-keys') || url.includes('/user-keys')) return new Response(JSON.stringify({ sessions: [] }), { status: 200, headers });
      return original(input, init);
    };
  }, [authFixture, room] as const);
  await page.route('**/api/auth/me', async (route) => route.fulfill({ json: authFixture.user }));
  await page.route('**/api/registry/**', async (route) => route.fulfill({ json: [] }));
}

test('architect renders tabs with a deep decision and per-decision confidence', async ({ page }) => {
  await setup(page, architectRoom());
  await page.goto(`${WEB_BASE}/architect?projectId=room_arch`);

  await expect(page.getByRole('tab', { name: 'Decisões' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Modelo' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Estratégias' })).toBeVisible();

  // Decision header shows the choice and a confidence badge.
  await expect(page.getByText(/PostgreSQL/).first()).toBeVisible();
  await expect(page.getByText('98%').first()).toBeVisible(); // per-decision confidence, derived
});

test('architect Modelo tab shows context diagram and bounded contexts', async ({ page }) => {
  await setup(page, architectRoom());
  await page.goto(`${WEB_BASE}/architect?projectId=room_arch`);
  await page.getByRole('tab', { name: 'Modelo' }).click();

  await expect(page.getByRole('heading', { name: 'Context Diagram' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bounded Contexts' })).toBeVisible();
  await expect(page.getByText('Identity & Access')).toBeVisible();
  await expect(page.getByText('Fluxo de autenticação')).toBeVisible();
});

test('architect Estratégias tab shows deploy and disaster recovery', async ({ page }) => {
  await setup(page, architectRoom());
  await page.goto(`${WEB_BASE}/architect?projectId=room_arch`);
  await page.getByRole('tab', { name: 'Estratégias' }).click();

  await expect(page.getByRole('heading', { name: 'Estratégia de Deploy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Disaster Recovery' })).toBeVisible();
  await expect(page.getByText('Indisponível').first()).toBeVisible(); // cache unavailable — honest
});


test('LLM regeneration replaces active room state without manual refresh', async ({ page }) => {
  const initial = architectRoom();
  const activeBlueprint = {
    ...initial.architecture_blueprint,
    degraded: false,
    provider: 'anthropic', providerLabel: 'Claude', mode: 'llm', model: 'claude-sonnet-4', source: 'llm', version: 2,
    generatedAt: '2026-06-25T00:01:00Z', tokensUsed: 900, latencyMs: 1800,
    llmMetadata: { provider: 'anthropic', providerLabel: 'Claude', model: 'claude-sonnet-4', servedByFallback: false },
    origin: 'anthropic', fallback: false, llm_model: 'claude-sonnet-4', generation_time_ms: 1800,
  };
  const updated = {
    ...initial,
    degraded: false,
    active_blueprint_version: 2,
    architecture_blueprint: activeBlueprint,
    blueprint_versions: [{ id: 'bpv_2', version: 2, blueprint: activeBlueprint, provider: 'anthropic', providerLabel: 'Claude', model: 'claude-sonnet-4', generated_at: '2026-06-25T00:01:00Z', generation_time_ms: 1800, tokens: { total: 900 }, user: 'test-user', score: 97, hash: 'abc123', prompt: '# PromptMaster', base_version: 1, metadata: {} }],
  };
  await setup(page, initial);
  await page.route('**/api/llm/settings/active', async (route) => route.fulfill({ json: { provider: 'anthropic', providerLabel: 'Claude', model: 'claude-sonnet-4', hasKey: true, status: 'ready', lastValidatedAt: null, lastUsedAt: null, mode: 'llm', requiresConfirmation: true, reason: 'Claude ativo.' } }));
  await page.route('**/api/project-rooms/room_arch/blueprint/stream', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: progress\ndata: {"stage":"provider","label":"Provider detectado","progress":8}\n\nevent: complete\ndata: ${JSON.stringify({ room: updated, progress: 100 })}\n\n` }));
  await page.goto(`${WEB_BASE}/architect?projectId=room_arch`);
  await page.getByRole('button', { name: 'Regenerar com IA' }).click();
  await page.getByRole('button', { name: 'Continuar com Claude' }).click();
  await expect(page.getByRole('heading', { name: 'Blueprint Comparison' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByText('v2').first()).toBeVisible();
  await expect(page.getByText('Claude').first()).toBeVisible();
});
