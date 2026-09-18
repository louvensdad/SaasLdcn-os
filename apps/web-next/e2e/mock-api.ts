import type { Page, Route } from '@playwright/test';

/** Fixture answers shaped like the real backend's; no request ever leaves the browser. */
export const USER = {
  user_id: 'usr_4d7a19e0c2b8',
  email: 'nora.lima@novalabs.example',
  full_name: 'Nora Lima',
  role: 'user',
  locale: 'en-US',
  is_active: true,
  consent_accepted_at: '2026-08-31T11:18:00Z',
  consent_policy_version: '2026-06-15',
  is_2fa_enabled: false,
  created_at: '2026-08-31T11:18:00Z',
  updated_at: '2026-09-15T08:00:00Z',
};

const TOKENS = { access_token: 'test-access-token', token_type: 'bearer', expires_in: 900 };

const WORKSPACES = [
  { workspace_id: 'ws_7a1f30c9e2b4', organization_id: 'org_2c9e71a4b05d', name: 'Nova Labs', slug: 'nova-labs', is_personal: false, role: 'owner', created_at: '2026-08-31T11:20:00Z', updated_at: '2026-09-15T08:00:00Z' },
  { workspace_id: 'ws_0d4b82e6a17c', organization_id: 'org_2c9e71a4b05d', name: 'Personal', slug: 'personal', is_personal: true, role: 'owner', created_at: '2026-08-31T11:18:00Z', updated_at: '2026-08-31T11:18:00Z' },
];

const ORGANIZATIONS = [{ organization_id: 'org_2c9e71a4b05d', name: 'Nova Labs', slug: 'nova-labs', role: 'owner', created_at: '2026-08-31T11:20:00Z', updated_at: '2026-09-15T08:00:00Z' }];

const ROOMS = [
  { room_id: 'room_5b9e2c71a0d4', title: 'Nova Commerce', status: 'META_FACTORY_RUNNING', delivery_type: 'web', locale: 'pt-BR', degraded: false, has_prompt_master: true, created_at: '2026-09-10T09:12:00Z', updated_at: '2026-09-15T13:28:00Z' },
  { room_id: 'room_1c7d40b8e932', title: 'Atlas Field Ops', status: 'READY', delivery_type: 'web', locale: 'en-US', degraded: false, has_prompt_master: true, created_at: '2026-09-08T10:02:00Z', updated_at: '2026-09-14T09:32:00Z' },
  { room_id: 'room_88e3a1f5602c', title: 'Helios Billing', status: 'PROMPT_READY', delivery_type: 'backend', locale: 'en-US', degraded: false, has_prompt_master: true, created_at: '2026-09-15T16:40:00Z', updated_at: '2026-09-15T17:05:00Z' },
];

const JOBS = [
  { id: 'genjob_9f14c7b2e08a55', projectId: 'room_5b9e2c71a0d4', generatedProjectId: 'nova-commerce_3f9a1c2b7d4e', projectName: 'Nova Commerce', status: 'BACKEND_GENERATING', currentStage: 'BACKEND_GENERATING', providerLabel: 'DeepSeek', progress: 48, retryCount: 0, valid: false, packageReady: false, buildStatus: 'PENDING', archived: false, createdAt: '2026-09-15T12:40:00Z', updatedAt: '2026-09-16T09:05:00Z', startedAt: '2026-09-15T12:40:00Z', finishedAt: null },
  { id: 'genjob_71b0d3a5c9e284', projectId: 'room_1c7d40b8e932', generatedProjectId: 'atlas-field-ops_71b0d3a5c9e2', projectName: 'Atlas Field Ops', status: 'READY', currentStage: 'PACKAGE_CREATING', providerLabel: 'DeepSeek', progress: 100, retryCount: 0, valid: true, packageReady: true, buildStatus: 'PASSED', archived: false, createdAt: '2026-09-14T08:10:00Z', updatedAt: '2026-09-14T09:32:00Z', startedAt: '2026-09-14T08:10:00Z', finishedAt: '2026-09-14T09:32:00Z' },
  { id: 'genjob_2c81f0e9a47d13', projectId: 'room_5b9e2c71a0d4', generatedProjectId: 'nova-commerce_8e21d4c7a0b9', projectName: 'Nova Commerce', status: 'FAILED', currentStage: 'BACKEND_VALIDATING', providerLabel: 'DeepSeek', progress: 62, retryCount: 0, valid: false, packageReady: false, buildStatus: 'SKIPPED_AFTER_FAILURE', archived: true, createdAt: '2026-09-12T21:04:00Z', updatedAt: '2026-09-12T21:47:00Z', startedAt: '2026-09-12T21:04:00Z', finishedAt: '2026-09-12T21:47:00Z' },
];

const CHANGES = [
  /* `project_id` on a summary is the GENERATED project, matching the detail below; the room it belongs to is
     only reachable by joining through the missions list, because the summary drops `room_id` (G24). */
  { change_request_id: 'chg_6f0a4b12d7e9', project_id: 'nova-commerce_3f9a1c2b7d4e', status: 'Analyzed', intent: 'Split the invoice export into its own job', created_at: '2026-09-15T18:02:00Z', updated_at: '2026-09-15T18:20:00Z' },
  { change_request_id: 'chg_91c7be40a52d', project_id: 'nova-commerce_3f9a1c2b7d4e', status: 'Accepted', intent: 'Rename the customer portal route', created_at: '2026-09-11T09:00:00Z', updated_at: '2026-09-11T11:41:00Z' },
];

const NOTIFICATIONS = {
  items: [
    { id: 'ntf_3a91c0d7', user_id: USER.user_id, workspace_id: 'ws_7a1f30c9e2b4', project_id: 'room_1c7d40b8e932', job_id: 'genjob_71b0d3a5c9e284', entity_type: 'generation_job', entity_id: 'genjob_71b0d3a5c9e284', type: 'TASK_COMPLETED', severity: 'SUCCESS', stage: 'PACKAGE_CREATING', read: false, action_url: null, metadata: {}, created_at: '2026-09-14T09:32:00Z' },
    { id: 'ntf_77b2e4f1', user_id: USER.user_id, workspace_id: 'ws_7a1f30c9e2b4', project_id: 'room_5b9e2c71a0d4', job_id: 'genjob_2c81f0e9a47d13', entity_type: 'generation_job', entity_id: 'genjob_2c81f0e9a47d13', type: 'TASK_FAILED', severity: 'ERROR', stage: 'BACKEND_VALIDATING', read: true, action_url: null, metadata: {}, created_at: '2026-09-12T21:47:00Z' },
  ],
  has_more: false,
  next_cursor: null,
  unread_count: 1,
};

const PRESENCE = {
  items: [
    { id: 'prs_1', title: 'Quality gate blocked the release of Nova Commerce', category: 'quality_gate', status: 'BLOCKED', severity: 'WARNING', importance: 'HIGH', source: 'quality_gate_engine', correlationId: 'genjob_2c81f0e9a47d13', projectId: 'room_5b9e2c71a0d4', workspaceId: 'ws_7a1f30c9e2b4', evidenceRef: 'report_4471', occurredAt: '2026-09-12T21:47:00Z', summary: 'Two blockers stayed open after the repair attempt.' },
    { id: 'prs_2', title: 'Atlas Field Ops finished with a passing build', category: 'generation', status: 'HEALTHY', severity: 'SUCCESS', importance: 'NORMAL', source: 'factory_pipeline', correlationId: 'genjob_71b0d3a5c9e284', projectId: 'room_1c7d40b8e932', workspaceId: 'ws_7a1f30c9e2b4', evidenceRef: null, occurredAt: '2026-09-14T09:32:00Z', summary: null },
  ],
  nextCursor: null,
};

const LLM_ACTIVE = {
  provider: 'deepseek', providerLabel: 'DeepSeek', model: 'deepseek-chat', hasKey: true, status: 'ready',
  lastValidatedAt: '2026-09-15T07:55:00Z', lastUsedAt: '2026-09-16T09:05:00Z', mode: 'llm', requiresConfirmation: false,
  reason: 'user_key', contextTokens: 128000, validationIsStale: false, validationAgeDays: 1,
};

const LLM_USAGE = {
  window_hours: 24, requests: 184, input_tokens: 1284000, output_tokens: 218400, cache_read_tokens: 96000, saved_tokens: 74000,
  avg_latency_ms: 2140, estimated_cost_usd: 0.9312, cache_savings_usd: 0.0412,
  previous: { requests: 142, input_tokens: 980000, output_tokens: 174000, cache_read_tokens: 51000, saved_tokens: 42000, avg_latency_ms: 2260, estimated_cost_usd: 0.7104, cache_savings_usd: 0.0221 },
  buckets: [],
};

/** One room in full, as GET /api/project-rooms/{room_id} returns it. */
const ROOM_MESSAGES = [
  { role: 'user', content: 'A storefront with a catalogue, a cart and invoices.', created_at: '2026-09-10T09:12:00Z' },
  { role: 'assistant', content: 'Understood: a web storefront with catalogue, cart and invoicing. Who issues the invoices — you or the customer?', created_at: '2026-09-10T09:13:00Z' },
  { role: 'user', content: 'We issue them, and they must be exportable.', created_at: '2026-09-10T09:15:00Z' },
];

const ROOM_QUESTIONS = [
  { id: 'q1', question: 'Which payment provider should the invoices use?', why_it_matters: 'It decides the integration and the data the invoice carries.', default_if_skipped: 'none — invoices are issued without a payment link' },
];

const PROMPT_VERSIONS = [
  { version: 1, markdown: '# PromptMaster v1', sections: [{ id: 's1', title: 'Scope' }], generated_at: '2026-09-10T10:00:00Z', degraded: false, project_name: 'Nova Commerce' },
  { version: 2, markdown: '# PromptMaster v2', sections: [{ id: 's1', title: 'Scope' }, { id: 's2', title: 'Rules' }], generated_at: '2026-09-11T08:30:00Z', degraded: false, project_name: 'Nova Commerce' },
];

const STACK_PROPOSAL = {
  status: 'PENDING',
  items: [
    { area: 'backend', label: 'Backend', choice: 'python:fastapi', reason: 'The invoice rules are server-side and the team knows Python.', alternatives: ['node:nestjs'], version_options: [] },
    { area: 'frontend', label: 'Frontend', choice: 'typescript:nextjs', reason: 'A web storefront with server rendering.', alternatives: ['typescript:remix'], version_options: [] },
    { area: 'database', label: 'Database', choice: 'postgres', reason: 'Invoices need transactions and reporting.', alternatives: ['mysql'], version_options: [] },
  ],
  approval: null,
};

/* Shaped like the served ArchitectureBlueprint: decisions by area, with the dependencies and requirement links the architect wrote. */
const BLUEPRINT = {
  project_id: 'room_5b9e2c71a0d4', degraded: false, generated_at: '2026-09-12T09:00:00Z', provider: 'deepseek', providerLabel: 'DeepSeek',
  mode: 'llm', model: 'deepseek-chat', source: 'llm', version: 3, generatedAt: '2026-09-12T09:00:00Z', tokensUsed: 24500, latencyMs: 41200,
  generatedBy: 'architect_engine', llmMetadata: {}, origin: 'room', confidence: 0.82, generation_time_ms: 41200, tokens: { input: 18400, output: 6100 }, fallback: false,
  decisions: [
    { area: 'frontend', choice: 'Next.js with server-rendered catalogue', justification: 'The catalogue must be indexable.', alternatives_considered: ['Single-page app'], dependencies: ['API contract (apis)', 'Locale from the spec'], requirement_links: ['The catalogue must stay server-rendered for SEO.'] },
    { area: 'apis', choice: 'Versioned REST (/v1) described by OpenAPI', justification: 'One contract for the frontend and the tests.', alternatives_considered: ['GraphQL'], dependencies: ['Backend', 'Frontend'], requirement_links: ['2 core workflows'] },
    { area: 'backend', choice: 'Python / FastAPI in layers', justification: 'Invoice rules isolated from the controllers.', alternatives_considered: ['Microservices'], dependencies: ['Database', 'Auth/Authorization'], requirement_links: ['Invoices are issued by the store, never by the customer.'] },
    { area: 'database', choice: 'PostgreSQL', justification: 'Orders and invoices need transactions.', alternatives_considered: ['Document store'], dependencies: ['Backend'], requirement_links: ['Entities: order, invoice, product'] },
    { area: 'auth', choice: 'JWT access and refresh tokens', justification: 'Stateless sign-in for staff and customers.', alternatives_considered: ['Server sessions'], dependencies: ['Authorization'], requirement_links: [] },
    { area: 'authorization', choice: 'Roles with owner isolation', justification: 'Only the store issues invoices.', alternatives_considered: ['No authorization'], dependencies: ['Auth'], requirement_links: ['Invoices are issued by the store, never by the customer.'] },
  ],
};

const BLUEPRINT_VERSIONS = [
  { id: 'bv_3', version: 3, blueprint: BLUEPRINT, provider: 'deepseek', providerLabel: 'DeepSeek', model: 'deepseek-chat', generated_at: '2026-09-12T09:00:00Z', generation_time_ms: 41200, tokens: { input: 18400, output: 6100 }, user: USER.user_id, score: 82, hash: 'sha256:44ab', prompt: 'v2', base_version: 2, metadata: {} },
  { id: 'bv_2', version: 2, blueprint: BLUEPRINT, provider: 'deepseek', providerLabel: 'DeepSeek', model: 'deepseek-chat', generated_at: '2026-09-11T19:20:00Z', generation_time_ms: 38800, tokens: { input: 17100, output: 5400 }, user: USER.user_id, score: 74, hash: 'sha256:1c90', prompt: 'v2', base_version: 1, metadata: {} },
];

