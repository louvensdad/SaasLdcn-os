import { API_BASE_URL } from '@/lib/api/endpoints';
import {
  downloadAuthenticated,
  getAccessToken,
  refreshAccessToken,
} from '@/lib/api/client';
import type { GenerationValidationReport } from '@contracts/generation-validation.contract';
import type { GenerationExecutionEvent, GenerationJobSummary, ResilientGenerationJob } from '@contracts/generation-job.contract';
import type { TerminalCommandRecord, TerminalHistoryResponse, TerminalStreamEvent } from '@contracts/execution-terminal.contract';
import type { DeliveryDecision, DeliveryMode } from '@contracts/delivery.contract';

export const TERMINAL_JOB_STATUSES = new Set(['READY', 'FAILED', 'PAUSED', 'NEEDS_USER_ACTION', 'STALLED']);

// Self-contained client for the meta-factory feature. It does NOT reuse the
// global apiRequest because that has a 5s timeout — the generate call runs 6 LLM
// agents and can take minutes.

export interface SuggestedStack {
  language: string;
  runtime: string;
  framework: string;
  language_reason: string;
  framework_reason: string;
  architecture: string;
  architecture_reason: string;
}

export interface Assumption {
  field: string;
  assumed_value: string;
  reason: string;
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  why_it_matters: string;
  default_if_skipped: string;
}

export interface ProjectSpec {
  raw_intent: string;
  product_summary: string;
  target_users: string[];
  business_rules: string[];
  entities: string[];
  core_workflows: string[];
  non_functional: Record<string, string>;
  suggested_stack: SuggestedStack;
  locale: string;
  assumptions: Assumption[];
  open_questions: ClarifyingQuestion[];
  confidence: number;
}

export interface OrchestrateResponse {
  stage: string;
  spec: ProjectSpec;
  open_questions: ClarifyingQuestion[];
  degraded: boolean;
}

export type FactoryEvent =
  | { type: 'agent_started'; role: string }
  | { type: 'heartbeat'; role: string; elapsed_ms: number }
  | { type: 'file_emitted'; role: string; path: string; language: string }
  | { type: 'gate_check'; role: string; check: string; status: 'passed' | 'failed'; detail: string }
  | {
      type: 'agent_finished';
      role: string;
      model: string;
      stopped_by: string;
      degraded: boolean;
      file_count: number;
      errors: string[];
      warnings?: string[];
    }
  | { type: 'written'; project_id: string; root_path: string; file_count: number }
  | { type: 'validation_report'; report: GenerationValidationReport }
  | {
      type: 'stage_done';
      role: string;
      file_count: number;
      errors: string[];
      warnings: string[];
      degraded: boolean;
      model: string;
      project_id?: string | null;
    }
  | { type: 'done'; ok: boolean; degraded: boolean; errors: string[] }
  | { type: 'verify_started'; project_id: string }
  | { type: 'repair_started'; round: number; issues: string[] }
  | { type: 'repair_finished'; round: number; applied: number; detail?: string }
  | { type: 'verify_done'; passed: boolean; score: number; report: GenerationValidationReport | null }
  | { type: 'error'; detail: string };

export interface DeepStage {
  id: string;
  title: string;
  summary: string;
  details: string[];
  metrics: Record<string, number>;
  status: 'passed' | 'attention';
}

export interface DeepDecision {
  decision: string;
  rationale: string;
  alternatives: string[];
  trade_offs: string;
}

export interface DeepEngineeringAnalysis {
  title: string;
  product_summary: string;
  entity_count: number;
  endpoint_count: number;
  workflow_count: number;
  rule_count: number;
  component_count: number;
  complexity: string;
  risk_level: 'low' | 'medium' | 'high';
  effort_estimate: string;
  confidence: number;
  decisions: DeepDecision[];
  stages: DeepStage[];
  security_considerations: string[];
  validation_criteria: string[];
}

export type DeepEvent =
  | { type: 'deep_stage_started'; index: number; total: number; id: string; title: string }
  | { type: 'deep_stage_completed'; index: number; total: number; stage: DeepStage }
  | { type: 'deep_analysis'; analysis: DeepEngineeringAnalysis }
  | { type: 'done' };

