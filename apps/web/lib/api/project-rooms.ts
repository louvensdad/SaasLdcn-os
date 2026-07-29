import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type {
  CreateProjectRoomRequest,
  ImportPromptMasterRequest,
  PostProjectRoomMessageRequest,
  ProjectRoom,
  ProjectRoomFailureDiagnostic,
  ProjectRoomSummary,
  ReviseProjectRoomPromptRequest,
} from '@contracts/project-room.contract';
import type { BlueprintDecision, StackApprovalRequest } from '@contracts/architecture-blueprint.contract';

export type BlueprintStreamEvent =
  | { type: 'progress' | 'heartbeat'; stage: string; label: string; progress: number; elapsed?: number }
  | { type: 'decision'; index: number; decision: BlueprintDecision; progress: number }
  | { type: 'complete'; room: ProjectRoom; progress: number }
  | { type: 'error'; message: string; retryable: boolean };

export interface BlueprintGenerationOptions {
  mode: 'llm' | 'deterministic';
  user_model_choice?: string | null;
  provider_override?: string | null;
  signal?: AbortSignal;
}

export interface EngineeringReviewValidation {
  valid: boolean;
  status_current: string;
  status_expected: string[];
  active_blueprint_version: number;
  provider: string | null;
  providerLabel: string;
  model: string;
  mode: 'llm' | 'deterministic';
  degraded: boolean;
  checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  blockers: string[];
  recommended_action: string;
  room: ProjectRoom;
}

const FIVE_MIN = 5 * 60 * 1000;
const THIRTY_SEC = 30 * 1000;

export class ProjectRoomApiError extends Error {
  readonly endpoint: string;
  readonly httpStatus: number;
  readonly diagnostic: ProjectRoomFailureDiagnostic | null;

  constructor(endpoint: string, httpStatus: number, message: string, diagnostic: ProjectRoomFailureDiagnostic | null) {
    super(message);
    this.name = 'ProjectRoomApiError';
    this.endpoint = endpoint;
    this.httpStatus = httpStatus;
    this.diagnostic = diagnostic;
  }
}

async function request<T>(path: string, init: RequestInit | undefined, timeoutMs: number, allowRefresh = true): Promise<T> {
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
      if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
        return request<T>(path, init, timeoutMs, false);
      }
      const diagnostic = extractDiagnostic(body);
      throw new ProjectRoomApiError(path, res.status, diagnostic?.backend_message ?? extractError(body, res.status), diagnostic);
    }
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ProjectRoomApiError(path, 408, 'A requisicao expirou. O backend nao respondeu dentro do tempo esperado.', {
        status_current: 'UNKNOWN',
        status_expected: [],
        endpoint_called: path,
        http_status: 408,
        backend_message: 'Timeout da requisicao',
        rejection_reason: 'Tempo limite excedido.',
        correction: 'Tente novamente. Se repetir, verifique disponibilidade do backend e provider LLM.',
        checks: [],
      });
    }
    throw error instanceof Error ? error : new Error('Falha de rede ao contatar o backend.');
  } finally {
    clearTimeout(timer);
  }
}