const ENGINEERING_REVIEW = {
  generation_readiness: 'APPROVED',
  good_decisions: [{ title: 'Invoices isolated in their own service module', detail: 'Keeps the tax rules out of the cart.', area: 'architecture' }],
  debatable_decisions: [{ title: 'Server-rendered catalogue', detail: 'Simple now, but a heavy catalogue may need a cache later.', area: 'frontend' }],
  risks: [{ title: 'No payment provider chosen', detail: 'The invoice flow stays incomplete until one is picked.', area: 'requirements' }],
  gaps: [],
  inconsistencies: [],
  scalability_impact: 'Fine to a few thousand orders a day.',
  security_impact: 'No secret is stored in the repository.',
  recommendations: ['Pick a payment provider before generation.'],
  score: { overall: 82, categories: [] },
  committee: [
    { role: 'architect', rating: 4, verdict: 'approved', rationale: 'The module split matches the domain.', signals: [] },
    { role: 'security_engineer', rating: 3, verdict: 'approved_with_caveats', rationale: 'Invoice export needs an access rule.', signals: [] },
  ],
  dimensions: [],
  final_opinion: { deterministic: true, readiness_score: 82, open_questions: 1, complexity: 'Média', risk: 'Baixo', scalability: 'Adequada', narrative: 'The blueprint covers the described scope; one requirement is still open.', disclaimer: 'This reading comes from the blueprint, not from generated code.' },
};

const MEMORIES = [
  { id: 'mem_1', scope_type: 'project', scope_id: 'room_5b9e2c71a0d4', memory_type: 'decision', content: 'Invoices are issued by the store, never by the customer.', origin: 'room_message', confidence: 0.92, expires_at: null, status: 'active', created_at: '2026-09-10T09:16:00Z', updated_at: '2026-09-10T09:16:00Z' },
  { id: 'mem_2', scope_type: 'project', scope_id: 'room_5b9e2c71a0d4', memory_type: 'constraint', content: 'The catalogue must stay server-rendered for SEO.', origin: 'engineering_review', confidence: 0.81, expires_at: null, status: 'active', created_at: '2026-09-12T10:02:00Z', updated_at: '2026-09-12T10:02:00Z' },
];

const WORK_ESTIMATE = {
  project_name: 'Nova Commerce', complexity: 'Média', complexity_id: 'medium', size_band: 'M',
  healthy_minimum_label: '2 semanas', risk_level: 'Baixo', risk_level_id: 'low',
  phases: [
    { id: 'architecture', label: 'Arquitetura', duration_label: '2 dias', duration_value: 2, duration_unit: 'days' },
    { id: 'backend', label: 'Backend', duration_label: '4 dias', duration_value: 4, duration_unit: 'days' },
    { id: 'frontend', label: 'Frontend', duration_label: '3 dias', duration_value: 3, duration_unit: 'days' },
    { id: 'tests', label: 'Testes', duration_label: '1 dia', duration_value: 1, duration_unit: 'days' },
  ],
  drivers: [], driver_items: [{ id: 'entities', count: 9 }, { id: 'workflows', count: 4 }],
  no_rush_message: 'Three modules and an export: two healthy weeks, not two days.',
  generated_at: '2026-09-11T09:00:00Z',
};

const EVOLUTION_INSIGHT = {
  stack_signature: 'python:fastapi + typescript:nextjs + postgres',
  sample_size: 7,
  certification_rate: 0.71,
  avg_repair_cycles: 1.4,
  outcome_counts: { CERTIFIED: 5, FAILED: 2 },
  advisory_text: 'Five of your seven runs on this stack certified; the two that failed both failed on migrations.',
};

const ROOM_DETAIL = {
  room_id: 'room_5b9e2c71a0d4',
  workspace_id: 'ws_7a1f30c9e2b4',
  title: 'Nova Commerce',
  status: 'META_FACTORY_RUNNING',
  delivery_type: 'web',
  preferred_language: 'typescript',
  execution_profile: 'professional',
  raw_intent: 'A storefront with a catalogue, a cart and invoices.',
  locale: 'pt-BR',
  confidence: 0.82,
  degraded: false,
  spec: null,
  open_questions: ROOM_QUESTIONS,
  messages: ROOM_MESSAGES,
  prompt_master_md: '# PromptMaster\n\n## Scope\nA storefront with a catalogue, a cart and invoices.\n\n## Rules\nInvoices are issued by the store and must be exportable.',
  prompt_master_versions: PROMPT_VERSIONS,
  architecture_blueprint: BLUEPRINT,
  blueprint_versions: BLUEPRINT_VERSIONS,
  active_blueprint_version: 3,
  stack_proposal: STACK_PROPOSAL,
  generation_handoff: null,
  readiness_checklist: [],
  engineering_review: ENGINEERING_REVIEW,
  engineering_review_repairs: [],
  workflow: null,
  history: [],
  operational_log: [],
  last_failure: null,
  created_at: '2026-09-10T09:12:00Z',
  updated_at: '2026-09-15T13:28:00Z',
};

const KERNEL = {
  project_id: 'nova-commerce_3f9a1c2b7d4e',
  state: 'PARTIALLY_VERIFIED',
  kernel_phase: 'GENERATING',
  reason: 'The mission is still generating; two quality blockers are open from the previous attempt.',
  override_active: false,
  human_review_acknowledged: false,
  build_verified: false,
  quality_gate_blocker_count: 2,
  functional_completeness_status: 'PARTIALLY_VERIFIED',
  evidence: [
    { id: 'build_log', label: 'Build log', available: true, source: 'file', path: '.ldcn/build.log' },
    { id: 'quality_report', label: 'Quality report', available: true, source: 'file', path: '.ldcn/quality.json' },
    { id: 'test_run', label: 'Test run', available: false, source: 'marker', path: null },
    { id: 'runtime_audit', label: 'Runtime API audit', available: false, source: 'marker', path: null },
  ],
  generated_at: '2026-09-16T09:05:00Z',
};

const DELIVERY = {
  project_id: 'nova-commerce_3f9a1c2b7d4e',
  kernel_phase: 'GENERATING',
  blocked: true,
  block_reason: 'The mission has not finished yet.',
  options: [
    { mode: 'zip_only', recommended: true, label: 'Baixar projeto ZIP', reason: 'Caminho mais simples, sem nenhuma conexao a configurar.', label_key: 'delivery.mode.zipOnly', reason_key: 'delivery.reason.simplestPath', reason_params: {} },
    { mode: 'git_export', recommended: false, label: 'Criar/enviar para um repositorio Git', reason: '', label_key: 'delivery.mode.gitExport', reason_key: '' },
  ],
  current_profile: null,
};

/** One mission in full, as GET /api/meta-factory/jobs/{job_id} returns it, with the stream frames it emits. */
const JOB_DETAIL = {
  id: 'genjob_9f14c7b2e08a55',
  projectId: 'room_5b9e2c71a0d4',
  generatedProjectId: 'nova-commerce_3f9a1c2b7d4e',
  workspaceId: 'ws_7a1f30c9e2b4',
  projectName: 'Nova Commerce',
  status: 'BACKEND_GENERATING',
  currentStage: 'BACKEND_GENERATING',
  provider: 'deepseek',
  providerLabel: 'DeepSeek',
  model: 'deepseek-chat',
  blueprintVersion: 3,
  startedAt: '2026-09-15T12:40:00Z',
  finishedAt: null,
  progress: 48,
  error: null,
  retryCount: 1,
  buildStatus: 'PENDING',
  buildAttempts: 0,
  manualBuildRetryCount: 0,
  buildSkipAcknowledged: false,
  awaitingRepairApproval: false,
  manualBuildFixGuide: null,
  artifacts: [
    { id: 'art_1', stage: 'backend', name: 'invoices_router.py', kind: 'source', path: 'backend/app/routes/invoices.py', size_bytes: 4821, checksum: 'sha256:9f21', valid: true, warnings: [], created_at: '2026-09-16T09:02:00Z' },
    { id: 'art_2', stage: 'backend', name: 'invoice_service.py', kind: 'source', path: 'backend/app/services/invoice_service.py', size_bytes: 9140, checksum: 'sha256:1c04', valid: true, warnings: ['docstring missing'], created_at: '2026-09-16T09:04:00Z' },
    { id: 'art_3', stage: 'contracts', name: 'invoice.contract.ts', kind: 'contract', path: 'packages/contracts/invoice.contract.ts', size_bytes: 2210, checksum: 'sha256:77ab', valid: true, warnings: [], created_at: '2026-09-15T13:10:00Z' },
  ],
  logs: [],
  events: [],
  checkpoints: [
    { id: 'cp_1', stage: 'BACKEND_GENERATING', chunk: 'routes', status: 'success', attempt: 1, artifact_ids: ['art_1'], payload_bytes: 18422, estimated_tokens: 5400, parser: 'file_protocol', validator: 'python_ast', partitioned: false, started_at: '2026-09-16T09:00:00Z', finished_at: '2026-09-16T09:02:00Z', detail: '' },
    { id: 'cp_2', stage: 'BACKEND_GENERATING', chunk: 'services', status: 'running', attempt: 2, artifact_ids: [], payload_bytes: 26110, estimated_tokens: 7300, parser: 'file_protocol', validator: null, partitioned: true, started_at: '2026-09-16T09:03:00Z', finished_at: null, detail: 'retry after a truncated response' },
  ],
  stageStatuses: {
    contracts: 'success', database: 'success', backend: 'running', frontend: 'waiting', mobile: 'skipped',
    security: 'waiting', tests: 'waiting', docs: 'waiting', build: 'waiting', package: 'waiting',
  },
  virtualCompany: {
    jobId: 'genjob_9f14c7b2e08a55',
    status: 'OPEN',
    instances: [
      { instanceId: 'ai_1', definitionId: 'backend_engineer', definitionVersion: '2026.09', competencies: ['python', 'fastapi'], certification: 'CERTIFIED' },
      { instanceId: 'ai_2', definitionId: 'contract_designer', definitionVersion: '2026.09', competencies: ['typescript'], certification: 'CERTIFIED' },
    ],
  },
  agentAssignments: { backend: 'ai_1', contracts: 'ai_2' },
  partial: false,
  valid: false,
  packageReady: false,
  createdAt: '2026-09-15T12:40:00Z',
  updatedAt: '2026-09-16T09:05:00Z',
  archived: false,
};

const STREAM_EVENTS = [
  { id: 'ev_1', jobId: JOB_DETAIL.id, timestamp: '2026-09-16T09:00:05Z', stage: 'backend', type: 'stage_started', level: 'info', message: 'Backend stage started', role: 'backend_engineer' },
  { id: 'ev_2', jobId: JOB_DETAIL.id, timestamp: '2026-09-16T09:02:00Z', stage: 'backend', type: 'artifact_written', level: 'info', message: 'backend/app/routes/invoices.py written', artifactPath: 'backend/app/routes/invoices.py' },
  { id: 'ev_3', jobId: JOB_DETAIL.id, timestamp: '2026-09-16T09:03:10Z', stage: 'backend', type: 'command_finished', level: 'info', message: 'python -m compileall finished', command: 'python -m compileall .', exitCode: 0, durationMs: 1840 },
  { id: 'ev_4', jobId: JOB_DETAIL.id, timestamp: '2026-09-16T09:04:20Z', stage: 'backend', type: 'repair_applied', level: 'warning', message: 'Deterministic repair applied to invoice_service.py' },
];

/** The stream as the backend writes it: id line + data line, frames separated by a blank line. */
const STREAM_BODY = [
  ...STREAM_EVENTS.map((event) => `id: ${event.id}\ndata: ${JSON.stringify({ type: 'execution_event', event })}`),
  `data: ${JSON.stringify({ type: 'generation_job', job: { ...JOB_DETAIL, events: [] } })}`,
  `data: ${JSON.stringify({ type: 'heartbeat', jobId: JOB_DETAIL.id, stage: JOB_DETAIL.currentStage })}`,
].join('\n\n') + '\n\n';

/** The failed attempt of the same project: it holds the two decisions a mission can raise at once. */
const JOB_FAILED = {
  ...JOB_DETAIL,
  id: 'genjob_2c81f0e9a47d13',
  /* Every generation writes its own project (ProjectWriter.write), so the earlier attempt has its own id. */
  generatedProjectId: 'nova-commerce_8e21d4c7a0b9',
  status: 'NEEDS_USER_ACTION',
  currentStage: 'BACKEND_VALIDATING',
  progress: 62,
  buildStatus: 'SKIPPED_AFTER_FAILURE',
  buildSkipAcknowledged: false,
  finishedAt: '2026-09-12T21:47:00Z',
  archived: true,
  stageStatuses: { ...JOB_DETAIL.stageStatuses, backend: 'failed', database: 'success' },
  error: {
    stage: 'BACKEND_VALIDATING',
    agent: 'backend_engineer',
    provider: 'deepseek',
    model: 'deepseek-chat',
    http_status: null,
    payload_size: 28110,
    token_estimate: 7400,
    parser: 'file_protocol',
    validator: 'python_ast',
    attempt: 2,
    raw_response_path: null,
    artifacts_preserved: ['backend/app/routes/invoices.py'],
    recommended_action: 'Continue with warnings or retry the backend stage deterministically.',
    message: 'Two files failed validation after the repair attempt.',
    kind: 'failure',
    reason: 'validation_failed',
    elapsed_seconds: 2580,
    timeout_seconds: null,
    last_log: null,
    next_expected_transition: null,
    warning_count: 3,
    error_count: 2,
    blocking_count: 1,
    warning_breakdown: { docstring: 2, typing: 1 },
    last_successful_checkpoint: 'cp_1',
    last_generated_artifact: 'backend/app/routes/invoices.py',
    can_continue_with_warnings: true,
    errorCode: 'VALIDATION_FAILED',
    classification: 'USER_DECISION_REQUIRED',
  },
};

const JOBS_BY_ID: Readonly<Record<string, unknown>> = { [JOB_DETAIL.id]: JOB_DETAIL, [JOB_FAILED.id]: JOB_FAILED };

const QUALITY = {
  project_id: 'nova-commerce_3f9a1c2b7d4e',
  passed: false,
  can_release: false,
  release_override: false,
  score: 72,
  built: false,
  blocker_count: 2,
  warning_count: 3,
  info_count: 1,
  issues: [
    { id: 'q1', title: 'Endpoint without a test', severity: 'BLOCKER', category: 'coverage', file: 'backend/app/routes/invoices.py', root_cause: 'No test exercises POST /invoices', suggested_fix: 'Generate a test for the invoice route', auto_fixable: true, fix_status: 'pending' },
    { id: 'q2', title: 'Secret-looking string in a config file', severity: 'BLOCKER', category: 'security', file: 'backend/app/core/config.py', root_cause: 'A literal token was written into the file', suggested_fix: 'Move it to an environment variable', auto_fixable: false, fix_status: 'pending' },
    { id: 'q3', title: 'Missing docstring', severity: 'WARNING', category: 'style', file: 'backend/app/services/invoice_service.py', root_cause: 'Public function without a docstring', suggested_fix: 'Describe what the function returns', auto_fixable: true, fix_status: 'applied' },
  ],
  generated_at: '2026-09-16T09:05:00Z',
};

