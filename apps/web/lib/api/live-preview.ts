import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type { ConsoleLogEntry, LivePreviewSession } from '@contracts/live-preview.contract';

export type { ConsoleLogEntry, LivePreviewSession, LivePreviewStatus } from '@contracts/live-preview.contract';

const FIVE_MIN = 5 * 60 * 1000;
// Starting a live preview installs real dependencies (venv + npm install)
// before the dev servers come up -- same budget as change-request apply()
// and RuntimeFunctionalTestService.
const TEN_MIN = 10 * 60 * 1000;

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
  }
  return `HTTP ${status}`;
}

async function sendBinary(path: string, init: RequestInit, timeoutMs: number, allowRefresh = true): Promise<Blob> {
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
      return sendBinary(path, init, timeoutMs, false);
    }
    if (!res.ok) {
      const text = await res.text();
      const body: unknown = text ? JSON.parse(text) : null;
      throw new Error(extractError(body, res.status));
    }
    return res.blob();
  } finally {
    clearTimeout(timer);
  }
}

export const livePreviewClient = {
  start: (projectId: string) =>
    send<LivePreviewSession>(
      '/api/live-preview/start',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId }) },
      TEN_MIN,
    ),
  get: (sessionId: string) => send<LivePreviewSession>(`/api/live-preview/${encodeURIComponent(sessionId)}`, { method: 'GET' }, FIVE_MIN),
  // 404 (no active session for this project) is an expected, common outcome
  // -- callers should catch it and fall back to the "not running" state, not
  // surface it as an error.
  getByProject: (projectId: string) =>
    send<LivePreviewSession>(`/api/live-preview/by-project/${encodeURIComponent(projectId)}`, { method: 'GET' }, FIVE_MIN),
  stop: (sessionId: string) => send<null>(`/api/live-preview/${encodeURIComponent(sessionId)}/stop`, { method: 'POST' }, FIVE_MIN),
  console: (sessionId: string) =>
    send<ConsoleLogEntry[]>(`/api/live-preview/${encodeURIComponent(sessionId)}/console`, { method: 'GET' }, FIVE_MIN),
  screenshot: (sessionId: string) =>
    sendBinary(`/api/live-preview/${encodeURIComponent(sessionId)}/screenshot`, { method: 'POST' }, FIVE_MIN),
  navigate: (sessionId: string, path: string) =>
    send<null>(
      `/api/live-preview/${encodeURIComponent(sessionId)}/navigate`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) },
      FIVE_MIN,
    ),
  reload: (sessionId: string) => send<null>(`/api/live-preview/${encodeURIComponent(sessionId)}/reload`, { method: 'POST' }, FIVE_MIN),
  // Fire-and-forget: durably records the "Ver frontend no navegador" click
  // server-side (ExternalPreviewOpened). Callers should not block window.open()
  // on this -- a slow/failed request must never delay opening the real tab.
  recordExternalOpen: (sessionId: string) =>
    send<null>(`/api/live-preview/${encodeURIComponent(sessionId)}/external-open`, { method: 'POST' }, FIVE_MIN),
  restartFrontend: (sessionId: string) =>
    send<LivePreviewSession>(`/api/live-preview/${encodeURIComponent(sessionId)}/restart-frontend`, { method: 'POST' }, TEN_MIN),
  restartBackend: (sessionId: string) =>
    send<LivePreviewSession>(`/api/live-preview/${encodeURIComponent(sessionId)}/restart-backend`, { method: 'POST' }, TEN_MIN),
};
