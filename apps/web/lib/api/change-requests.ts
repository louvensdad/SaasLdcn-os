import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type { ChangeRequest, ChangeRequestDiff, ChangeRequestFailureDiagnostic, ChangeRequestSummary } from '@contracts/change-request.contract';

export type {
  ChangeRequest,
  ChangeRequestApproval,
  ChangeRequestClassification,
  ChangeRequestDiff,
  ChangeRequestFailureDiagnostic,
  ChangeRequestHistoryEvent,
  ChangeRequestOperationLog,
  ChangeRequestPreviewResult,
  ChangeRequestResult,
  ChangeRequestStatus,
  ChangeRequestSummary,
  ClassificationResult,
  FileDiff,
  ImpactAnalysis,
} from '@contracts/change-request.contract';
export { CONSCIOUS_APPROVAL_PHRASE } from '@contracts/change-request.contract';

const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

export class ChangeRequestApiError extends Error {
  readonly endpoint: string;
  readonly httpStatus: number;
  readonly diagnostic: ChangeRequestFailureDiagnostic | null;

  constructor(endpoint: string, httpStatus: number, message: string, diagnostic: ChangeRequestFailureDiagnostic | null) {
    super(message);
    this.name = 'ChangeRequestApiError';
    this.endpoint = endpoint;
    this.httpStatus = httpStatus;
    this.diagnostic = diagnostic;
  }
}

function extractDiagnostic(body: unknown): ChangeRequestFailureDiagnostic | null {
  if (!body || typeof body !== 'object') return null;
  const detail = (body as Record<string, unknown>).detail;
  if (!detail || typeof detail !== 'object') return null;
  const record = detail as Record<string, unknown>;
  if (typeof record.backend_message !== 'string') return null;
  return record as unknown as ChangeRequestFailureDiagnostic;
}

function extractError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === 'string') return record.detail;
  }
  return `HTTP ${status}`;
}

async function send<T>(path: string, init: RequestInit, timeoutMs: number, allowRefresh = true): Promise<T> {
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
    if (res.status === 204) return null as T;
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const diagnostic = extractDiagnostic(body);
      throw new ChangeRequestApiError(path, res.status, diagnostic?.backend_message ?? extractError(body, res.status), diagnostic);
    }
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ChangeRequestApiError(path, 408, 'A requisicao expirou. O backend nao respondeu dentro do tempo esperado.', null);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

export const changeRequestsClient = {
  listForProject: (projectId: string) =>
    send<ChangeRequestSummary[]>(`/api/change-requests?project_id=${encodeURIComponent(projectId)}`, { method: 'GET' }, FIVE_MIN),
  listForOwner: () => send<ChangeRequestSummary[]>('/api/change-requests', { method: 'GET' }, FIVE_MIN),
  create: (projectId: string, intent: string, opts: { roomId?: string; featureId?: string; taskId?: string; workspaceId?: string } = {}) =>
    send<ChangeRequest>(
      '/api/change-requests',
      jsonInit('POST', {
        project_id: projectId,
        intent,
        room_id: opts.roomId,
        feature_id: opts.featureId,
        task_id: opts.taskId,
        workspace_id: opts.workspaceId,
      }),
      FIVE_MIN,
    ),
  get: (id: string) => send<ChangeRequest>(`/api/change-requests/${encodeURIComponent(id)}`, { method: 'GET' }, FIVE_MIN),
  diff: (id: string) => send<ChangeRequestDiff>(`/api/change-requests/${encodeURIComponent(id)}/diff`, { method: 'GET' }, FIVE_MIN),
  analyze: (id: string, opts: { useUserKey?: boolean; model?: string } = {}) =>
    send<ChangeRequest>(
      `/api/change-requests/${encodeURIComponent(id)}/analyze`,
      jsonInit('POST', { use_user_key: opts.useUserKey ?? false, user_model_choice: opts.model }),
      TEN_MIN,
    ),
  plan: (id: string, opts: { useUserKey?: boolean; model?: string } = {}) =>
    send<ChangeRequest>(
      `/api/change-requests/${encodeURIComponent(id)}/plan`,
      jsonInit('POST', { use_user_key: opts.useUserKey ?? false, user_model_choice: opts.model }),
      TEN_MIN,
    ),
  approve: (id: string, confirmation: string) =>
    send<ChangeRequest>(`/api/change-requests/${encodeURIComponent(id)}/approve`, jsonInit('POST', { confirmation }), FIVE_MIN),
  apply: (id: string, opts: { useUserKey?: boolean; model?: string } = {}) =>
    send<ChangeRequest>(
      `/api/change-requests/${encodeURIComponent(id)}/apply`,
      jsonInit('POST', { use_user_key: opts.useUserKey ?? false, user_model_choice: opts.model }),
      TEN_MIN,
    ),
  accept: (id: string) => send<ChangeRequest>(`/api/change-requests/${encodeURIComponent(id)}/accept`, jsonInit('POST'), FIVE_MIN),
  reject: (id: string, reason: string) =>
    send<ChangeRequest>(`/api/change-requests/${encodeURIComponent(id)}/reject`, jsonInit('POST', { reason }), FIVE_MIN),
  rollback: (id: string, reason: string) =>
    send<ChangeRequest>(`/api/change-requests/${encodeURIComponent(id)}/rollback`, jsonInit('POST', { reason }), FIVE_MIN),
  remove: (id: string) => send<null>(`/api/change-requests/${encodeURIComponent(id)}`, { method: 'DELETE' }, FIVE_MIN),
};