const CHIEF = {
  id: 'chief_1', version: 2, verdict: 'CHANGES_REQUIRED',
  scope_status: 'COVERED', requirements_status: 'PARTIAL', architecture_status: 'COVERED', quality_status: 'BLOCKED',
  findings: [{ id: 'f1', area: 'requirements', severity: 'HIGH', detail: 'Invoice export is described but not implemented.' }],
  evidence_refs: ['report_4471', 'genjob_9f14c7b2e08a55'],
  reworkable: ['backend'],
  summary: 'Two quality blockers and one requirement are still open, so the mission cannot be certified yet.',
  created_at: '2026-09-16T09:06:00Z',
};

const TEST_PROOF = {
  proven: false,
  reason: 'The latest session failed at the API gate, so the passing run before it no longer proves this project.',
  latest_status: 'failed',
  latest_session_id: 'trs_88a1',
  passing_session_id: 'trs_5c20e7a1',
  proved_at: '2026-09-13T16:16:20Z',
};

const DOWNLOADS = [
  { downloadId: 'dl_1', projectId: 'nova-commerce_3f9a1c2b7d4e', workspaceId: 'ws_7a1f30c9e2b4', status: 'ready', artifactId: 'art_zip_1', checksumSha256: '4f21c9de77ab1102cc90', sizeBytes: 3_812_402, createdAt: '2026-09-14T09:40:00Z', expiresAt: '2026-09-21T09:40:00Z', downloadedAt: '2026-09-14T09:41:00Z', downloadUrl: '/api/meta-factory/nova-commerce_3f9a1c2b7d4e/download' },
];

const PREPARED = {
  contractVersion: '1.0', project_id: 'nova-commerce_3f9a1c2b7d4e', status: 'prepared',
  download_url: '/api/meta-factory/nova-commerce_3f9a1c2b7d4e/download',
  zip_size_bytes: 3_812_402, file_count: 214, source_size_bytes: 9_120_880,
  security: { status: 'clean', message: 'No secret was found in the package.' },
};

const EXPORTED = {
  namespace: 'nova-labs', repo_name: 'nova-commerce', branch: 'main', commit_message: 'Initial commit from LDCN OS',
  visibility: 'private', provider: 'github', status: 'success', repo_url: 'https://github.com/nova-labs/nova-commerce',
  file_count: 214, blocked: false, message: 'The repository was created and the first commit was pushed.',
};

const COMPANY = {
  company_id: 'cmp_5f31a',
  job_id: 'genjob_9f14c7b2e08a55',
  project_id: 'nova-commerce_3f9a1c2b7d4e',
  source_mission_id: null,
  status: 'OPEN',
  certification_mode: 'OBSERVE',
  opened_at: '2026-09-15T12:40:00Z',
  closed_at: null,
  closed_reason: null,
  capabilities: ['python.fastapi', 'typescript.nextjs', 'postgres'],
  teams: [
    {
      team_id: 'team_backend', team_key: 'backend', label: 'Backend', mandate: 'Owns the API and its data access.',
      positions: [
        {
          position_id: 'pos_1', definition_id: 'backend_engineer', seat_number: 1, title: 'Backend engineer',
          required_competencies: ['python.fastapi'], why: 'The blueprint asks for a FastAPI service.',
          reports_to_position_id: null,
          member: { membership_id: 'mem_1', instance_id: 'ai_1', definition_id: 'backend_engineer', certification: 'CERTIFIED' },
        },
        {
          position_id: 'pos_2', definition_id: 'data_engineer', seat_number: 1, title: 'Data engineer',
          required_competencies: ['warehouse.dbt'], why: 'The invoice export asks for a warehouse model.',
          reports_to_position_id: 'pos_1', member: null,
        },
      ],
    },
    {
      team_id: 'team_frontend', team_key: 'frontend', label: 'Frontend', mandate: 'Owns the interface and its contracts.',
      positions: [
        {
          position_id: 'pos_3', definition_id: 'frontend_engineer', seat_number: 1, title: 'Frontend engineer',
          required_competencies: ['typescript.nextjs'], why: 'The delivery is a web app.',
          reports_to_position_id: null,
          member: { membership_id: 'mem_2', instance_id: 'ai_2', definition_id: 'frontend_engineer', certification: 'QUALIFIED' },
        },
      ],
    },
  ],
  assignments: [],
  advisory: null,
};

const ASSIGNMENTS = [
  { role: 'backend_engineer', instance_id: 'ai_1', membership_id: 'mem_1', refusal_code: null, detail: '', produced_by_instance_id: 'ai_1' },
  { role: 'data_engineer', instance_id: null, membership_id: null, refusal_code: 'NO_CERTIFIED_SPECIALIST', detail: 'No agent is certified for warehouse.dbt.', produced_by_instance_id: null },
];

const COMPANY_JOBS = [
  { id: 'cjob_1', blueprint_ref: 'backend.invoices', type: 'implement', title: 'Invoice endpoints', team_id: 'team_backend', status: 'READY', refusal_code: null, detail: 'Routes and service for invoices.', depth: 0, required_competencies: ['python.fastapi'], required_gates: ['tests'], dependency_job_ids: [], reviewer_required: true },
  { id: 'cjob_2', blueprint_ref: 'data.invoice_export', type: 'implement', title: 'Invoice export model', team_id: 'team_backend', status: 'REFUSED', refusal_code: 'NO_CERTIFIED_SPECIALIST', detail: 'Nobody in this company can do warehouse.dbt.', depth: 1, required_competencies: ['warehouse.dbt'], required_gates: [], dependency_job_ids: ['cjob_1'], reviewer_required: false },
  { id: 'cjob_3', blueprint_ref: 'frontend.invoices', type: 'implement', title: 'Invoice screens', team_id: 'team_frontend', status: 'BLOCKED', refusal_code: null, detail: 'Waits for the invoice endpoints.', depth: 1, required_competencies: ['typescript.nextjs'], required_gates: [], dependency_job_ids: ['cjob_1'], reviewer_required: true },
];

/* Shaped like ImplementationPlanView: the critical path is the planner's longest dependency chain. */
const PLAN_VIEW = {
  plan_id: 'plan_1', version: 1, source: 'implementation_planner', summary: 'Three units of work; the critical path has two steps.',
  critical_path: ['backend.invoices', 'frontend.invoices'],
  parallelizable: [['backend.invoices'], ['data.invoice_export', 'frontend.invoices']],
  milestones: [],
  blueprints: [
    { ref: 'backend.invoices', type: 'implement', title: 'Invoice endpoints', description: 'Routes and service for invoices.', requirement_refs: ['workflow:issue invoice', 'entity:invoice'], architecture_refs: ['backend'], required_competencies: ['python.fastapi'], dependency_refs: [], required_gates: ['tests'], reviewer_required: true, complexity: 'medium', status: 'READY' },
    { ref: 'data.invoice_export', type: 'implement', title: 'Invoice export model', description: 'Warehouse model for the invoice export.', requirement_refs: ['workflow:export invoices'], architecture_refs: ['database'], required_competencies: ['warehouse.dbt'], dependency_refs: ['backend.invoices'], required_gates: [], reviewer_required: false, complexity: 'medium', status: 'REFUSED' },
    { ref: 'frontend.invoices', type: 'implement', title: 'Invoice screens', description: 'Screens to issue and list invoices.', requirement_refs: ['workflow:issue invoice'], architecture_refs: ['frontend'], required_competencies: ['typescript.nextjs'], dependency_refs: ['backend.invoices'], required_gates: [], reviewer_required: true, complexity: 'low', status: 'BLOCKED' },
  ],
};

const EXECUTIONS = [
  { id: 'exe_1', role: 'backend_engineer', stage: 'backend', status: 'SUCCESS', agent_instance_id: 'ai_1', compiled_prompt_snapshot_id: 'snap_1', blueprint_ref: 'backend.invoices', provider: 'deepseek', model: 'deepseek-chat', served_by_fallback: false, input_tokens: 18400, output_tokens: 5200 },
  { id: 'exe_2', role: 'frontend_engineer', stage: 'frontend', status: 'FAILED', agent_instance_id: 'ai_2', compiled_prompt_snapshot_id: 'snap_2', blueprint_ref: 'frontend.invoices', provider: 'deepseek', model: null, served_by_fallback: true, input_tokens: 9100, output_tokens: 1200 },
];

const EXPANSIONS = [
  { id: 'exp_1', capability_key: 'warehouse.dbt', status: 'REFUSED', reason: 'The plan needs a warehouse model.', resolved_seat: null, resolved_agent_instance_id: null, refusal_detail: 'No certified specialist exists for this capability.', created_at: '2026-09-15T13:00:00Z', resolved_at: null },
];

const AGENT = {
  instance_id: 'ai_1', definition_id: 'backend_engineer', definition_version: '2026.09', title: 'Backend engineer',
  team_key: 'backend', competencies: ['python.fastapi', 'postgres'], certification: 'CERTIFIED', certification_derived: 'QUALIFIED',
  certification_source: 'LEDGER', reliability: 'QUALIFIED', membership_type: 'CORE', hired_at: '2026-09-15T12:40:00Z',
  released_at: null, executions: EXECUTIONS.slice(0, 1),
};

const ROLE_MAP = {
  roles: [
    { role: 'backend_engineer', seat: 'backend_engineer', team_key: 'backend', title: 'Backend engineer', competencies: ['python.fastapi', 'postgres'], registry_ids: ['backend_engineer'], specialist: 'fastapi', foundation_role: 'engineer', contract_role: 'backend', reports_to: 'tech_lead', review_of: null },
    { role: 'frontend_engineer', seat: 'frontend_engineer', team_key: 'frontend', title: 'Frontend engineer', competencies: ['typescript.nextjs'], registry_ids: ['frontend_engineer'], specialist: 'nextjs', foundation_role: 'engineer', contract_role: 'frontend', reports_to: 'tech_lead', review_of: null },
  ],
  seats: [
    { role: 'backend_engineer', seat: 'backend_engineer', team_key: 'backend', title: 'Backend engineer', competencies: ['python.fastapi', 'postgres'], registry_ids: ['backend_engineer'], specialist: 'fastapi', foundation_role: 'engineer', contract_role: 'backend', reports_to: 'tech_lead', review_of: null },
    { role: 'frontend_engineer', seat: 'frontend_engineer', team_key: 'frontend', title: 'Frontend engineer', competencies: ['typescript.nextjs'], registry_ids: ['frontend_engineer'], specialist: 'nextjs', foundation_role: 'engineer', contract_role: 'frontend', reports_to: 'tech_lead', review_of: null },
    { role: '', seat: 'architect', team_key: 'architecture', title: 'Architect', competencies: ['architecture'], registry_ids: ['architect'], specialist: null, foundation_role: 'architect', contract_role: null, reports_to: null, review_of: 'backend_engineer' },
  ],
};

const CERTIFICATIONS = [
  { definition_id: 'backend_engineer', title: 'Backend engineer', state: 'CERTIFIED', reason: 'Twelve runs, nine of them passing every gate.', mode: 'OBSERVE', hired_state: 'CERTIFIED', source: 'LEDGER', would_have_refused: false, evidence: { runs: 12, successes: 9, failures: 2, partials: 1, gate_failures: 2, avg_repair_cycles: 0.4, last_outcome_at: '2026-09-14T09:32:00Z', reason: 'ledger', would_have_refused: false } },
  { definition_id: 'data_engineer', title: 'Data engineer', state: 'UNKNOWN', reason: 'No run has been recorded for this definition.', mode: 'OBSERVE', hired_state: 'UNKNOWN', source: 'NONE', would_have_refused: true, evidence: { runs: 0, successes: 0, failures: 0, partials: 0, gate_failures: 0, avg_repair_cycles: 0, last_outcome_at: null, reason: 'no evidence', would_have_refused: true } },
];

const COMPOSITIONS = {
  compositions: [
    {
      id: 'composition:nextjs+fastapi+postgres', mode: 'integrated', verdict: 'CERTIFIED', executed_at: '2026-09-06T18:20:00Z',
      checks: [
        { dimension: 'build', status: 'PASSED', detail: 'Both services built from a clean checkout.' },
        { dimension: 'runtime', status: 'PASSED', detail: 'The frontend reached the API through the compose network.' },
        { dimension: 'database', status: 'PASSED', detail: 'Migrations ran and the schema matched.' },
      ],
    },
    {
      id: 'composition:react+spring+postgres', mode: 'family', verdict: 'PARTIAL', executed_at: '2026-09-05T11:02:00Z',
      checks: [{ dimension: 'runtime', status: 'NOT_RUN', detail: 'Only the family record exists; the composition never ran together.' }],
    },
  ],
};

/* The build profile catalogue and the certification ledger: component rows and composition rows, as served. */
const TEST_ROOM_PROFILES = {
  profiles: [
    { id: 'python/fastapi@pip', language: 'python', framework: 'fastapi', tool: 'pip', supportLevel: 'supported', limitations: [], toolchain: ['python3.12', 'pip'], proves: { proves_build: true, proves_tests: true, proves_runtime: true, proves_health: true } },
    { id: 'typescript/nextjs@npm', language: 'typescript', framework: 'nextjs', tool: 'npm', supportLevel: 'supported', limitations: [], toolchain: ['node22', 'npm'], proves: { proves_build: true, proves_tests: true, proves_runtime: true, proves_health: true } },
    { id: 'java/spring-boot@maven', language: 'java', framework: 'spring-boot', tool: 'maven', supportLevel: 'supported', limitations: [], toolchain: ['jdk21', 'maven'], proves: { proves_build: true, proves_tests: true, proves_runtime: true, proves_health: true } },
    { id: 'go/gin@go', language: 'go', framework: 'gin', tool: 'go', supportLevel: 'partial', limitations: ['No health check is declared.'], toolchain: ['go1.23'], proves: { proves_build: true, proves_tests: true, proves_runtime: false, proves_health: false } },
  ],
};