function extractDiagnostic(body: unknown): ProjectRoomFailureDiagnostic | null {
  if (!body || typeof body !== 'object') return null;
  const detail = (body as Record<string, unknown>).detail;
  if (!detail || typeof detail !== 'object') return null;
  const record = detail as Record<string, unknown>;
  if (typeof record.backend_message !== 'string') return null;
  return record as unknown as ProjectRoomFailureDiagnostic;
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

export const projectRoomsClient = {
  list: () => request<ProjectRoomSummary[]>('/api/project-rooms', undefined, THIRTY_SEC),
  get: (roomId: string) => request<ProjectRoom>(`/api/project-rooms/${roomId}`, undefined, THIRTY_SEC),
  create: (payload: CreateProjectRoomRequest) => request<ProjectRoom>('/api/project-rooms', { method: 'POST', body: JSON.stringify(payload) }, FIVE_MIN),
  importPromptMaster: (payload: ImportPromptMasterRequest) => request<ProjectRoom>('/api/project-rooms/import', { method: 'POST', body: JSON.stringify(payload) }, FIVE_MIN),
  archive: (roomId: string) => request<ProjectRoom>(`/api/project-rooms/${roomId}/archive`, { method: 'POST' }, THIRTY_SEC),
  remove: (roomId: string) => request<null>(`/api/project-rooms/${roomId}`, { method: 'DELETE' }, THIRTY_SEC),
  markGenerated: (roomId: string, generatedProjectId: string) => request<ProjectRoom>(`/api/project-rooms/${roomId}/mark-generated`, { method: 'POST', body: JSON.stringify({ generated_project_id: generatedProjectId }) }, THIRTY_SEC),
  postMessage: (roomId: string, payload: PostProjectRoomMessageRequest) => request<ProjectRoom>(`/api/project-rooms/${roomId}/message`, { method: 'POST', body: JSON.stringify(payload) }, FIVE_MIN),
  generatePrompt: (roomId: string, payload?: { use_user_key?: boolean; user_model_choice?: string | null }) => request<ProjectRoom>(`/api/project-rooms/${roomId}/generate-prompt`, { method: 'POST', body: payload ? JSON.stringify(payload) : undefined }, FIVE_MIN),
  revisePrompt: (roomId: string, payload: ReviseProjectRoomPromptRequest) => request<ProjectRoom>(`/api/project-rooms/${roomId}/revise-prompt`, { method: 'POST', body: JSON.stringify(payload) }, FIVE_MIN),
  generateBlueprint: (roomId: string, payload?: { use_user_key?: boolean; user_model_choice?: string | null; mode?: 'llm' | 'deterministic'; provider_override?: string | null }) =>
    request<ProjectRoom>(`/api/project-rooms/${roomId}/blueprint`, { method: 'POST', body: payload ? JSON.stringify(payload) : undefined }, FIVE_MIN),
  streamBlueprint: async (
    roomId: string,
    options: BlueprintGenerationOptions,
    onEvent: (event: BlueprintStreamEvent) => void,
  ): Promise<ProjectRoom> => {
    const accessToken = getAccessToken();
    const res = await fetch(`${API_BASE_URL}/api/project-rooms/${roomId}/blueprint/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include',
      cache: 'no-store',
      signal: options.signal,
      body: JSON.stringify({
        mode: options.mode,
        use_user_key: options.mode === 'llm',
        user_model_choice: options.user_model_choice,
        provider_override: options.provider_override,
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text();
      throw new Error(body || `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed: ProjectRoom | null = null;
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const eventName = chunk.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim();
        const dataLine = chunk.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim();
        if (!eventName || !dataLine) continue;
        const data = JSON.parse(dataLine) as Record<string, unknown>;
        const event = { type: eventName, ...data } as BlueprintStreamEvent;
        onEvent(event);
        if (event.type === 'complete') completed = event.room;
        if (event.type === 'error') throw new Error(event.message);
      }
      if (done) break;
    }
    if (!completed) throw new Error('O stream terminou sem concluir o Blueprint.');
    return completed;
  },
  restoreBlueprintVersion: (roomId: string, version: number) => request<ProjectRoom>(`/api/project-rooms/${roomId}/blueprints/${version}/restore`, { method: 'POST' }, THIRTY_SEC),
  duplicateBlueprintVersion: (roomId: string, version: number) => request<ProjectRoom>(`/api/project-rooms/${roomId}/blueprints/${version}/duplicate`, { method: 'POST' }, THIRTY_SEC),
  deleteBlueprintVersion: (roomId: string, version: number) => request<ProjectRoom>(`/api/project-rooms/${roomId}/blueprints/${version}`, { method: 'DELETE' }, THIRTY_SEC),
  cancelBlueprint: (roomId: string) => request<ProjectRoom>(`/api/project-rooms/${roomId}/blueprint/cancel`, { method: 'POST' }, THIRTY_SEC),
  startEngineeringReview: (roomId: string) => request<ProjectRoom>(`/api/project-rooms/${roomId}/engineering-review`, { method: 'POST' }, THIRTY_SEC),
  validateEngineeringReview: (roomId: string) => request<EngineeringReviewValidation>(`/api/project-rooms/${roomId}/engineering-review/validate`, { method: 'POST' }, THIRTY_SEC),
  acknowledgePreview: (roomId: string, confirmation: string) => request<ProjectRoom>(`/api/project-rooms/${roomId}/acknowledge-preview`, { method: 'POST', body: JSON.stringify({ confirmation }) }, THIRTY_SEC),
  approve: (roomId: string) => request<ProjectRoom>(`/api/project-rooms/${roomId}/approve`, { method: 'POST' }, THIRTY_SEC),
  approveStack: (roomId: string, overrides?: StackApprovalRequest) =>
    request<ProjectRoom>(`/api/project-rooms/${roomId}/stack/approve`, { method: 'POST', body: JSON.stringify(overrides ?? {}) }, THIRTY_SEC),
  sendToGenerator: (roomId: string) => request<ProjectRoom>(`/api/project-rooms/${roomId}/send-to-generator`, { method: 'POST' }, THIRTY_SEC),
};


