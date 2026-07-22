import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type {
  CreateMissionRequest,
  DecideGapRequest,
  GenerateMissionArtifactRequest,
  MissionFailureDiagnostic,
  MissionGenome,
  MissionInstance,
  MissionInstanceSummary,
  PostMissionMessageRequest,
} from '@contracts/mission.contract';

const FIVE_MIN = 5 * 60 * 1000;
const THIRTY_SEC = 30 * 1000;

export class MissionApiError extends Error {
  readonly endpoint: string;
  readonly httpStatus: number;
  readonly diagnostic: MissionFailureDiagnostic | null;

  constructor(endpoint: string, httpStatus: number, message: string, diagnostic: MissionFailureDiagnostic | null) {
    super(message);
    this.name = 'MissionApiError';
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
      throw new MissionApiError(path, res.status, diagnostic?.backend_message ?? extractError(body, res.status), diagnostic);
    }
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new MissionApiError(path, 408, 'A requisicao expirou. O backend nao respondeu dentro do tempo esperado.', {
        status_current: 'UNKNOWN',
        status_expected: [],
        endpoint_called: path,
        http_status: 408,
        backend_message: 'Timeout da requisicao',
        rejection_reason: 'Tempo limite excedido.',
        correction: 'Tente novamente. Se repetir, verifique disponibilidade do backend e provider LLM.',
      });
    }
    throw error instanceof Error ? error : new Error('Falha de rede ao contatar o backend.');
  } finally {
    clearTimeout(timer);
  }
}

function extractDiagnostic(body: unknown): MissionFailureDiagnostic | null {
  if (!body || typeof body !== 'object') return null;
  const detail = (body as Record<string, unknown>).detail;
  if (!detail || typeof detail !== 'object') return null;
  const record = detail as Record<string, unknown>;
  if (typeof record.backend_message !== 'string') return null;
  return record as unknown as MissionFailureDiagnostic;
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

export const missionsClient = {
  registry: () => request<MissionGenome[]>('/api/missions/registry', undefined, THIRTY_SEC),
  list: () => request<MissionInstanceSummary[]>('/api/missions', undefined, THIRTY_SEC),
  get: (missionId: string) => request<MissionInstance>(`/api/missions/${missionId}`, undefined, THIRTY_SEC),
  create: (payload: CreateMissionRequest) => request<MissionInstance>('/api/missions', { method: 'POST', body: JSON.stringify(payload) }, FIVE_MIN),
  postMessage: (missionId: string, payload: PostMissionMessageRequest) =>
    request<MissionInstance>(`/api/missions/${missionId}/message`, { method: 'POST', body: JSON.stringify(payload) }, FIVE_MIN),
  advanceStep: (missionId: string) => request<MissionInstance>(`/api/missions/${missionId}/advance-step`, { method: 'POST' }, THIRTY_SEC),
  decideGap: (missionId: string, gapId: string, payload: DecideGapRequest) =>
    request<MissionInstance>(`/api/missions/${missionId}/gaps/${gapId}`, { method: 'POST', body: JSON.stringify(payload) }, THIRTY_SEC),
  generateArtifact: (missionId: string, payload?: GenerateMissionArtifactRequest) =>
    request<MissionInstance>(`/api/missions/${missionId}/artifact`, { method: 'POST', body: payload ? JSON.stringify(payload) : undefined }, FIVE_MIN),
  archive: (missionId: string) => request<MissionInstance>(`/api/missions/${missionId}/archive`, { method: 'POST' }, THIRTY_SEC),
  remove: (missionId: string) => request<null>(`/api/missions/${missionId}`, { method: 'DELETE' }, THIRTY_SEC),
};