const STACK_CERTIFICATIONS = [
  { id: 'stackcert_c1', stack_id: 'python/fastapi@pip', profile_id: 'composition:nextjs+fastapi+postgres', sample_ref: 'composition:nextjs+fastapi+postgres#integrated', checks: [{ dimension: 'RUNTIME', status: 'PASSED', detail: '', evidence_ref: '' }], verdict: 'CERTIFIED', executed_at: '2026-09-06T18:20:00Z' },
  { id: 'stackcert_c2', stack_id: 'java/spring-boot@maven', profile_id: 'composition:react+spring+postgres', sample_ref: 'composition:react+spring+postgres', checks: [{ dimension: 'RUNTIME', status: 'NOT_EXECUTED', detail: '', evidence_ref: '' }], verdict: 'PARTIAL', executed_at: '2026-09-05T11:02:00Z' },
  { id: 'stackcert_p1', stack_id: 'python/fastapi@pip', profile_id: 'python/fastapi@pip', sample_ref: 'certification_sample:fastapi', checks: [{ dimension: 'BUILD', status: 'PASSED', detail: '', evidence_ref: '' }], verdict: 'CERTIFIED', executed_at: '2026-09-04T10:00:00Z' },
  { id: 'stackcert_p2', stack_id: 'typescript/nextjs@npm', profile_id: 'typescript/nextjs@npm', sample_ref: 'certification_sample:nextjs', checks: [{ dimension: 'BUILD', status: 'PASSED', detail: '', evidence_ref: '' }], verdict: 'CERTIFIED', executed_at: '2026-09-04T11:00:00Z' },
  { id: 'stackcert_p3', stack_id: 'java/spring-boot@maven', profile_id: 'java/spring-boot@maven', sample_ref: 'certification_sample:spring', checks: [{ dimension: 'TESTS', status: 'FAILED', detail: '', evidence_ref: '' }], verdict: 'FAILED', executed_at: '2026-09-03T09:00:00Z' },
];

const COGNITIVE = {
  roles: [
    {
      runId: 'agentcert_001', roleId: 'backend_engineer', verdict: 'CERTIFIED', startedAt: '2026-09-06T10:00:00Z', finishedAt: '2026-09-06T10:24:00Z',
      axes: {
        command_becomes_proposal: { status: 'PASSED', depth: 'deep', model: 'deepseek-chat', failedChecks: [] },
        refuses_without_evidence: { status: 'PASSED', depth: 'deep', model: 'deepseek-chat', failedChecks: [] },
      },
    },
    {
      runId: 'agentcert_002', roleId: 'frontend_engineer', verdict: 'FAILED', startedAt: '2026-09-06T11:00:00Z', finishedAt: '2026-09-06T11:31:00Z',
      axes: { command_becomes_proposal: { status: 'FAILED', depth: 'shallow', model: 'deepseek-chat', failedChecks: ['asks_before_assuming'] } },
    },
  ],
  totalRuns: 7,
};

const LANGUAGE_PACKS = { languages: [{ language: 'python', status: 'CERTIFIED' }, { language: 'typescript', status: 'CERTIFIED' }, { language: 'go', status: 'QUALIFIED' }] };

const PLAN = {
  mission_ref: 'usr_4d7a19e0c2b8:planner-preview',
  status: 'COMPOSED',
  positions: [
    { role_id: 'backend_engineer', reason: 'The stack declares a FastAPI backend.', mandatory: true, required_competencies: [['python.fastapi']] },
    { role_id: 'frontend_engineer', reason: 'The stack declares a Next.js frontend.', mandatory: true, required_competencies: [['typescript.nextjs']] },
    { role_id: 'security_engineer', reason: 'Authentication was asked for.', mandatory: false, required_competencies: [['security.auth']] },
  ],
  assignments: [
    { role_id: 'backend_engineer', agent_version_ref: 'backend_engineer@2026.09', risk_flag: null },
    { role_id: 'frontend_engineer', agent_version_ref: 'frontend_engineer@2026.09', risk_flag: 'DERIVED_BELOW_HIRED' },
  ],
  consultation_pool: ['architect'],
  gaps: [{ competency: 'security.auth', required_depth: 'deep', best_available: 'backend_engineer', detail: 'No security specialist is certified at depth deep.' }],
  notes: [],
  composition: {
    maturity: 'CERTIFIED', composable: true, build_order: ['data', 'backend', 'frontend'], startup_order: ['data', 'backend', 'frontend'],
    integration_contract: null, gaps: [],
    components: [
      { slot: 'data', stack_id: 'postgres', profile_id: 'database:postgres', maturity: 'CERTIFIED', health: 'HEALTHY', depends_on: [] },
      { slot: 'backend', stack_id: 'python:fastapi', profile_id: 'stack:fastapi', maturity: 'CERTIFIED', health: 'HEALTHY', depends_on: ['data'] },
      { slot: 'frontend', stack_id: 'typescript:nextjs', profile_id: 'stack:nextjs', maturity: 'CERTIFIED', health: 'HEALTHY', depends_on: ['backend'] },
    ],
  },
};

const LAB = {
  contractVersion: '1.0', project_id: 'nova-commerce_3f9a1c2b7d4e', project_path: '/workspaces/nova-commerce_3f9a1c2b7d4e',
  project_name: 'Nova Commerce', stack: 'fastapi + nextjs', primary_language: 'python',
  languages: { python: 61, typescript: 34, sql: 5 }, file_count: 214, line_count: 18422, dependency_count: 37,
  dependencies: [
    { name: 'fastapi', version: '0.115.0', ecosystem: 'pypi' },
    { name: 'sqlalchemy', version: '2.0.34', ecosystem: 'pypi' },
    { name: 'next', version: '15.5.2', ecosystem: 'npm' },
  ],
  containers: ['api', 'web', 'db'], databases: ['postgres'], cloud: [], build: 'PASSED', coverage: 'not measured',
};

const TERMINAL = {
  project_id: 'nova-commerce_3f9a1c2b7d4e', command: 'ls', cwd: '/workspaces/nova-commerce_3f9a1c2b7d4e',
  exit_code: 0, duration_ms: 42, allowed_command: true, runtime_status: 'idle', sandbox_id: 'sbx_1',
  output: [{ kind: 'stdout', text: 'backend\nfrontend\ndocker-compose.yml\nREADME.md' }],
};

const CHANGE_DETAIL = {
  change_request_id: 'chg_6f0a4b12d7e9', owner_user_id: USER.user_id, workspace_id: 'ws_7a1f30c9e2b4',
  project_id: 'nova-commerce_3f9a1c2b7d4e', room_id: 'room_5b9e2c71a0d4', feature_id: null, task_id: null,
  base_version: 'v3', status: 'Analyzed', intent: 'Split the invoice export into its own job',
  classification: { classification: 'blueprint_version', confidence: 0.82 },
  scope: ['backend/app/services/invoice_service.py', 'backend/app/routes/invoices.py'],
  impact: null,
  diff: [],
  build_result: null, preview_result: null, approval: null, result: null,
  history: [
    { id: 'h1', event: 'created', actor: USER.email, source: 'ui', created_at: '2026-09-15T18:02:00Z' },
    { id: 'h2', event: 'analyzed', actor: 'system', source: 'change_patch_engine', created_at: '2026-09-15T18:20:00Z' },
  ],
  operational_log: [], last_failure: null, created_at: '2026-09-15T18:02:00Z', updated_at: '2026-09-15T18:20:00Z',
};

const CHANGE_DIFF = {
  change_request_id: 'chg_6f0a4b12d7e9',
  files: [
    {
      path: 'backend/app/services/invoice_service.py',
      before: 'def export(): ...', after: 'def export(): ...\n\ndef export_job(): ...',
      unified_diff: '@@ -1,3 +1,6 @@\n def export():\n     ...\n+\n+def export_job():\n+    ...',
      change_kind: 'modified',
    },
  ],
};

const TEST_PROFILE = {
  status: 'matched',
  profile: {
    id: 'python.fastapi', language: 'python', framework: 'fastapi', tool: 'pytest', supportLevel: 'supported',
    limitations: [], toolchain: ['python3.12', 'pip', 'pytest'],
    proves: { proves_build: true, proves_tests: true, proves_runtime: true, proves_health: true },
  },
  requested: 'python.fastapi',
  reason: 'The stack lock names FastAPI, and the sandbox image installs its toolchain.',
  candidates: ['python.fastapi'],
};

const TEST_SESSIONS = [
  {
    id: 'trs_88a1', project_id: 'nova-commerce_3f9a1c2b7d4e', generation_job_id: 'genjob_9f14c7b2e08a55', company_id: 'cmp_5f31a',
    profile_id: 'python.fastapi', stage: 'api', status: 'failed',
    reason: 'The API gate answered 500 on /invoices.',
    gates: [
      {
        gate: 'build', label: 'Build', blockers: [], warnings: [], status: 'observed', reason: 'exit 0 in 41 s',
        evidence: [
          { id: 'build', gate: 'build', kind: 'command', status: 'observed', label: 'pip install -r requirements.txt', command: 'pip install -r requirements.txt', exit_code: 0, http_status: null, duration_ms: 41200, artifact_path: null, artifact_sha256: null, detail: { installed: true, built: true }, reason: '', observed_at: '2026-09-14T10:02:44Z' },
        ],
      },
      {
        // The runner reports an exit code and a duration: no count of tests is recorded, so none is shown.
        gate: 'tests', label: 'Tests', blockers: [], warnings: [], status: 'observed', reason: 'exit 0 in 18 s',
        evidence: [
          { id: 'tests', gate: 'tests', kind: 'test_run', status: 'observed', label: 'pytest -q', command: 'pytest -q', exit_code: 0, http_status: null, duration_ms: 18400, artifact_path: null, artifact_sha256: null, detail: {}, reason: '', observed_at: '2026-09-14T10:03:31Z' },
        ],
      },
      {
        gate: 'api', label: 'API', blockers: ['POST /invoices'], warnings: [], status: 'failed', reason: 'HTTP 500 in 1.2 s',
        evidence: [
          { id: 'invoices', gate: 'api', kind: 'http_probe', status: 'failed', label: 'POST /invoices', command: null, exit_code: null, http_status: 500, duration_ms: 1200, artifact_path: null, artifact_sha256: null, detail: { url: 'http://127.0.0.1:8080/invoices' }, reason: '', observed_at: '2026-09-14T10:05:12Z' },
        ],
      },
      {
        gate: 'health', label: 'Health', blockers: [], warnings: [], status: 'not_executed', reason: 'the API gate failed first',
        evidence: [
          { id: 'health', gate: 'health', kind: 'http_probe', status: 'not_executed', label: 'GET /health', command: null, exit_code: null, http_status: null, duration_ms: null, artifact_path: null, artifact_sha256: null, detail: {}, reason: 'The API gate failed first, so the health check was never reached.', observed_at: '2026-09-14T10:05:13Z' },
        ],
      },
    ],
    artifact_path: '.ldcn/test-room/trs_88a1.json', evidence_refs: ['trs_88a1'],
    started_at: '2026-09-14T10:02:00Z', finished_at: '2026-09-14T10:06:00Z',
  },
  /* The run before it, in the shape the service records: build, runtime, health and tests, every gate observed. */
  {
    id: 'trs_5c20e7a1', project_id: 'nova-commerce_3f9a1c2b7d4e', generation_job_id: 'genjob_9f14c7b2e08a55', company_id: 'cmp_5f31a',
    profile_id: 'python.fastapi', stage: 'finished', status: 'passed', reason: '',
    gates: [
      {
        gate: 'build', label: 'Build', blockers: [], warnings: [], status: 'observed', reason: '',
        evidence: [
          { id: 'build', gate: 'build', kind: 'command', status: 'observed', label: 'pip install -r requirements.txt', command: 'pip install -r requirements.txt', exit_code: 0, http_status: null, duration_ms: null, artifact_path: null, artifact_sha256: null, detail: { installed: true, built: true }, reason: '', observed_at: '2026-09-13T16:15:41Z' },
        ],
      },
      {
        gate: 'runtime', label: 'Running', blockers: [], warnings: [], status: 'observed', reason: '',
        evidence: [
          { id: 'start', gate: 'runtime', kind: 'process', status: 'observed', label: 'uvicorn app.main:app', command: 'uvicorn app.main:app --host 0.0.0.0 --port 8080', exit_code: null, http_status: null, duration_ms: null, artifact_path: 'app/main.py', artifact_sha256: null, detail: { handle: 'bg_41c7', port: 8080 }, reason: '', observed_at: '2026-09-13T16:15:49Z' },
        ],
      },
      {
        gate: 'health', label: 'Healthy', blockers: [], warnings: [], status: 'observed', reason: '',
        evidence: [
          { id: 'health', gate: 'health', kind: 'http_probe', status: 'observed', label: 'GET /health', command: null, exit_code: null, http_status: 200, duration_ms: 86, artifact_path: null, artifact_sha256: null, detail: { url: 'http://127.0.0.1:8080/health' }, reason: '', observed_at: '2026-09-13T16:15:52Z' },
        ],
      },
      {
        gate: 'tests', label: 'Tests', blockers: [], warnings: [], status: 'observed', reason: '',
        evidence: [
          { id: 'tests', gate: 'tests', kind: 'test_run', status: 'observed', label: 'pytest -q', command: 'pytest -q', exit_code: 0, http_status: null, duration_ms: 17900, artifact_path: null, artifact_sha256: null, detail: {}, reason: '', observed_at: '2026-09-13T16:16:12Z' },
        ],
      },
    ],
    artifact_path: '.ldcn/test-room/trs_5c20e7a1.json', evidence_refs: ['trs_5c20e7a1'],
    started_at: '2026-09-13T16:15:00Z', finished_at: '2026-09-13T16:16:20Z',
  },
];

