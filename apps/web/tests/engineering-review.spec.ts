import { expect, test, type Page } from '@playwright/test';

// Tests the real-data Engineering Review Center: it renders ONLY values derived
// from the room spec + blueprint (no invented costs/confidence/risks), and the
// Meta-Factory gate requires an approved review.

const WEB_BASE = 'http://127.0.0.1:3000';

const authFixture = {
  user: {
    user_id: 'test-user', email: 'test@example.com', full_name: 'Test User', role: 'admin',
    locale: 'pt-BR', is_active: true, consent_accepted_at: '2026-06-25T00:00:00Z',
    consent_policy_version: '1.0.0', created_at: '2026-06-25T00:00:00Z', updated_at: '2026-06-25T00:00:00Z',
  },
  tokens: { access_token: 'test-access-token', token_type: 'bearer', expires_in: 3600 },
};

function reviewRoom(overrides: Record<string, unknown> = {}) {
  return {
    room_id: 'room_review', workspace_id: null, title: 'Clinic Platform', status: 'ENGINEERING_REVIEW',
    raw_intent: 'SaaS para clínica', locale: 'pt-BR', confidence: 0.86, degraded: false,
    spec: {
      raw_intent: 'SaaS para clínica', product_summary: 'Plataforma operacional para clínicas.',
      target_users: ['admin', 'doctor'], business_rules: ['RBAC', 'LGPD'],
      entities: ['User', 'Clinic', 'Appointment'], core_workflows: ['book', 'pay'],
      non_functional: {}, suggested_stack: { language: 'python', framework: 'fastapi', architecture: 'modular_monolith' },
      locale: 'pt-BR',
      assumptions: [{ field: 'auth', assumed_value: 'JWT', reason: 'Padrão seguro' }],
      open_questions: [{ id: 'q1', question: 'Multi-tenant?', why_it_matters: 'Muda o banco', default_if_skipped: 'Single-tenant' }],
      confidence: 0.86,
    },
    open_questions: [], messages: [], prompt_master_md: '# PromptMaster', prompt_master_versions: [],
    architecture_blueprint: {
      project_id: 'room_review', degraded: false, generated_at: '2026-06-25T00:00:00Z',
      provider: 'anthropic', providerLabel: 'Claude', mode: 'llm', model: 'claude-sonnet-4', source: 'llm', version: 2,
      generatedAt: '2026-06-25T00:00:00Z', tokensUsed: 1300, latencyMs: 1280, generatedBy: 'architect_engine', llmMetadata: { provider: 'anthropic', providerLabel: 'Claude', model: 'claude-sonnet-4', servedByFallback: false }, origin: 'anthropic', confidence: 0.97,
      llm_model: 'claude-sonnet-4', generation_time_ms: 1280, tokens: { input: 400, output: 900 }, fallback: false,
      decisions: [
        { area: 'backend', choice: 'FastAPI', justification: 'Produtividade e tipagem.', alternatives_considered: ['NestJS', 'Spring'] },
        { area: 'database', choice: 'PostgreSQL', justification: 'Consistência relacional.', alternatives_considered: ['MongoDB'] },
      ],
    },
    generation_handoff: null, created_at: '2026-06-25T00:00:00Z', updated_at: '2026-06-25T00:00:00Z',
    ...overrides,
  };
}

async function setup(page: Page, data: ReturnType<typeof reviewRoom>) {
  await page.addInitScript(([auth, room]) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.includes('/api/auth/refresh')) return new Response(JSON.stringify(auth), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (/\/api\/project-rooms\/[^/]+$/.test(url)) return new Response(JSON.stringify(room), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return original(input, init);
    };
  }, [authFixture, data] as const);
  await page.route('**/api/auth/me', async (route) => route.fulfill({ json: authFixture.user }));
  await page.route('**/api/registry/**', async (route) => route.fulfill({ json: [] }));
}