export interface AgentRunSummary {
  role: string;
  model: string;
  file_count: number;
  stopped_by: string;
  errors: string[];
}

export interface UsageByModel {
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  job_count: number;
}

export interface GenerationUsageSummary {
  period_days: number;
  since: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  job_count: number;
  by_model: UsageByModel[];
}

export interface GenerateResponse {
  ok: boolean;
  project_id: string | null;
  root_path: string | null;
  file_count: number;
  written: boolean;
  runs: AgentRunSummary[];
  errors: string[];
  degraded: boolean;
  validation_report?: GenerationValidationReport | null;
}

export interface GeneratedFile {
  relative_path: string;
  size_bytes: number;
  extension: string | null;
  preview_supported: boolean;
}

export interface GeneratedFilesResponse {
  files: GeneratedFile[];
  file_count: number;
}

export interface FileContentResponse {
  relative_path: string;
  content: string | null;
  preview_supported: boolean;
  content_type: string;
}

export interface PreparedDownloadResponse {
  download_url: string;
  zip_size_bytes: number;
  file_count: number;
}

export type CoverageKind = 'business_rule' | 'workflow' | 'entity';
export type CoverageStatus = 'covered' | 'partial' | 'missing';

export interface RuleCoverage {
  item: string;
  kind: CoverageKind;
  status: CoverageStatus;
  evidence: string[];
  note: string;
}

export interface CompletenessReport {
  project_id: string;
  completeness_score: number;
  items: RuleCoverage[];
  gaps: string[];
  recommendations: string[];
  degraded: boolean;
}

export interface PriorAnswer {
  id: string;
  answer: string;
}

const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  allowRefresh = true,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const accessToken = getAccessToken();
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init?.headers ?? {}),
      },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      if (res.status === 401 && allowRefresh && await refreshAccessToken()) {
        return request<T>(path, init, timeoutMs, false);
      }
      throw new Error(extractError(body, res.status));
    }
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('A requisição expirou. A geração pode levar alguns minutos — tente novamente.');
    }
    throw error instanceof Error ? error : new Error('Falha de rede ao contatar o backend.');
  } finally {
    clearTimeout(timer);
  }
}

/** Drop transport-only bulk (resilient-pipeline diagnostics + raw AI response)
 * from the blueprint before sending it to an agent stage — it is never needed
 * for generation and only inflates the request body. */
function stripBlueprintForTransport(blueprint: unknown): unknown {
  if (!blueprint || typeof blueprint !== 'object' || Array.isArray(blueprint)) return blueprint ?? null;
  const { responseDiagnostics: _drop, ...rest } = blueprint as Record<string, unknown>;
  return rest;
}

function extractError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === 'string') return record.detail;
    if (record.detail && typeof record.detail === 'object') {
      const message = (record.detail as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }
    if (record.error && typeof record.error === 'object') {
      const message = (record.error as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }
    if (typeof record.message === 'string') return record.message;
  }
  return `HTTP ${status}`;
}