/** What POST /api/test-room/{project_id}/run returns: the run itself, with the output the application printed. */
const TEST_RUN = {
  id: 'run_7e02', project_id: 'nova-commerce_3f9a1c2b7d4e', owner_user_id: 'usr_1', profile_id: 'python.fastapi',
  stage: 'finished', status: 'passed', reason: '', gates: TEST_SESSIONS[1]!.gates,
  artifact_path: '.ldcn/test-room/run_7e02.json',
  logs_tail: 'INFO:     Started server process [41]\nINFO:     Application startup complete.\nINFO:     Uvicorn running on http://0.0.0.0:8080',
  started_at: '2026-09-16T10:00:00Z', finished_at: '2026-09-16T10:01:24Z', detail: {},
};

const PREVIEW = {
  session_id: 'prv_71c0', project_id: 'nova-commerce_3f9a1c2b7d4e', status: 'running',
  reason: 'Both services answered their health check.', preview_url: 'http://127.0.0.1:41871/',
  started_at: '2026-09-16T08:40:00Z', last_activity_at: '2026-09-16T09:04:00Z',
};

const PREVIEW_CONSOLE = [
  { type: 'error', text: 'GET /api/invoices 500 (Internal Server Error)', at: '2026-09-16T09:03:40Z' },
  { type: 'log', text: 'hydrated in 320 ms', at: '2026-09-16T09:03:10Z' },
];

const MODERNIZE = {
  project_id: 'legacy-billing_7c21', source: 'git', file_count: 1840, total_bytes: 12_400_000,
  languages: { java: 74, xml: 18, sql: 8 }, created_at: '2026-09-02T14:10:00Z', updated_at: '2026-09-03T09:20:00Z',
  has_report: true, detected_stack: 'java:spring', overall_score: 58,
};

const POLICY_EXCEPTIONS = [
  { id: 'exc_1', project_id: 'nova-commerce_3f9a1c2b7d4e', program: 'psql', reason: 'The migration check needs the client inside the sandbox.', approved_by_user_id: USER.user_id, created_at: '2026-09-10T12:00:00Z', expires_at: '2026-09-24T12:00:00Z', revoked_at: null },
];

const GIT_CONNECTIONS: Readonly<Record<string, unknown>> = {
  github: { contractVersion: '1.0', provider: 'github', status: 'connected', username: 'nora-lima', avatar_url: null, namespaces: ['nova-labs'], repositories_count: 7, scopes: ['repo', 'workflow'], permission: 'write', last_sync: '2026-09-15T20:10:00Z', expires_at: null },
  gitlab: { contractVersion: '1.0', provider: 'gitlab', status: 'disconnected', username: null, avatar_url: null, namespaces: [], repositories_count: 0, scopes: [], permission: 'none', last_sync: null, expires_at: null },
};

const AI_KEYS = {
  keys: [
    { id: 'key_1', provider: 'deepseek', nome: 'Work key', apelido: null, masked: 'sk-…a1b2', modelo_padrao: 'deepseek-chat', status: 'valid', ativo: true, is_default: true, created_at: '2026-08-20T10:00:00Z', last_used_at: '2026-09-16T09:05:00Z', last_validated_at: '2026-09-15T07:55:00Z', validation_is_stale: false, validation_age_days: 1 },
    { id: 'key_2', provider: 'openai', nome: 'Personal', apelido: null, masked: 'sk-…9f31', modelo_padrao: null, status: 'untested', ativo: true, is_default: false, created_at: '2026-07-02T09:00:00Z', last_used_at: null, last_validated_at: null, validation_is_stale: false, validation_age_days: null },
  ],
};

const USAGE_BY_MODEL = [
  { model: 'deepseek-chat', provider: 'deepseek', requests: 140, avg_latency_ms: 2140, estimated_cost_usd: 0.7412, cache_hit_rate: 0.22 },
  { model: 'deepseek-reasoner', provider: 'deepseek', requests: 44, avg_latency_ms: 4820, estimated_cost_usd: 0.19, cache_hit_rate: 0.05 },
];

const TRIAL = { status: 'active', started_at: '2026-09-01T00:00:00Z', expires_at: '2026-09-30T00:00:00Z', converted_at: null };
const SUBSCRIPTION = { id: 'sub_1', organization_id: 'org_2c9e71a4b05d', plan_code: 'professional', status: 'active', started_at: '2026-09-01T00:00:00Z', current_period_end: '2026-10-01T00:00:00Z', cancelled_at: null, created_by_user_id: USER.user_id };
const BILLING_USAGE = { period_start: '2026-09-01T00:00:00Z', items: [{ resource_type: 'generation_job', quantity: 12, unit: 'jobs' }, { resource_type: 'preview_minutes', quantity: 320, unit: 'minutes' }] };
const ENTITLEMENTS = [
  { resource_type: 'generation_job', used: 12, monthly_limit: 50, allowed: true, period_start: '2026-09-01T00:00:00Z' },
  { resource_type: 'preview_minutes', used: 320, monthly_limit: null, allowed: true, period_start: '2026-09-01T00:00:00Z' },
  { resource_type: 'staging_deploy', used: 3, monthly_limit: 3, allowed: false, period_start: '2026-09-01T00:00:00Z' },
];

const SESSIONS = [
  { session_id: 'ses_1', ip_address: '192.168.15.12', device_label: 'Chrome on Windows', created_at: '2026-09-16T08:00:00Z', last_seen_at: '2026-09-16T09:05:00Z', is_current: true },
  { session_id: 'ses_2', ip_address: '10.0.0.4', device_label: 'Safari on iPhone', created_at: '2026-09-12T19:20:00Z', last_seen_at: '2026-09-14T21:10:00Z', is_current: false },
];

const MEMBERS = [
  { workspace_id: 'ws_7a1f30c9e2b4', user_id: USER.user_id, email: USER.email, full_name: USER.full_name, role: 'owner', created_at: '2026-08-31T11:20:00Z' },
  { workspace_id: 'ws_7a1f30c9e2b4', user_id: 'usr_9a12', email: 'rui@novalabs.example', full_name: 'Rui Alves', role: 'member', created_at: '2026-09-02T14:00:00Z' },
];

const SYSTEM_STATUS = {
  contractVersion: '1.0',
  backend_status: { contractVersion: '1.0', id: 'backend', label: 'Backend', status: 'healthy', detail: '1 394 tests green on the last run.' },
  frontend_status: { contractVersion: '1.0', id: 'frontend', label: 'Frontend', status: 'warning', detail: 'The new app is built in waves; some screens still open the current app.' },
  api_status: { contractVersion: '1.0', id: 'api', label: 'API', status: 'healthy', detail: '416 routes answering.' },
  build_status: { contractVersion: '1.0', id: 'build', label: 'Build', status: 'healthy', detail: 'Last build passed in 41 s.' },
  last_validation: '2026-09-15T22:10:00Z',
  test_coverage: '1 394 backend tests · 88 frontend e2e',
  active_modules: ['project-rooms', 'meta-factory', 'test-room', 'workforce', 'data-intelligence'],
  active_engines: ['factory_pipeline', 'quality_gate', 'auto_repair', 'evolution'],
  active_templates: ['fastapi-service', 'nextjs-app'],
  active_skills: ['contract_design', 'sql_review'],
  planned_extensions: [],
  registry_health: [
    { contractVersion: '1.0', id: 'model_registry', label: 'Model registry', status: 'healthy', detail: '23 models priced.' },
    { contractVersion: '1.0', id: 'role_registry', label: 'Role registry', status: 'healthy', detail: '157 roles.' },
    { contractVersion: '1.0', id: 'stack_registry', label: 'Stack registry', status: 'warning', detail: '12 stacks certified, 3 partial.' },
  ],
};

const AI_STATUS = { available: true, provider: 'deepseek', model: 'deepseek-chat', reason: 'A valid user key answered the last call.', mode: 'llm' };

const TRACES = [
  { id: 'trc_1', provider: 'deepseek', model: 'deepseek-chat', agent_role: 'backend_engineer', model_strategy: 'balanced', selection_policy: 'user_default_key', alternatives: [{ policy: 'user_default_key', model: 'deepseek-chat' }, { policy: 'cheapest', model: 'deepseek-reasoner' }], context_used: ['project_memory', 'stack_lock'], project_id: 'nova-commerce_3f9a1c2b7d4e', input_tokens: 18400, output_tokens: 5200, latency_ms: 2140, estimated_cost_usd: 0.0412, created_at: '2026-09-16T09:02:00Z' },
  { id: 'trc_2', provider: 'deepseek', model: 'deepseek-reasoner', agent_role: 'architect', model_strategy: 'deep', selection_policy: 'capability_match', alternatives: [{ policy: 'capability_match', model: 'deepseek-reasoner' }], context_used: ['blueprint'], project_id: 'nova-commerce_3f9a1c2b7d4e', input_tokens: 9100, output_tokens: 3100, latency_ms: 4820, estimated_cost_usd: 0.0291, created_at: '2026-09-15T18:40:00Z' },
];

const RUNTIME_CONFIG = { contractVersion: '1.0', workerLimit: 4, executionTimeoutMinutes: 45, logRetentionDays: 90 };

const ROADMAP = {
  contractVersion: '1.0',
  items: [
    { contractVersion: '1.0', id: 'rm_1', title: 'Next frontend', category: 'frontend', status: 'IN_PROGRESS', summary: 'The approved design, built in waves beside the current app.', progress: 62, dependencies: [], release: '2026.10', updated_at: '2026-09-16T09:00:00Z', owner: 'platform', priority: 'HIGH', maturity: 'BETA', risk: 'LOW', risk_basis: [], engines: [], apis: [], skills: [], contracts: [], documentation: [], impact: 'Every screen gets one honest source.', tags: [] },
    { contractVersion: '1.0', id: 'rm_2', title: 'Pending-decisions read model', category: 'backend', status: 'PLANNED', summary: 'One endpoint for what waits on a person, instead of composing it in the browser.', progress: 0, dependencies: [], release: '2026.11', updated_at: '2026-09-10T09:00:00Z', owner: 'platform', priority: 'MEDIUM', maturity: 'PLANNED', risk: 'LOW', risk_basis: [], engines: [], apis: [], skills: [], contracts: [], documentation: [], impact: 'Removes gap G4.', tags: [] },
  ],
  statuses: [], releases: [
    { contractVersion: '1.0', id: 'rel_1', title: '2026.10', date: '2026-10-01', status: 'IN_PROGRESS', progress: 62, features: ['Next frontend waves 1-5'], dependencies: [], risks: [] },
  ],
  platform_timeline: [], dependency_edges: [], impact_edges: [], executive_health: [], coverage: [],
  platform_metrics: [
    { contractVersion: '1.0', id: 'm1', label: 'Routes', value: '416', detail: 'API routes answering' },
    { contractVersion: '1.0', id: 'm2', label: 'Screens built', value: '30 / 55', detail: 'in the new frontend' },
  ],
  statistics: [], sprints: [],
};

const PLANS = [
  { code: 'free', name: 'Free', audience: 'Trying the platform', price_cents: 0, currency: 'USD', features: ['One project room', 'Deterministic pipeline'], limits: { generation_job: 3, preview_minutes: 60 } },
  { code: 'professional', name: 'Professional', audience: 'Indie builders and small teams', price_cents: 4900, currency: 'USD', features: ['Unlimited project rooms', 'Live preview', 'Git export'], limits: { generation_job: 50, preview_minutes: null } },
  { code: 'enterprise', name: 'Enterprise', audience: 'Organizations with review requirements', price_cents: null, currency: 'USD', features: ['Everything in Professional', 'Governance and audit'], limits: {} },
];

const REGISTRY_LANGUAGES = [
  { contractVersion: '1.0', id: 'python', name: 'Python', description: 'Readable, batteries included, strong data and API ecosystem.', ecosystem: 'PYPI', supported_runtimes: ['cpython'], supported_frameworks: ['fastapi', 'django'], supported_architectures: ['modular-monolith', 'layered'], enterprise_score: 92, learning_curve: 'GENTLE', performance_profile: 'BALANCED', scalability_profile: 'HIGH' },
  { contractVersion: '1.0', id: 'typescript', name: 'TypeScript', description: 'Typed JavaScript for web front ends and Node services.', ecosystem: 'NPM', supported_runtimes: ['node'], supported_frameworks: ['nextjs', 'nestjs', 'remix'], supported_architectures: ['modular-monolith'], enterprise_score: 90, learning_curve: 'MODERATE', performance_profile: 'BALANCED', scalability_profile: 'HIGH' },
  { contractVersion: '1.0', id: 'go', name: 'Go', description: 'Small binaries and predictable concurrency for services.', ecosystem: 'GO_MODULES', supported_runtimes: ['go'], supported_frameworks: ['chi'], supported_architectures: ['layered'], enterprise_score: 84, learning_curve: 'MODERATE', performance_profile: 'FAST', scalability_profile: 'HIGH' },
];

const REGISTRY_STACKS = [
  { contractVersion: '1.0', id: 'python.fastapi', name: 'FastAPI', category: 'BACKEND', status: 'CERTIFIED', description: 'A FastAPI service with SQLAlchemy and Alembic.', supported_locales: ['pt-BR', 'en-US'], supported_generation_modes: ['FULL'], allowed_architectures: ['MODULAR_MONOLITH', 'LAYERED'], required_fields: [], optional_fields: [], features: [], constraints: [], wizard_profile: {}, template_compatibility: {}, gatekeeper_profile: {} },
  { contractVersion: '1.0', id: 'typescript.nextjs', name: 'Next.js', category: 'FRONTEND', status: 'CERTIFIED', description: 'A Next.js app with the App Router and server components.', supported_locales: ['pt-BR', 'en-US'], supported_generation_modes: ['FULL'], allowed_architectures: ['MODULAR_MONOLITH'], required_fields: [], optional_fields: [], features: [], constraints: [], wizard_profile: {}, template_compatibility: {}, gatekeeper_profile: {} },
  { contractVersion: '1.0', id: 'go.chi', name: 'Go chi', category: 'BACKEND', status: 'EXPERIMENTAL', description: 'A chi router service; never certified in this environment.', supported_locales: ['en-US'], supported_generation_modes: ['FULL'], allowed_architectures: ['LAYERED'], required_fields: [], optional_fields: [], features: [], constraints: [], wizard_profile: {}, template_compatibility: {}, gatekeeper_profile: {} },
];

