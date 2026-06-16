import { API_BASE_URL } from '@/lib/api/endpoints';
import {
  downloadAuthenticated,
  getAccessToken,
  refreshAccessToken,
} from '@/lib/api/client';

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
    }
  | { type: 'written'; project_id: string; root_path: string; file_count: number }
  | { type: 'done'; ok: boolean; degraded: boolean; errors: string[] }
  | { type: 'error'; detail: string };

export interface AgentRunSummary {
  role: string;
  model: string;
  file_count: number;
  stopped_by: string;
  errors: string[];
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

function extractError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === 'string') return record.detail;
    if (record.error && typeof record.error === 'object') {
      const message = (record.error as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }
    if (typeof record.message === 'string') return record.message;
  }
  return `HTTP ${status}`;
}

export const metaFactoryClient = {
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
  listFiles: (projectId: string) =>
    request<GeneratedFilesResponse>(`/api/meta-factory/${projectId}/files`, undefined, 30_000),
  fileContent: (projectId: string, path: string) =>
    request<FileContentResponse>(
      `/api/meta-factory/${projectId}/file-content?path=${encodeURIComponent(path)}`,
      undefined,
      30_000,
    ),
  prepareDownload: (projectId: string) =>
    request<PreparedDownloadResponse>(
      `/api/meta-factory/${projectId}/prepare-download`,
      { method: 'POST' },
      30_000,
    ),
  download: (projectId: string) =>
    downloadAuthenticated(`${API_BASE_URL}/api/meta-factory/${projectId}/download`, `${projectId}.zip`),
};
