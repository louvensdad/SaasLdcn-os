import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type {
  CodeDiffSummary,
  ModernizeGenerateResponse,
  ModernizeProject,
  ModernizeProjectIngest,
  ModernizeProjectSummary,
  ModernizeResponse,
  RefactorResult,
  RevalidationReport,
} from '@contracts/modernize.contract';
import type { CodebaseAnalysisReport } from '@contracts/codebase-analysis.contract';
import type { ApprovePlanRequest, FixApproval, ModernizationPlan } from '@contracts/refactor-plan.contract';

export type { ModernizeResponse, ModernizeGenerateResponse, IngestStats } from '@contracts/modernize.contract';
export type { CodebaseAnalysisReport, CodeIssue, CodebaseScores } from '@contracts/codebase-analysis.contract';
export type { ModernizationPlan, ModernizationPhase, FixAction, ApprovalMode } from '@contracts/refactor-plan.contract';
export type {
  ModernizeProject,
  ModernizeProjectIngest,
  ModernizeProjectSummary,
  RefactorResult,
  RevalidationReport,
  CodeDiffSummary,
} from '@contracts/modernize.contract';

/** analyze() returns the report + the phased plan together. */
export interface ModernizationReportResponse {
  report: CodebaseAnalysisReport;
  plan: ModernizationPlan;
}

export interface ModernizeAskResponse {
  answer: string;
  mode: 'llm' | 'deterministic';
  grounded_on: string[];
}

export interface RuntimeMetric {
  id: string;
  label: string;
  value: string;
  kind: 'measured' | 'estimate';
  basis: string;
}

export interface RuntimeProfile {
  runtime: string;
  language: string;
  container_ready: boolean;
  executed: boolean;
  metrics: RuntimeMetric[];
  notes: string[];
}

const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

async function send<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  allowRefresh = true,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const accessToken = getAccessToken();
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(init.headers ?? {}) },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
      return send<T>(path, init, timeoutMs, false);
    }
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error(extractError(body, res.status));
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

function extractError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === 'string') return record.detail;
    if (record.error && typeof record.error === 'object') {
      const message = (record.error as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }
  }
  return `HTTP ${status}`;
}

export const modernizeClient = {
  ingestZip: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return send<ModernizeResponse>('/api/modernize/ingest/zip', { method: 'POST', body: form }, FIVE_MIN);
  },
  ingestGit: (git_url: string) =>
    send<ModernizeResponse>(
      '/api/modernize/ingest/git',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ git_url }) },
      FIVE_MIN,
    ),
  generate: (ingest_id: string, project_name: string, user_model_choice?: string, use_user_key = false) =>
    send<ModernizeGenerateResponse>(
      '/api/modernize/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingest_id, project_name, user_model_choice, persist: true, use_user_key }),
      },
      TEN_MIN,
    ),

  // --- Persistent analysis flow (Modernize ingest → Auto-Fix execution) ---
  // Modernize ingests via these; they create a persistent owner-scoped job
  // (project_id == ingest_id) and return the full diagnosis bundle.
  createProjectZip: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return send<ModernizeProjectIngest>('/api/modernize/projects/upload', { method: 'POST', body: form }, FIVE_MIN);
  },
  createProjectGit: (git_url: string) =>
    send<ModernizeProjectIngest>(
      '/api/modernize/projects/git',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ git_url }) },
      FIVE_MIN,
    ),

  // Auto-Fix picks up an existing analysis — never re-uploads.
  latestProject: () =>
    send<ModernizeProjectSummary | null>('/api/modernize/projects/latest', { method: 'GET' }, FIVE_MIN),
  listProjects: () => send<ModernizeProjectSummary[]>('/api/modernize/projects', { method: 'GET' }, FIVE_MIN),
  deleteProject: (projectId: string) =>
    send<null>(`/api/modernize/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' }, FIVE_MIN),
  getReport: (projectId: string) =>
    send<ModernizationReportResponse>(`/api/modernize/${projectId}/report`, { method: 'GET' }, FIVE_MIN),
  analyze: (projectId: string, opts: { useUserKey?: boolean; model?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.useUserKey) params.set('use_user_key', 'true');
    if (opts.model) params.set('user_model_choice', opts.model);
    const qs = params.toString();
    return send<ModernizationReportResponse>(
      `/api/modernize/${projectId}/analyze${qs ? `?${qs}` : ''}`,
      { method: 'POST' },
      TEN_MIN,
    );
  },
  approvePlan: (projectId: string, body: ApprovePlanRequest) =>
    send<FixApproval>(
      `/api/modernize/${projectId}/approve-plan`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      FIVE_MIN,
    ),
  applyFixes: (projectId: string) =>
    send<RefactorResult>(`/api/modernize/${projectId}/apply-fixes`, { method: 'POST' }, TEN_MIN),
  revalidate: (projectId: string) =>
    send<RevalidationReport>(`/api/modernize/${projectId}/revalidate`, { method: 'POST' }, FIVE_MIN),
  diff: (projectId: string) => send<CodeDiffSummary>(`/api/modernize/${projectId}/diff`, { method: 'GET' }, FIVE_MIN),

  // Real runtime PROFILE of the ingested codebase (no execution; measured + labeled estimates).
  runtimeProfile: (ingest_id: string) =>
    send<RuntimeProfile>(
      '/api/modernize/runtime-profile',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingest_id }) },
      FIVE_MIN,
    ),

  // Grounded Q&A about an ingested project (deterministic without a key; LLM with one).
  ask: (ingest_id: string, question: string, opts: { useUserKey?: boolean; model?: string } = {}) =>
    send<ModernizeAskResponse>(
      '/api/modernize/ask',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingest_id, question, use_user_key: opts.useUserKey ?? false, user_model_choice: opts.model }),
      },
      FIVE_MIN,
    ),
};