const INFRA_COMPONENTS = [
  { contractVersion: '1.0', id: 'postgres', category: 'DATABASE', name: 'PostgreSQL', summary: 'Relational store with transactions, JSON and strong reporting.', provider: 'SELF_HOSTED', best_for: ['invoices', 'reporting'], avoid_when: ['append-only telemetry'], tradeoffs: ['needs a migration discipline'], tags: ['sql'] },
  { contractVersion: '1.0', id: 'redis', category: 'CACHE', name: 'Redis', summary: 'In-memory cache and queue for short-lived state.', provider: 'SELF_HOSTED', best_for: ['session cache', 'rate limiting'], avoid_when: ['durable records'], tradeoffs: ['memory bound'], tags: ['cache'] },
];

const TEMPLATE_CATALOG = {
  contractVersion: '1.0',
  categories: ['commerce', 'internal'],
  templates: [
    { contractVersion: '1.0', id: 'tpl_storefront', name: 'Storefront', description: 'Catalogue, cart and invoices with a server-rendered front end.', version: '2.1.0', category: 'commerce', supported_languages: ['python', 'typescript'], supported_frameworks: ['fastapi', 'nextjs'], supported_architectures: ['modular-monolith'], supported_archetypes: [], supported_locales: ['pt-BR', 'en-US'], fallback_locale: 'en-US', capabilities: ['auth', 'billing'], complexity: 'medium', maturity: 'stable', preview_images: [], tags: ['web'], changelog: [] },
    { contractVersion: '1.0', id: 'tpl_backoffice', name: 'Back office', description: 'CRUD screens, roles and an audit trail.', version: '1.4.0', category: 'internal', supported_languages: ['typescript'], supported_frameworks: ['nextjs'], supported_architectures: ['layered'], supported_archetypes: [], supported_locales: ['en-US'], fallback_locale: 'en-US', capabilities: ['auth'], complexity: 'low', maturity: 'experimental', preview_images: [], tags: ['internal'], changelog: [] },
  ],
};

const SKILL_CATALOG = {
  contractVersion: '1.0',
  categories: ['architecture', 'planning'],
  skills: [
    { contractVersion: '1.0', id: 'skill_read_blueprint', name: 'Read the blueprint', description: 'Summarises a blueprint into the decisions it actually fixes.', category: 'architecture', tags: ['blueprint'], requirements: ['an approved blueprint'], examples: [], dependencies: [], metadata: { contractVersion: '1.0', category: 'architecture', maturity: 'stable', execution_mode: 'read_only', safe: true, no_ai: true, no_agents: true, no_external_integrations: true } },
    { contractVersion: '1.0', id: 'skill_plan_work', name: 'Plan the work', description: 'Turns a spec into phases you can schedule.', category: 'planning', tags: ['estimate'], requirements: [], examples: [], dependencies: [], metadata: { contractVersion: '1.0', category: 'planning', maturity: 'foundation', execution_mode: 'manual_assist', safe: true, no_ai: false, no_agents: true, no_external_integrations: true } },
  ],
};

const TEAM_MEMORY_TEAMS = {
  teams: [
    { team_id: 'software-house.backend', proposed: 2, approved: 5 },
    { team_id: 'software-house.frontend', proposed: 0, approved: 3 },
    { team_id: 'data-intelligence.analytics', proposed: 1, approved: 0 },
  ],
};

const TEAM_MEMORY_KNOWLEDGE = {
  team_id: 'software-house.backend',
  knowledge: [
    { id: 'tm_1', team_id: 'software-house.backend', category: 'recurring_error', content: 'Alembic migrations must run before the first request, not inside the app factory.', source: 'retrospective:job_7f3c19d8b204', status: 'approved', version: 2, confidence: 0.88, subject: 'Migration ordering', record_type: 'LESSON', evidence_status: 'VERIFIED', created_at: '2026-08-20T11:00:00Z', updated_at: '2026-09-01T09:00:00Z' },
    { id: 'tm_2', team_id: 'software-house.backend', category: 'pattern', content: 'Repositories return dicts; only the service layer builds response models.', source: 'committee:architecture.blueprint', status: 'approved', version: 1, confidence: 0.76, subject: 'Repository boundary', record_type: 'PATTERN', evidence_status: 'OBSERVED', created_at: '2026-08-28T15:30:00Z', updated_at: '2026-08-28T15:30:00Z' },
  ],
};

const TEAM_MEMORY_QUEUE = {
  team_id: 'software-house.backend',
  queue: [
    { id: 'tm_3', team_id: 'software-house.backend', category: 'frequent_failure', content: 'A generated Dockerfile without a non-root user fails the security gate.', source: 'retrospective:job_9c2e55aa10bf', status: 'proposed', version: 1, confidence: 0.61, subject: 'Container user', record_type: 'LESSON', evidence_status: 'PROPOSED', created_at: '2026-09-14T08:10:00Z', updated_at: '2026-09-14T08:10:00Z' },
  ],
};

const LEARNING_METRICS = {
  scopes: { team_memory: 'org-global', retrospectives: 'owner-scoped' },
  team_memory: {
    per_team: [
      { team_id: 'software-house.backend', proposed: 2, approved: 5, deprecated: 1, approval_rate: 0.833 },
      { team_id: 'software-house.frontend', proposed: 0, approved: 3, deprecated: 0, approval_rate: 1 },
      { team_id: 'data-intelligence.analytics', proposed: 1, approved: 0, deprecated: 0, approval_rate: null },
    ],
    totals: { proposed: 3, approved: 8, deprecated: 1, approval_rate: 0.889 },
  },
  retrospectives: {
    observations: [
      { job_id: 'job_7f3c19d8b204', finished_at: '2026-09-12T18:00:00Z', signals: 14, proposed_lessons: 3, recurring_lessons: 1 },
    ],
    unavailable_count: 1,
    recurring_total: 1,
    note: 'Recorrencia caindo ao longo do tempo e a prova objetiva de aprendizado.',
  },
};