test('review center renders only real-data panels', async ({ page }) => {
  await setup(page, reviewRoom());
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);

  await expect(page.getByRole('heading', { name: /Resumo executivo|Executive summary/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Decisões arquiteturais|Architectural decisions/ })).toBeVisible();
  await expect(page.getByText('FastAPI').first()).toBeVisible(); // real blueprint choice
  await expect(page.getByText('PostgreSQL').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Central de riscos|Risk center/ })).toBeVisible();
  await expect(page.getByText('Multi-tenant?')).toBeVisible(); // real open question as risk

  // No fabricated cost/opportunity surfaces from the rejected draft.
  await expect(page.getByText('Tokens LLM')).toHaveCount(0);
  await expect(page.getByText(/\$\d/)).toHaveCount(0);

  // The approve button lives in the Readiness tab.
  await page.getByRole('tab', { name: 'Readiness' }).click();
  await expect(page.getByRole('button', { name: 'Validar Review' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprovar Review' })).toBeVisible();
});

test('review is blocked without a blueprint', async ({ page }) => {
  await setup(page, reviewRoom({ status: 'PROMPT_APPROVED', architecture_blueprint: null }));
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);
  await expect(page.getByRole('button', { name: /Architect Engine/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprovar Review' })).toHaveCount(0);
});

test('Meta-Factory is blocked until the review is approved', async ({ page }) => {
  await setup(page, reviewRoom({ status: 'ENGINEERING_REVIEW' }));
  await page.goto(`${WEB_BASE}/meta-factory?projectId=room_review`);
  await expect(page.locator('a[href="/engineering-review?projectId=room_review"]')).toBeVisible();
});

// --------------------------------------------------------------------------- //
// Critical-action flow: orchestration, explicit errors, deterministic gate,
// smart buttons, and the committee/score panels.
// --------------------------------------------------------------------------- //

function reviewAssessment() {
  return {
    good_decisions: [{ title: 'FastAPI', detail: 'Produtividade e tipagem.', area: 'backend' }],
    debatable_decisions: [{ title: 'Blueprint em modo deterministico (preview)', detail: 'Nenhum LLM autorou.', area: null }],
    risks: [{ title: 'Arquitetura nao revisada por IA', detail: '', area: null }],
    gaps: [], inconsistencies: [],
    scalability_impact: 'deploy: Docker', security_impact: 'auth: JWT',
    generation_readiness: '5/6 verificacoes obrigatorias atendidas.',
    recommendations: ['Conecte um provedor de IA e regenere o Blueprint.'],
    score: {
      overall: 72,
      categories: [
        { key: 'architecture', label: 'Architecture Readiness', status: 'scored', score: 100, basis: '10/10 areas decididas' },
        { key: 'security', label: 'Security Readiness', status: 'scored', score: 100, basis: '2/2 controles' },
        { key: 'scalability', label: 'Scalability Readiness', status: 'unavailable', score: null, basis: 'Sem sinais de escala' },
      ],
    },
    committee: [
      { role: 'Architect', rating: 5, verdict: 'approved', rationale: 'Cobertura completa.', signals: ['10/10 áreas'] },
      { role: 'Security', rating: 4, verdict: 'approved_with_caveats', rationale: 'Auth e RBAC presentes.', signals: ['auth'] },
      { role: 'QA', rating: 3, verdict: 'changes_requested', rationale: 'Cobertura de testes parcial.', signals: ['tests'] },
      { role: 'AI Reviewer', rating: 3, verdict: 'approved_with_caveats', rationale: 'Sugere regenerar com IA.', signals: ['sem LLM ativo'] },
    ],
    dimensions: [
      { key: 'security', label: 'Segurança', status: 'scored', score: 100, verdict: 'approved', findings: ['Autenticação decidida.'] },
      { key: 'cost', label: 'Custos', status: 'unavailable', score: null, verdict: 'Banda qualitativa geral: Médio (não monetária)', findings: ['backend: Médio'] },
    ],
    final_opinion: {
      deterministic: true,
      success_probability: 67,
      complexity: 'Alta',
      risk: 'Baixo',
      scalability: 'Muito Alta',
      narrative: 'Análise determinística da arquitetura proposta.',
      disclaimer: 'Este parecer foi produzido pelo modo determinístico (sem LLM) e possui profundidade reduzida.',
    },
  };
}

async function setupActions(
  page: Page,
  room: ReturnType<typeof reviewRoom>,
  actions: Record<string, { status: number; body: unknown }>,
) {
  await page.addInitScript(([auth, data, acts]) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = { 'Content-Type': 'application/json' };
      if (url.includes('/api/auth/refresh')) return new Response(JSON.stringify(auth), { status: 200, headers });
      const match = url.match(/\/api\/project-rooms\/([^/?]+)(?:\/([a-z-]+))?(?:\?.*)?$/);
      if (match) {
        const action = match[2];
        if (!action && method === 'GET') return new Response(JSON.stringify(data), { status: 200, headers });
        if (action && (acts as Record<string, { status: number; body: unknown }>)[action]) {
          const r = (acts as Record<string, { status: number; body: unknown }>)[action];
          return new Response(JSON.stringify(r.body), { status: r.status, headers });
        }
      }
      return original(input, init);
    };
  }, [authFixture, room, actions] as const);
  await page.route('**/api/auth/me', async (route) => route.fulfill({ json: authFixture.user }));
  await page.route('**/api/registry/**', async (route) => route.fulfill({ json: [] }));
}

test('deterministic blueprint is a degraded preview gated by a typed confirmation', async ({ page }) => {
  const degraded = reviewRoom({
    status: 'ENGINEERING_REVIEW',
    architecture_blueprint: {
      project_id: 'room_review', degraded: true, preview_acknowledged: false, generated_at: '2026-06-25T00:00:00Z',
      provider: null, providerLabel: 'Nenhum', mode: 'deterministic', model: 'Motor determinístico', source: 'deterministic', version: 1,
      generatedAt: '2026-06-25T00:00:00Z', tokensUsed: 0, latencyMs: 5, generatedBy: 'architect_engine', llmMetadata: { provider: null, providerLabel: 'Nenhum', model: 'Motor determinístico', servedByFallback: true }, origin: 'LDCN deterministic preview', confidence: 0.64,
      llm_model: null, generation_time_ms: 5, tokens: {}, fallback: true,
      decisions: [{ area: 'backend', choice: 'FastAPI', justification: 'x', alternatives_considered: [] }],
    },
    engineering_review: reviewAssessment(),
  });
  await setupActions(page, degraded, {});
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);
  await page.getByRole('tab', { name: 'Readiness' }).click();

  await expect(page.getByRole('heading', { name: /Preview determinístico \(modo degradado\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Regenerar com IA/ })).toBeVisible();

  const approveBtn = page.getByRole('button', { name: 'Aprovar Review' });
  await expect(approveBtn).toBeDisabled();
  await page.getByLabel('Confirmação de preview determinístico').fill('CONTINUAR COM PREVIEW');
  await expect(page.getByRole('button', { name: 'Continuar com Preview Determinístico' })).toBeEnabled();
});

test('a 409 on send shows the explicit diagnostic (current vs expected status)', async ({ page }) => {
  const approvedRoom = reviewRoom({
    status: 'ENGINEERING_APPROVED',
    readiness_checklist: [
      { id: 'prompt_master', label: 'PromptMaster', status: 'passed', detail: 'ok', required: true },
      { id: 'blueprint', label: 'Blueprint', status: 'passed', detail: 'ok', required: true },
    ],
  });
  const diagnostic = {
    status_current: 'BLUEPRINT_READY', status_expected: ['ENGINEERING_APPROVED'],
    endpoint_called: '/api/project-rooms/room_review/send-to-generator', http_status: 409,
    backend_message: 'A Meta-Fabrica exige Blueprint revisado e Engineering Review aprovado.',
    rejection_reason: 'Engineering Review nao aprovada.', correction: 'Aprove a Engineering Review antes de enviar.', checks: [],
  };
  await setupActions(page, approvedRoom, { 'send-to-generator': { status: 409, body: { detail: diagnostic } } });
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);
  await page.getByRole('tab', { name: 'Readiness' }).click();

  await page.getByRole('button', { name: /Enviar para Meta-Fábrica/ }).click();
  await expect(page.getByText('BLUEPRINT_READY')).toBeVisible();
  await expect(page.getByText('ENGINEERING_APPROVED').first()).toBeVisible();
  await expect(page.getByText('Aprove a Engineering Review antes de enviar.')).toBeVisible();
  await expect(page.getByText(/409/).first()).toBeVisible(); // operational log
});