export const metaFactoryClient = {
  createJob: (payload: {
    projectId: string;
    workspaceId?: string | null;
    projectName: string;
    spec: ProjectSpec;
    blueprint: unknown;
    blueprintVersion: number;
    mode?: 'llm' | 'deterministic';
  }) => request<ResilientGenerationJob>(
    '/api/meta-factory/jobs',
    { method: 'POST', body: JSON.stringify(payload) },
    30_000,
  ),
  latestJob: (projectId: string) => request<ResilientGenerationJob | null>(
    `/api/meta-factory/jobs/latest?projectId=${encodeURIComponent(projectId)}`,
    undefined,
    30_000,
  ),
  getJob: (jobId: string) => request<ResilientGenerationJob>(
    `/api/meta-factory/jobs/${encodeURIComponent(jobId)}`,
    undefined,
    30_000,
  ),
  getUsage: (periodDays = 30) => request<GenerationUsageSummary>(
    `/api/meta-factory/jobs/usage?period_days=${encodeURIComponent(String(periodDays))}`,
    undefined,
    30_000,
  ),
  streamJob: async (
    jobId: string,
    onJob: (job: ResilientGenerationJob) => void,
    signal?: AbortSignal,
    onEvent?: (event: GenerationExecutionEvent) => void,
  ) => {
    let lastEventId: string | undefined;
    let terminal = false;
    let reconnectDelayMs = 500;

    const waitForReconnect = (delayMs: number) => new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const onAbort = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      const timeout = window.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, delayMs);
      signal?.addEventListener('abort', onAbort, { once: true });
    });

    const run = async (allowRefresh: boolean): Promise<void> => {
      const accessToken = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/api/meta-factory/jobs/${encodeURIComponent(jobId)}/events`, {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
        },
        credentials: 'include', cache: 'no-store', signal,
      });
      if (response.status === 401 && allowRefresh && await refreshAccessToken()) return run(false);
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const line = frame.split('\n').find((item) => item.startsWith('data: '));
          if (line) {
            const idLine = frame.split('\n').find((item) => item.startsWith('id: '));
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              job?: ResilientGenerationJob;
              event?: GenerationExecutionEvent;
            };
            if (idLine) lastEventId = idLine.slice(4).trim() || lastEventId;
            if (event.type === 'generation_job' && event.job) {
              onJob(event.job);
              terminal = TERMINAL_JOB_STATUSES.has(event.job.status);
            }
            else if (event.type === 'execution_event' && event.event) onEvent?.(event.event);
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    };
    while (!signal?.aborted && !terminal) {
      try {
        await run(true);
        reconnectDelayMs = 500;
      } catch (reason) {
        if (signal?.aborted || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        const message = reason instanceof Error ? reason.message : '';
        if (/^HTTP 4\d\d$/.test(message) && !/^HTTP (408|429)$/.test(message)) throw reason;
      }
      if (!terminal && !signal?.aborted) {
        await waitForReconnect(reconnectDelayMs);
        reconnectDelayMs = Math.min(5_000, reconnectDelayMs * 2);
      }
    }
  },
  retryJobStage: (jobId: string, stage: string, mode: 'normal' | 'partitioned' | 'deterministic') =>
    request<ResilientGenerationJob>(
      `/api/meta-factory/jobs/${encodeURIComponent(jobId)}/stages/${encodeURIComponent(stage)}/retry`,
      { method: 'POST', body: JSON.stringify({ mode }) },
      30_000,
    ),
  resumeJob: (jobId: string) => request<ResilientGenerationJob>(
    `/api/meta-factory/jobs/${encodeURIComponent(jobId)}/resume`,
    { method: 'POST' },
    30_000,
  ),
  continueWithWarnings: (jobId: string) => request<ResilientGenerationJob>(
    `/api/meta-factory/jobs/${encodeURIComponent(jobId)}/continue`,
    { method: 'POST' },
    30_000,
  ),
  continueAfterBuildSkip: (jobId: string) => request<ResilientGenerationJob>(
    `/api/meta-factory/jobs/${encodeURIComponent(jobId)}/continue-after-build-skip`,
    { method: 'POST' },
    30_000,
  ),
  pauseJob: (jobId: string) => request<ResilientGenerationJob>(
    `/api/meta-factory/jobs/${encodeURIComponent(jobId)}/pause`,
    { method: 'POST' },
    30_000,
  ),
  deleteJob: (jobId: string) => request<null>(
    `/api/meta-factory/jobs/${encodeURIComponent(jobId)}`,
    { method: 'DELETE' },
    30_000,
  ),
  // The jobs "space": every generation the user has run. `archived` filters to
  // the active list (false), the archive (true), or everything (omit it).
  listJobs: (archived?: boolean) => request<GenerationJobSummary[]>(
    `/api/meta-factory/jobs${archived === undefined ? '' : `?archived=${archived}`}`,
    undefined,
    30_000,
  ),
  setJobArchived: (jobId: string, archived: boolean) => request<ResilientGenerationJob>(
    `/api/meta-factory/jobs/${encodeURIComponent(jobId)}/archive`,
    { method: 'PATCH', body: JSON.stringify({ archived }) },
    30_000,
  ),
  downloadJobDiagnostic: (jobId: string) => downloadAuthenticated(
    `${API_BASE_URL}/api/meta-factory/jobs/${encodeURIComponent(jobId)}/diagnostic`,
    `${jobId}-diagnostic.json`,
  ),
  downloadRawArtifact: (jobId: string, artifactId: string, filename: string) => downloadAuthenticated(
    `${API_BASE_URL}/api/meta-factory/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}/raw`,
    filename,
  ),
  orchestrate: (raw_intent: string, prior_answers: PriorAnswer[] = [], user_model_choice?: string, use_user_key = false) =>
    request<OrchestrateResponse>(
      '/api/meta-factory/orchestrate',
      { method: 'POST', body: JSON.stringify({ raw_intent, prior_answers, user_model_choice, use_user_key }) },
      FIVE_MIN,
    ),
  generate: (spec: ProjectSpec, project_name: string, user_model_choice?: string, use_user_key = false) =>
    request<GenerateResponse>(
      '/api/meta-factory/generate',
      { method: 'POST', body: JSON.stringify({ spec, project_name, user_model_choice, persist: true, use_user_key }) },
      TEN_MIN,
    ),
  // Deep Engineering pre-flight: streams the system "thinking" through the project
  // (requirements, architecture, security, risk, build plan, validation) with a
  // deliberate pace, before any code is generated.
  deepAnalyzeStream: async (
    spec: ProjectSpec,
    blueprint: unknown,
    onEvent: (event: DeepEvent) => void,
  ): Promise<void> => {
    const run = async (allowRefresh: boolean): Promise<void> => {
      const accessToken = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/api/deep-engineering/analyze/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ spec, blueprint: blueprint ?? null, pace: true }),
      });
      if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
        return run(false);
      }
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
          if (dataLine) onEvent(JSON.parse(dataLine.slice(6)) as DeepEvent);
        }
      }
    };
    await run(true);
  },
  // Deep Engineering for an existing codebase (Modernize): streams the same
  // staged thinking, derived from the ingested project's inventory/diagnosis.
  deepAnalyzeModernizeStream: async (
    ingest_id: string,
    onEvent: (event: DeepEvent) => void,
  ): Promise<void> => {
    const run = async (allowRefresh: boolean): Promise<void> => {
      const accessToken = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/api/modernize/deep-analyze/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ ingest_id, pace: true }),
      });
      if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
        return run(false);
      }
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
          if (dataLine) onEvent(JSON.parse(dataLine.slice(6)) as DeepEvent);
        }
      }
    };
    await run(true);
  },
  // Real-time generation: streams the API-First pipeline as Server-Sent Events.
  // Consumed via fetch + ReadableStream (POST carries the full spec in the body).
  generateStream: async (
    spec: ProjectSpec,
    project_name: string,
    onEvent: (event: FactoryEvent) => void,
    user_model_choice?: string,
    use_user_key = false,
  ): Promise<void> => {
    const run = async (allowRefresh: boolean): Promise<void> => {
      const accessToken = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/api/meta-factory/generate/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ spec, project_name, user_model_choice, persist: true, use_user_key }),
      });
      if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
        return run(false);
      }
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
          if (dataLine) onEvent(JSON.parse(dataLine.slice(6)) as FactoryEvent);
        }
      }
    };
    await run(true);
  },
  generateStageStream: async (
    spec: ProjectSpec,
    project_name: string,
    role: string,
    project_id: string | null,
    onEvent: (event: FactoryEvent) => void,
    user_model_choice?: string,
    use_user_key = false,
    blueprint?: unknown,
  ): Promise<void> => {
    // Keep the request body small so it never trips a proxy body limit (HTTP 413).
    // The first stage (no project_id) sends spec + blueprint once; the server
    // persists them and every later stage references them by project_id with a
    // slim body. Diagnostics on the blueprint are never needed for generation.
    const slim = Boolean(project_id);
    const outSpec = slim ? ({ raw_intent: spec.raw_intent } as ProjectSpec) : spec;
    const outBlueprint = slim ? null : stripBlueprintForTransport(blueprint);

    const run = async (allowRefresh: boolean): Promise<void> => {
      const accessToken = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/api/meta-factory/generate/stage/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ spec: outSpec, project_name, role, project_id, user_model_choice, persist: true, use_user_key, blueprint: outBlueprint }),
      });
      if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
        return run(false);
      }
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
          if (dataLine) onEvent(JSON.parse(dataLine.slice(6)) as FactoryEvent);
        }
      }
    };
    await run(true);
  },
  reviewCompleteness: (spec: ProjectSpec, project_id: string, user_model_choice?: string, use_user_key = false) =>
    request<CompletenessReport>(
      '/api/meta-factory/review',
      { method: 'POST', body: JSON.stringify({ spec, project_id, user_model_choice, use_user_key }) },
      FIVE_MIN,
    ),
  // Build/auto-repair "sala de teste": streams verify + repair progress over SSE.
  verifyAndRepairStream: async (
    projectId: string,
    spec: ProjectSpec,
    onEvent: (event: FactoryEvent) => void,
    user_model_choice?: string,
    use_user_key = false,
  ): Promise<void> => {
    const run = async (allowRefresh: boolean): Promise<void> => {
      const accessToken = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/api/meta-factory/${projectId}/verify/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ spec, user_model_choice, use_user_key }),
      });
      if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
        return run(false);
      }
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
          if (dataLine) onEvent(JSON.parse(dataLine.slice(6)) as FactoryEvent);
        }
      }
    };
    await run(true);
  },
  listFiles: (projectId: string) =>
    request<GeneratedFilesResponse>(`/api/meta-factory/${projectId}/files`, undefined, 30_000),
  fileContent: (projectId: string, path: string) =>
    request<FileContentResponse>(
      `/api/meta-factory/${projectId}/file-content?path=${encodeURIComponent(path)}`,
      undefined,
      30_000,
    ),
  prepareDownload: (projectId: string, force = false) =>
    request<PreparedDownloadResponse>(
      `/api/meta-factory/${projectId}/prepare-download${force ? '?force=true' : ''}`,
      { method: 'POST' },
      30_000,
    ),
  download: (projectId: string) =>
    downloadAuthenticated(`${API_BASE_URL}/api/meta-factory/${projectId}/download`, `${projectId}.zip`),
  // --------------------------------------------- Delivery Decision Center
  getDeliveryDecision: (projectId: string) =>
    request<DeliveryDecision>(`/api/meta-factory/${projectId}/delivery`, undefined, 30_000),
  recordDeliveryDecision: (projectId: string, deliveryMode: DeliveryMode) =>
    request<DeliveryDecision>(
      `/api/meta-factory/${projectId}/delivery`,
      { method: 'POST', body: JSON.stringify({ delivery_mode: deliveryMode }) },
      30_000,
    ),
  // ------------------------------------------------ LDCN Execution Terminal
  terminalHistory: (projectId: string) =>
    request<TerminalHistoryResponse>(`/api/meta-factory/${projectId}/terminal/history`, undefined, 30_000),
  executeTerminalCommand: async (
    projectId: string,
    command: string,
    cwd: string,
    onLine: (stream: 'stdout' | 'stderr', line: string) => void,
    signal?: AbortSignal,
  ): Promise<TerminalCommandRecord> => {
    const accessToken = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/meta-factory/${projectId}/terminal/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include', cache: 'no-store', signal,
      body: JSON.stringify({ command, cwd }),
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let record: TerminalCommandRecord | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const line = frame.split('\n').find((item) => item.startsWith('data: '));
        if (line) {
          const event = JSON.parse(line.slice(6)) as TerminalStreamEvent;
          if (event.type === 'line') onLine(event.stream, event.line);
          else if (event.type === 'done') record = event.record;
          else if (event.type === 'error') throw new Error(event.detail);
        }
        boundary = buffer.indexOf('\n\n');
      }
      if (done) break;
    }
    if (!record) throw new Error('O terminal terminou sem registrar o comando.');
    return record;
  },
};