const MARKETPLACE_ITEMS = [
  { id: 'mk_1', author_user_id: 'user_other', kind: 'automation_template', source_automation_id: 'auto_1', name: 'Nightly invoice export', description: 'Exports the invoices of the day to a bucket every night.', license: 'MIT', permissions: ['http_request'], price_cents: 0, version: 3, content: { trigger_type: 'scheduled', trigger_config: {}, action_type: 'http_request', action_config: {} }, content_hash: 'sha256:9ab1', changelog: [], status: 'published', created_at: '2026-07-02T10:00:00Z', updated_at: '2026-09-05T10:00:00Z', category: 'integration', downloads: 34 },
  { id: 'mk_2', author_user_id: USER.user_id, kind: 'automation_template', source_automation_id: 'auto_2', name: 'Stale room reminder', description: 'Pings you when a room has waited a week for an answer.', license: 'MIT', permissions: [], price_cents: 900, version: 1, content: { trigger_type: 'scheduled', trigger_config: {}, action_type: 'http_request', action_config: {} }, content_hash: 'sha256:44c0', changelog: [], status: 'published', created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-01T09:00:00Z', category: 'reminder', downloads: 2 },
];

const MARKETPLACE_INSTALLS = [
  { id: 'inst_1', item_id: 'mk_1', item_version: 2, installed_automation_id: 'auto_9', installed_at: '2026-08-11T12:00:00Z', uninstalled_at: null, current_item_version: 3, update_available: true },
];

const ANALYSIS_SESSIONS = [
  { id: 'as_4d81b6f02e37', status: 'ANALYTICS_RUNNING', currentStep: 8, objectiveText: 'Which regions lost margin after the June price change?', executionMode: 'AI_ASSISTED', archived: false, createdAt: '2026-09-09T10:00:00Z', updatedAt: '2026-09-15T14:02:00Z' },
  { id: 'as_b02f7c1934ae', status: 'WAITING_FOR_APPROVAL', currentStep: 4, objectiveText: 'Are the churn numbers in the weekly report actually comparable?', executionMode: 'DETERMINISTIC_ONLY', archived: false, createdAt: '2026-09-13T08:00:00Z', updatedAt: '2026-09-14T17:40:00Z' },
  { id: 'as_old00000001', status: 'COMPLETED', currentStep: 13, objectiveText: 'Q1 refund analysis', executionMode: 'DETERMINISTIC_ONLY', archived: true, createdAt: '2026-04-01T08:00:00Z', updatedAt: '2026-04-20T09:00:00Z' },
];

const ANALYSIS_SESSION = {
  ...ANALYSIS_SESSIONS[0],
  ownerUserId: USER.user_id,
  workspaceId: 'ws_7a1f30c9e2b4',
  objectiveCategory: 'margin',
  originalDatasetId: 'ds_1',
  attemptCount: 1,
  error: null,
  runningJob: {
    jobId: 'aj_77c1', sessionId: 'as_4d81b6f02e37', operation: 'exploratory-analysis', status: 'RUNNING',
    stage: 'ANALYTICS_RUNNING', progress: 62, startedAt: '2026-09-15T13:58:00Z', updatedAt: '2026-09-15T14:02:00Z',
    elapsedSeconds: 247.4, currentAgent: 'exploratory_analysis_agent', message: 'Computing margin by region for 14 regions.',
    warningCount: 1, blockerCount: 0, recoverable: true, recommendedAction: 'Nothing to do: the run reports progress and will finish or fail on its own.',
  },
  steps: [
    { stepIndex: 1, id: 'profile', label: 'Profile the dataset', agent: 'profiling_agent', status: 'COMPLETED', inputSummary: null, outputSummary: '38 columns, 412k rows, 3 with missing values above 5%.', progressPercent: 100, elapsedSeconds: 88, evidence: ['quality_report'], artifacts: ['classification', 'quality_report'], alerts: [], pendingDecisions: [], nextActions: [] },
    { stepIndex: 2, id: 'cleaning-plan', label: 'Plan the cleaning', agent: 'cleaning_agent', status: 'COMPLETED', inputSummary: null, outputSummary: '6 actions proposed, 2 needing a decision.', progressPercent: 100, elapsedSeconds: 41, evidence: [], artifacts: ['cleaning_plan'], alerts: [], pendingDecisions: [], nextActions: [] },
    { stepIndex: 3, id: 'execute-cleaning', label: 'Clean', agent: 'cleaning_agent', status: 'COMPLETED', inputSummary: null, outputSummary: 'Wrote dataset v2.', progressPercent: 100, elapsedSeconds: 130, evidence: [], artifacts: ['execution_report'], alerts: [], pendingDecisions: [], nextActions: [] },
    { stepIndex: 4, id: 'data-model', label: 'Model the data', agent: 'modeling_agent', status: 'COMPLETED', inputSummary: null, outputSummary: 'One fact table, four dimensions.', progressPercent: 100, elapsedSeconds: 60, evidence: [], artifacts: ['data_model'], alerts: [], pendingDecisions: [], nextActions: [] },
    { stepIndex: 5, id: 'analytics-plan', label: 'Plan the analysis', agent: 'analytics_planning_agent', status: 'COMPLETED', inputSummary: null, outputSummary: 'Three questions the data can answer, one it cannot.', progressPercent: 100, elapsedSeconds: 52, evidence: [], artifacts: ['analytics_plan'], alerts: ['One question needs a cost column the data does not carry.'], pendingDecisions: [], nextActions: [] },
    { stepIndex: 6, id: 'exploratory-analysis', label: 'Run the analysis', agent: 'exploratory_analysis_agent', status: 'RUNNING', inputSummary: 'dataset v2', outputSummary: null, progressPercent: 62, elapsedSeconds: 247, evidence: [], artifacts: [], alerts: [], pendingDecisions: [], nextActions: [] },
    { stepIndex: 7, id: 'statistical-validation', label: 'Validate statistically', agent: null, status: 'NOT_RUN', inputSummary: null, outputSummary: null, progressPercent: null, elapsedSeconds: null, evidence: [], artifacts: [], alerts: [], pendingDecisions: [], nextActions: [] },
  ],
};

const ANALYSIS_DATASETS = [
  { id: 'ds_1', sessionId: 'as_4d81b6f02e37', version: 1, isOriginal: true, storageRef: 'sessions/as_4d81b6f02e37/v1.csv', originalFilename: 'sales_2026.csv', sourceFormat: 'csv', bytesSize: 48210944, rowCountEstimate: 412000, producedByAgent: null, createdAt: '2026-09-09T10:04:00Z' },
  { id: 'ds_2', sessionId: 'as_4d81b6f02e37', version: 2, isOriginal: false, storageRef: 'sessions/as_4d81b6f02e37/v2.parquet', originalFilename: null, sourceFormat: 'parquet', bytesSize: 19238400, rowCountEstimate: 408912, producedByAgent: 'cleaning_agent', createdAt: '2026-09-10T11:22:00Z' },
];

const ANALYSIS_AGENTS = [
  { id: 'ae_1', sessionId: 'as_4d81b6f02e37', agentId: 'profiling_agent', stage: 'DATA_PROFILING', status: 'COMPLETED_DETERMINISTICALLY', attempt: 1, executionMode: 'DETERMINISTIC_ONLY', usedAI: false, provider: null },
  { id: 'ae_2', sessionId: 'as_4d81b6f02e37', agentId: 'cleaning_agent', stage: 'DATA_CLEANING', status: 'COMPLETED_BY_AI', attempt: 2, executionMode: 'AI_ASSISTED', usedAI: true, provider: 'deepseek' },
  { id: 'ae_3', sessionId: 'as_4d81b6f02e37', agentId: 'exploratory_analysis_agent', stage: 'ANALYTICS_RUNNING', status: 'RUNNING', attempt: 1, executionMode: 'AI_ASSISTED', usedAI: true, provider: 'deepseek' },
];

const ANALYSIS_GOVERNANCE = [
  { id: 'gf_1', sessionId: 'as_4d81b6f02e37', datasetId: 'ds_1', columnName: 'customer_email', piiType: 'EMAIL', actionTaken: 'hashed', createdAt: '2026-09-09T10:08:00Z' },
  { id: 'gf_2', sessionId: 'as_4d81b6f02e37', datasetId: 'ds_1', columnName: 'buyer_document', piiType: 'NATIONAL_ID', actionTaken: 'dropped', createdAt: '2026-09-09T10:08:00Z' },
];

const SOURCE_TYPES = [
  { sourceType: 'csv', status: 'IMPLEMENTED', note: 'Leitura completa com deteccao de encoding e delimitador.' },
  { sourceType: 'xlsx', status: 'PARTIAL', note: 'Primeira planilha apenas; formulas nao sao avaliadas.' },
  { sourceType: 'postgres', status: 'PLANNED', note: 'Sem conector; nada e lido de banco ainda.' },
  { sourceType: 'api', status: 'UNSUPPORTED', note: 'Nao ha ingestao por API nesta versao.' },
];

const MONITORING_RULES = [
  { id: 'mr_1', sessionId: 'as_4d81b6f02e37', metric: 'gross_margin_pct', threshold: { deviation_percent: 5 }, schedule: '0 6 * * *', status: 'active', lastRunAt: '2026-09-15T06:00:00Z', lastCheckedDatasetVersion: 2, createdAt: '2026-09-11T09:00:00Z' },
  { id: 'mr_2', sessionId: 'as_4d81b6f02e37', metric: 'refund_rate', threshold: { deviation_percent: 10 }, schedule: '0 6 * * 1', status: 'paused', lastRunAt: null, lastCheckedDatasetVersion: null, createdAt: '2026-09-12T09:00:00Z' },
];

const MONITORING_CHECKS = [
  { id: 'mc_1', ruleId: 'mr_1', datasetVersion: 2, observedValue: 31.2, baselineValue: 34.8, deviationPercent: -10.3, status: 'breach', createdAt: '2026-09-15T06:00:00Z' },
  { id: 'mc_2', ruleId: 'mr_1', datasetVersion: 2, observedValue: 34.1, baselineValue: 34.8, deviationPercent: -2, status: 'ok', createdAt: '2026-09-14T06:00:00Z' },
  { id: 'mc_3', ruleId: 'mr_1', datasetVersion: 2, observedValue: null, baselineValue: 34.8, deviationPercent: null, status: 'no_new_data', createdAt: '2026-09-13T06:00:00Z' },
];

const AUTOMATIONS = [
  { id: 'auto_1', workspace_id: 'ws_7a1f30c9e2b4', title: 'Nightly margin export', description: 'Posts yesterday margin to the finance webhook.', trigger_type: 'scheduled', trigger_config: { cron: '0 5 * * *', timezone: 'America/Sao_Paulo' }, next_run_at: '2026-09-17T08:00:00Z', action_type: 'http_request', action_config: { method: 'POST', url: 'https://finance.internal/hooks/margin', headers: {}, body: null }, status: 'active', created_at: '2026-08-02T10:00:00Z', updated_at: '2026-09-15T05:00:00Z' },
  { id: 'auto_2', workspace_id: 'ws_7a1f30c9e2b4', title: 'Stale room reminder', description: '', trigger_type: 'manual', trigger_config: { cron: null, timezone: 'UTC' }, next_run_at: null, action_type: 'http_request', action_config: { method: 'GET', url: 'https://hooks.internal/remind', headers: {}, body: null }, status: 'paused', created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-01T09:00:00Z' },
];

const AUTOMATION_RUNS = [
  { id: 'run_1', automation_id: 'auto_1', trigger_source: 'scheduled', status: 'succeeded', started_at: '2026-09-15T05:00:00Z', finished_at: '2026-09-15T05:00:02Z', duration_ms: 1840, masked_request: null, response_status_code: 200, masked_response: null, error: null, retry_count: 0 },
  { id: 'run_2', automation_id: 'auto_1', trigger_source: 'scheduled', status: 'failed', started_at: '2026-09-14T05:00:00Z', finished_at: '2026-09-14T05:00:31Z', duration_ms: 30120, masked_request: null, response_status_code: 504, masked_response: null, error: 'The endpoint did not answer within 30 s.', retry_count: 2 },
];

const MISSION_INSTANCE = {
  mission_id: 'msn_2a7c91e4f0b8',
  workspace_id: 'ws_7a1f30c9e2b4',
  mission_type: 'software.build',
  title: 'Invoicing for the storefront',
  status: 'ACTIVE',
  mode: 'guided',
  linked_project_room_id: 'room_5b9e2c71a0d4',
  raw_intent: 'We need the store to issue invoices and let the customer download them.',
  locale: 'en-US',
  degraded: false,
  current_step_id: 'rules',
  steps: [
    { id: 'scope', title: 'What is in scope', description: 'What the invoicing covers, and what it deliberately does not.' },
    { id: 'rules', title: 'The rules that must hold', description: 'Tax, numbering and the cases where an invoice may be reissued.' },
    { id: 'delivery', title: 'How it reaches the customer', description: 'Download, e-mail, or both, and who may see an invoice.' },
  ],
  step_notes: [
    { step_id: 'rules', key_points: ['Invoice numbers are sequential per year and never reused.'], open_questions: ['Can an invoice be reissued after a refund, or is a credit note required?'], decisions_suggested: [] },
  ],
  messages: [],
  decisions: [
    { id: 'd_1', step_id: 'scope', field_id: null, value: 'Invoices cover product sales only; shipping is a separate line, not a separate document.', source: 'user', reason: 'Finance asked for one document per order.', created_at: '2026-09-14T10:12:00Z' },
    { id: 'd_2', step_id: 'scope', field_id: null, value: 'No invoice is issued for a cancelled order.', source: 'ai_modified', reason: 'The suggestion said \'no document at all\'; changed to keep the cancellation record.', created_at: '2026-09-14T10:18:00Z' },
  ],
  gaps: [
    { id: 'g_1', severity: 'high', category: 'requirements', title: 'No tax rule was given for foreign customers', description: 'The invoice template cannot be finished without knowing whether foreign sales are taxed here.', suggested_action: 'Ask finance which rule applies', auto_detected: true, dismissed: false },
  ],
  artifacts: [],
  history: [],
  operational_log: [],
  last_failure: null,
  created_at: '2026-09-14T09:40:00Z',
  updated_at: '2026-09-15T11:02:00Z',
};

const MISSION_JOB = {
  id: 'mdj_88f1',
  mission_id: 'msn_2a7c91e4f0b8',
  status: 'DRAFTING',
  error: null,
  artifacts_progress: [
    { type: 'requirements', title: 'Requirements', status: 'ready', provider: 'deepseek', model: 'deepseek-chat', input_tokens: 4200, output_tokens: 1800, started_at: '2026-09-15T10:58:00Z', finished_at: '2026-09-15T10:59:20Z' },
    { type: 'acceptance_criteria', title: 'Acceptance criteria', status: 'drafting', provider: null, model: null, input_tokens: 0, output_tokens: 0, started_at: '2026-09-15T10:59:20Z', finished_at: null },
    { type: 'risks', title: 'Risks', status: 'pending', provider: null, model: null, input_tokens: 0, output_tokens: 0, started_at: null, finished_at: null },
  ],
  degraded: false,
  requested_model: 'deepseek-chat',
  retry_count: 0,
  created_at: '2026-09-15T10:57:00Z',
  updated_at: '2026-09-15T11:02:00Z',
  completed_at: null,
};

const MISSION_HANDOFF = {
  handoff_id: 'mh_31ac',
  mission_id: 'msn_2a7c91e4f0b8',
  project_room_id: 'room_5b9e2c71a0d4',
  room_status: 'META_FACTORY_RUNNING',
  engineering_approved: true,
  stack_approved: false,
  generation_job_id: null,
  next_route: '/project-rooms/room_5b9e2c71a0d4',
};

const PREVIEWS = {
  items: [{ id: 'evt_1', category: 'preview', action: 'started', status: 'success', project_id: 'nova-commerce_3f9a1c2b7d4e', occurred_at: '2026-09-15T19:10:00Z', metadata: {} }],
  next_cursor: null,
  has_more: false,
};

const BRIEFING = {
  scope: 'project', project_id: 'room_5b9e2c71a0d4', state: 'Generating', headline: 'assistant.headline.project', memory_count: 6,
  readings: [
    { label: 'assistant.label.status', value: 'META_FACTORY_RUNNING', source: 'room_status' },
    { label: 'assistant.label.state', value: 'Generating', source: 'abstract_state' },
  ],
  next_move: { action: '', reason: 'assistant.next.unknown_state', href: '', blocked_by: 'META_FACTORY_RUNNING' },
};

const REGISTRY = [
  { id: 'software.build', category: 'create', title: 'Criar software', specialists: ['software_architect'] },
  { id: 'error.diagnose', category: 'fix', title: 'Diagnosticar erro', specialists: ['backend_engineer'] },
];

const GLOSSARY = [
  { id: 'promptmaster-md', term: 'PromptMaster.md', definition: 'Descrição estruturada da intenção, escopo, regras e critérios do usuário.', aliases: ['PromptMaster'] },
  { id: 'blueprint', term: 'Blueprint', definition: 'Especificação técnica e estrutural que orienta planejamento e geração.', aliases: [] },
];

export interface MockOptions {
  /** Whether the refresh cookie opens a session. */
  readonly signedIn?: boolean;
  /** Status the login endpoint answers with (401 is the backend's generic failure). */
  readonly loginStatus?: number;
  /**
   * Answer every read with its real shape but every collection emptied: a real account on its first day.
   * Scalars and ids are left alone, so a screen still knows what it is about -- there is simply nothing in it.
   */
  readonly emptyEveryList?: boolean;
  /**
   * Answer 500 to every read except the session itself. The session stays alive on purpose: a signed-out
   * app would just redirect, and what this mode exists to prove is that a SIGNED-IN screen whose reads all
   * failed still renders, and says so, instead of drawing a verdict it never received.
   */
  readonly failEveryRead?: boolean;
}

export async function mockApi(page: Page, options: MockOptions = {}): Promise<void> {
  /** Every array becomes empty, at any depth; everything else is left exactly as it was. */
  const emptied = (value: unknown): unknown => {
    if (Array.isArray(value)) return [];
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, emptied(item)]));
    }
    return value;
  };

  const json = (route: Route, body: unknown, status = 200) => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(options.emptyEveryList && status < 400 && !route.request().url().includes('/api/auth/') ? emptied(body) : body),
  });

  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();

    if (options.failEveryRead && pathname !== '/api/auth/refresh' && pathname !== '/api/auth/me') {
      return json(route, { detail: 'The backend is unavailable.' }, 500);
    }

    if (pathname === '/api/auth/refresh') {
      return options.signedIn ? json(route, { user: USER, tokens: TOKENS }) : json(route, { detail: 'Session expired' }, 401);
    }
    if (pathname === '/api/auth/policy') return json(route, { version: '2026-06-15' });
    if (pathname === '/api/auth/login') {
      const status = options.loginStatus ?? 200;
      return status === 200 ? json(route, { user: USER, tokens: TOKENS }) : json(route, { detail: 'Email or password is incorrect' }, status);
    }
    if (pathname === '/api/auth/register') return json(route, { detail: 'auth.email_taken' }, 409);
    if (pathname === '/api/auth/logout') return route.fulfill({ status: 204, body: '' });
    if (pathname === '/api/workspaces') return json(route, WORKSPACES);
    if (pathname === '/api/system-status') return json(route, SYSTEM_STATUS);
    if (pathname === '/api/ai-status') return json(route, AI_STATUS);
    if (pathname === '/api/observability/decisions') return json(route, TRACES);
    if (pathname === '/api/runtime/config') return json(route, RUNTIME_CONFIG);
    if (pathname === '/api/roadmap') return json(route, ROADMAP);
    if (pathname === '/api/billing/plans') return json(route, PLANS);
    if (pathname === '/api/organizations') return json(route, ORGANIZATIONS);
    if (pathname === '/api/missions' && method === 'POST') return json(route, MISSION_INSTANCE, 201);
    if (/^\/api\/missions\/[^/]+\/deliverables\/jobs\/latest$/.test(pathname)) return json(route, MISSION_JOB);
    if (/^\/api\/missions\/[^/]+\/deliverables\/jobs\/[^/]+\/(retry|cancel)$/.test(pathname) && method === 'POST') return json(route, MISSION_JOB);
    if (/^\/api\/missions\/[^/]+\/execution-handoff$/.test(pathname)) return json(route, MISSION_HANDOFF);
    if (/^\/api\/missions\/(?!registry$)[^/]+$/.test(pathname)) return json(route, MISSION_INSTANCE);
    if (pathname === '/api/project-rooms' && method === 'POST') return json(route, ROOM_DETAIL, 201);
    if (pathname === '/api/project-rooms') return json(route, ROOMS);
    if (pathname === '/api/data-intelligence/sessions') return json(route, ANALYSIS_SESSIONS);
    if (pathname === '/api/data-intelligence/source-types') return json(route, SOURCE_TYPES);
    if (pathname === '/api/data-intelligence/monitoring-rules') return json(route, MONITORING_RULES);
    if (/^\/api\/data-intelligence\/monitoring-rules\/[^/]+\/checks$/.test(pathname)) return json(route, MONITORING_CHECKS);
    if (/^\/api\/data-intelligence\/sessions\/[^/]+\/datasets$/.test(pathname)) return json(route, ANALYSIS_DATASETS);
    if (/^\/api\/data-intelligence\/sessions\/[^/]+\/agent-executions$/.test(pathname)) return json(route, ANALYSIS_AGENTS);
    if (/^\/api\/data-intelligence\/sessions\/[^/]+\/governance-flags$/.test(pathname)) return json(route, ANALYSIS_GOVERNANCE);
    if (/^\/api\/data-intelligence\/sessions\/[^/]+$/.test(pathname)) return json(route, ANALYSIS_SESSION);
    if (pathname === '/api/automations') return json(route, AUTOMATIONS);
    if (/^\/api\/automations\/[^/]+\/runs$/.test(pathname)) return json(route, AUTOMATION_RUNS);
    if (pathname === '/api/registry/languages') return json(route, REGISTRY_LANGUAGES);
    if (pathname === '/api/registry/stacks') return json(route, REGISTRY_STACKS);
    if (pathname === '/api/infrastructure/components') return json(route, INFRA_COMPONENTS);
    if (pathname === '/api/templates/catalog') return json(route, TEMPLATE_CATALOG);
    if (pathname === '/api/skills') return json(route, SKILL_CATALOG);
    if (pathname === '/api/team-memory/teams') return json(route, TEAM_MEMORY_TEAMS);
    if (pathname === '/api/team-memory/metrics') return json(route, LEARNING_METRICS);
    if (/^\/api\/team-memory\/[^/]+\/knowledge$/.test(pathname)) return json(route, TEAM_MEMORY_KNOWLEDGE);
    if (/^\/api\/team-memory\/[^/]+\/queue$/.test(pathname)) return json(route, TEAM_MEMORY_QUEUE);
    if (pathname === '/api/marketplace/items') return json(route, MARKETPLACE_ITEMS);
    if (pathname === '/api/marketplace/items/mine') return json(route, MARKETPLACE_ITEMS.filter((item) => item.author_user_id === USER.user_id));
    if (pathname === '/api/marketplace/installs/mine') return json(route, MARKETPLACE_INSTALLS);
    if (/^\/api\/project-rooms\/[^/]+\/memories$/.test(pathname)) return json(route, MEMORIES);
    if (/^\/api\/project-rooms\/[^/]+\/evolution-insight$/.test(pathname)) return json(route, EVOLUTION_INSIGHT);
    if (/^\/api\/project-rooms\/[^/]+\/work-estimate$/.test(pathname)) return json(route, WORK_ESTIMATE);
    if (/^\/api\/project-rooms\/[^/]+\/(message|generate-prompt|revise-prompt|approve|blueprint|stack\/approve|engineering-review|send-to-generator)$/.test(pathname) && method === 'POST') {
      return json(route, { ...ROOM_DETAIL, status: 'PROMPT_APPROVED' });
    }
    if (/^\/api\/project-rooms\/[^/]+\/engineering-review\/repair$/.test(pathname) && method === 'POST') return json(route, ROOM_DETAIL);
    if (/^\/api\/project-rooms\/[^/]+\/blueprints\/[0-9]+\/restore$/.test(pathname) && method === 'POST') return json(route, ROOM_DETAIL);
    if (/^\/api\/project-rooms\/[^/]+\/abstract-state$/.test(pathname)) {
      return json(route, { abstract_state: 'GENERATING', room_status: 'META_FACTORY_RUNNING' });
    }
    if (/^\/api\/project-rooms\/[^/]+$/.test(pathname)) {
      const roomId = pathname.split('/').pop() as string;
      const known = ROOMS.find((room) => room.room_id === roomId);
      return known ? json(route, { ...ROOM_DETAIL, room_id: known.room_id, title: known.title, status: known.status })
        : json(route, { detail: 'room not found' }, 404);
    }
    if (/\/engineering-kernel$/.test(pathname)) return json(route, KERNEL);
    if (/\/quality-report$/.test(pathname)) return json(route, QUALITY);
    if (/^\/api\/companies\/by-job\/[^/]+\/chief$/.test(pathname)) return json(route, CHIEF);
    if (/^\/api\/companies\/by-job\/[^/]+\/agents\/[^/]+$/.test(pathname)) {
      const id = pathname.split('/').pop();
      return id === AGENT.instance_id ? json(route, AGENT) : json(route, { detail: 'agent not found' }, 404);
    }
    if (/^\/api\/companies\/by-job\/[^/]+\/assignments$/.test(pathname)) return json(route, ASSIGNMENTS);
    if (/^\/api\/companies\/by-job\/[^/]+\/jobs$/.test(pathname)) return json(route, COMPANY_JOBS);
    if (/^\/api\/companies\/by-job\/[^/]+\/executions$/.test(pathname)) return json(route, EXECUTIONS);
    if (/^\/api\/companies\/by-job\/[^/]+\/expansions$/.test(pathname)) return json(route, EXPANSIONS);
    if (/^\/api\/companies\/by-job\/[^/]+\/plan$/.test(pathname)) return json(route, PLAN_VIEW);
    if (/^\/api\/companies\/by-job\/[^/]+$/.test(pathname)) {
      const id = pathname.split('/').pop();
      return id === COMPANY.job_id ? json(route, COMPANY) : json(route, null);
    }
    if (pathname === '/api/companies/roles') return json(route, ROLE_MAP);
    if (pathname === '/api/companies/certifications') return json(route, CERTIFICATIONS);
    if (pathname === '/api/workforce/compositions') return json(route, COMPOSITIONS);
    if (pathname === '/api/workforce/cognitive-certifications') return json(route, COGNITIVE);
    if (pathname === '/api/workforce/languages') return json(route, LANGUAGE_PACKS);
    if (pathname === '/api/workforce/plan' && method === 'POST') return json(route, PLAN);
    if (pathname === '/api/test-room/profiles') return json(route, TEST_ROOM_PROFILES);
    if (pathname === '/api/registry/stack-certifications') return json(route, STACK_CERTIFICATIONS);
    if (/^\/api\/test-room\/[^/]+\/proof$/.test(pathname)) return json(route, TEST_PROOF);
    if (pathname === '/api/downloads') return json(route, DOWNLOADS);
    if (/\/prepare-download$/.test(pathname) && method === 'POST') return json(route, PREPARED);
    if (/^\/api\/meta-factory\/[^/]+\/download$/.test(pathname)) {
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/zip' }, body: 'PK\u0003\u0004 fixture' });
    }
    if (/^\/api\/meta-factory\/[^/]+\/export\/(github|gitlab)$/.test(pathname) && method === 'POST') return json(route, EXPORTED);
    if (/\/(validate|revalidate|repair|repair\/llm|force-release)$/.test(pathname) && method === 'POST') {
      return json(route, { ...QUALITY, release_override: pathname.endsWith('force-release') });
    }
    if (/\/acknowledge-human-review$/.test(pathname) && method === 'POST') return json(route, { ...KERNEL, human_review_acknowledged: true });
    if (/^\/api\/meta-factory\/[^/]+\/delivery$/.test(pathname)) return json(route, DELIVERY);
    if (/^\/api\/meta-factory\/jobs\/[^/]+\/archive$/.test(pathname) && method === 'PATCH') {
      const jobId = pathname.split('/')[4];
      const job = JOBS.find((entry) => entry.id === jobId);
      return json(route, { ...job, archived: !job?.archived });
    }
    if (/^\/api\/meta-factory\/jobs\/[^/]+$/.test(pathname) && method === 'DELETE') return route.fulfill({ status: 204, body: '' });
    if (pathname === '/api/meta-factory/jobs') return json(route, JOBS);
    if (/^\/api\/meta-factory\/jobs\/[^/]+\/events$/.test(pathname)) {
      const id = pathname.split('/')[4];
      if (!JOBS_BY_ID[id]) return json(route, { detail: 'job not found' }, 404);
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, body: id === JOB_DETAIL.id ? STREAM_BODY : '' });
    }
    if (/^\/api\/meta-factory\/jobs\/[^/]+\/diagnostic$/.test(pathname)) return json(route, { job: JOB_DETAIL.id, events: STREAM_EVENTS });
    if (/^\/api\/meta-factory\/jobs\/[^/]+\/(pause|resume|approve-repair|continue|continue-after-build-skip)$/.test(pathname) && method === 'POST') {
      return json(route, JOB_DETAIL);
    }
    if (/^\/api\/meta-factory\/jobs\/[^/]+\/stages\/[^/]+\/retry$/.test(pathname) && method === 'POST') return json(route, JOB_DETAIL, 202);
    if (/^\/api\/meta-factory\/jobs\/[^/]+$/.test(pathname) && method === 'GET') {
      const known = JOBS_BY_ID[String(pathname.split('/').pop())];
      return known ? json(route, known) : json(route, { detail: 'job not found' }, 404);
    }
    if (pathname === '/api/projects') return json(route, []);
    if (pathname === '/api/change-requests') return json(route, CHANGES);
    if (/\/engineering-lab\/projects\/[^/]+\/overview$/.test(pathname)) return json(route, LAB);
    if (/\/engineering-lab\/projects\/[^/]+\/terminal$/.test(pathname) && method === 'POST') {
      const sent = JSON.parse(route.request().postData() ?? '{}') as { command?: string };
      const allowed = ['ls', 'pwd', 'cat', 'pytest', 'npm'].some((entry) => (sent.command ?? '').startsWith(entry));
      return json(route, { ...TERMINAL, command: sent.command ?? 'ls', allowed_command: allowed, exit_code: allowed ? 0 : 126,
        output: allowed ? TERMINAL.output : [{ kind: 'stderr', text: 'command not allowed by the sandbox policy' }] });
    }
    if (/^\/api\/change-requests\/[^/]+\/diff$/.test(pathname)) return json(route, CHANGE_DIFF);
    if (/^\/api\/change-requests\/[^/]+\/(analyze|plan|approve|apply|accept|reject|rollback)$/.test(pathname) && method === 'POST') {
      return json(route, { ...CHANGE_DETAIL, status: 'Planned' });
    }
    if (/^\/api\/change-requests\/[^/]+$/.test(pathname) && method === 'GET') {
      const id = pathname.split('/').pop();
      return id === CHANGE_DETAIL.change_request_id ? json(route, CHANGE_DETAIL) : json(route, { detail: 'not found' }, 404);
    }
    if (/^\/api\/test-room\/[^/]+\/profile$/.test(pathname)) return json(route, TEST_PROFILE);
    if (/^\/api\/test-room\/[^/]+\/sessions$/.test(pathname)) return json(route, TEST_SESSIONS);
    if (/^\/api\/test-room\/[^/]+\/run$/.test(pathname) && method === 'POST') return json(route, TEST_RUN);
    if (/^\/api\/live-preview\/by-project\/[^/]+$/.test(pathname)) return json(route, PREVIEW);
    if (pathname === '/api/live-preview/start' && method === 'POST') return json(route, PREVIEW);
    if (/^\/api\/live-preview\/[^/]+\/console$/.test(pathname)) return json(route, PREVIEW_CONSOLE);
    if (/^\/api\/live-preview\/[^/]+\/stop$/.test(pathname) && method === 'POST') return route.fulfill({ status: 204, body: '' });
    if (pathname === '/api/modernize/projects/latest') return json(route, MODERNIZE);
    if (pathname === '/api/execution/policy-exceptions') return json(route, POLICY_EXCEPTIONS);
    if (/^\/api\/integrations\/git\/(github|gitlab)$/.test(pathname)) {
      return json(route, GIT_CONNECTIONS[String(pathname.split('/').pop())]);
    }
    if (pathname === '/api/notifications/read-all') return json(route, { updated: NOTIFICATIONS.unread_count });
    if (pathname === '/api/notifications') return json(route, NOTIFICATIONS);
    if (pathname === '/api/system/presence/decisions') return json(route, PRESENCE);
    if (pathname === '/api/llm/settings/active') return json(route, LLM_ACTIVE);
    if (pathname === '/api/llm/usage/stats') return json(route, LLM_USAGE);
    if (pathname === '/api/user-ai-keys' && method === 'GET') return json(route, AI_KEYS);
    if (pathname === '/api/user-ai-keys' && method === 'POST') return json(route, AI_KEYS.keys[0], 201);
    if (/^\/api\/user-ai-keys\/[^/]+\/test$/.test(pathname) && method === 'POST') {
      return json(route, { ok: true, provider: 'deepseek', model: 'deepseek-chat', http_status: 200, message: 'The provider answered in 420 ms.', latency_ms: 420, validated_at: '2026-09-16T09:10:00Z' });
    }
    if (/^\/api\/user-ai-keys\/[^/]+\/set-default$/.test(pathname) && method === 'POST') return json(route, { ...AI_KEYS.keys[1], is_default: true });
    if (/^\/api\/user-ai-keys\/[^/]+$/.test(pathname) && method === 'DELETE') return route.fulfill({ status: 204, body: '' });
    if (pathname === '/api/llm/usage/by-model') return json(route, USAGE_BY_MODEL);
    if (pathname === '/api/billing/trial') return json(route, TRIAL);
    if (pathname === '/api/billing/subscription') return json(route, SUBSCRIPTION);
    if (pathname === '/api/billing/usage') return json(route, BILLING_USAGE);
    if (pathname === '/api/billing/entitlements') return json(route, ENTITLEMENTS);
    if (pathname === '/api/auth/me/sessions' && method === 'GET') return json(route, SESSIONS);
    if (/^\/api\/auth\/me\/sessions/.test(pathname) && method === 'DELETE') return route.fulfill({ status: 204, body: '' });
    if (pathname === '/api/auth/me/2fa/enroll' && method === 'POST') return json(route, { secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: 'otpauth://totp/LDCN?secret=JBSWY3DPEHPK3PXP' });
    if (pathname === '/api/auth/me/2fa/verify' && method === 'POST') return json(route, { ...USER, is_2fa_enabled: true });
    if (pathname === '/api/auth/me/export') return json(route, { contractVersion: '1.0', exported_at: '2026-09-16T09:10:00Z', user: USER, projects: [], audit_events: [] });
    if (pathname === '/api/auth/me' && method === 'PATCH') return json(route, USER);
    if (/^\/api\/workspaces\/[^/]+\/members$/.test(pathname)) return json(route, MEMBERS);
    if (/^\/api\/integrations\/git\/(github|gitlab)\/(connect|validate)$/.test(pathname) && method === 'POST') {
      return json(route, GIT_CONNECTIONS[String(pathname.split('/')[4])]);
    }
    if (pathname === '/api/activity-feed') return json(route, PREVIEWS);
    if (pathname === '/api/missions/registry') return json(route, REGISTRY);
    if (pathname === '/api/ldcn/briefing') return json(route, BRIEFING);
    if (pathname === '/api/language-model/glossary') return json(route, GLOSSARY);
    if (pathname.startsWith('/api/users/me/preferences/')) {
      if (method === 'PUT') {
        const sent = JSON.parse(route.request().postData() ?? '{}') as { data?: Record<string, unknown> };
        return json(route, { data: sent.data ?? {} });
      }
      return json(route, { data: {} });
    }
    return json(route, { detail: `not mocked: ${pathname}` }, 404);
  });
}

/** The tests assert English copy; the app defaults to pt-BR. */
export async function useEnglish(page: Page): Promise<void> {
  await page.context().addCookies([{ name: 'ldcn_next_locale', value: 'en-US', domain: '127.0.0.1', path: '/' }]);
}

/** Endpoints and raw payloads are developer details: hidden until a person turns them on (V2). */
export async function showDeveloperDetails(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { localStorage.setItem('ldcn-next-dev', 'on'); } catch { /* storage blocked: the test will show it */ }
  });
}