test('committee votes render with ratings and verdicts', async ({ page }) => {
  await setupActions(page, reviewRoom({ status: 'ENGINEERING_REVIEW', engineering_review: reviewAssessment() }), {});
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);
  await page.getByRole('tab', { name: 'Comitê' }).click();
  await expect(page.getByRole('heading', { name: /Comitê de Engenharia — votação/ })).toBeVisible();
  await expect(page.getByText('Security')).toBeVisible();
  await expect(page.getByText('Aprovado com ressalvas').first()).toBeVisible();
  await expect(page.getByText('Solicita melhorias')).toBeVisible(); // QA changes_requested
});

test('review score renders with honest unavailable category', async ({ page }) => {
  await setupActions(page, reviewRoom({ status: 'ENGINEERING_REVIEW', engineering_review: reviewAssessment() }), {});
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);
  await page.getByRole('tab', { name: 'Readiness' }).click();
  await expect(page.getByRole('heading', { name: /Review Score/ })).toBeVisible();
  await expect(page.getByText('Architecture Readiness')).toBeVisible();
  await expect(page.getByText('indisponível').first()).toBeVisible(); // honest unavailable category
});

test('dimensions tab shows cost as a qualitative band (no numeric score)', async ({ page }) => {
  await setupActions(page, reviewRoom({ status: 'ENGINEERING_REVIEW', engineering_review: reviewAssessment() }), {});
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);
  await page.getByRole('tab', { name: 'Dimensões' }).click();
  await expect(page.getByText('Custos')).toBeVisible();
  await expect(page.getByText('sem score').first()).toBeVisible();
  await expect(page.getByText(/qualitativa geral/)).toBeVisible(); // never a fabricated number
});

test('final opinion (parecer) flags deterministic mode honestly', async ({ page }) => {
  await setupActions(page, reviewRoom({ status: 'ENGINEERING_REVIEW', engineering_review: reviewAssessment() }), {});
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);
  await page.getByRole('tab', { name: 'Parecer' }).click();
  await expect(page.getByRole('heading', { name: /Parecer final do comitê/ })).toBeVisible();
  await expect(page.getByText(/modo determinístico/)).toBeVisible();
  await expect(page.getByText('67%')).toBeVisible(); // success probability, real
});

test('smart buttons: already-sent room offers Meta-Factory, not approve', async ({ page }) => {
  await setupActions(page, reviewRoom({ status: 'WAITING_META_FACTORY' }), {});
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);
  await page.getByRole('tab', { name: 'Readiness' }).click();
  await expect(page.getByRole('button', { name: 'Abrir Meta-Fábrica' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprovar Review' })).toHaveCount(0);
});

test('LLM blueprint shows provider and never renders deterministic warning', async ({ page }) => {
  const assessment = reviewAssessment();
  assessment.debatable_decisions = [];
  assessment.risks = [];
  assessment.final_opinion = { ...assessment.final_opinion, deterministic: false, disclaimer: 'Blueprint autorado por IA.' };
  await setupActions(page, reviewRoom({ engineering_review: assessment }), {});
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);
  await expect(page.getByText('Claude').first()).toBeVisible();
  await expect(page.getByText('claude-sonnet-4').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Readiness' }).click();
  await expect(page.getByRole('button', { name: 'Validar Review' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aprovar Review' })).toBeVisible();
  await page.getByRole('tab', { name: 'Parecer' }).click();
  await expect(page.getByText(/Este parecer foi produzido pelo modo determinístico/)).toHaveCount(0);
});

test('approved review exposes send action and no dead end', async ({ page }) => {
  await setupActions(page, reviewRoom({ status: 'ENGINEERING_APPROVED' }), {});
  await page.goto(`${WEB_BASE}/engineering-review?projectId=room_review`);
  await page.getByRole('tab', { name: 'Readiness' }).click();
  await expect(page.getByRole('button', { name: 'Validar Review' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Enviar para Meta-Fábrica/ })).toBeVisible();
});
