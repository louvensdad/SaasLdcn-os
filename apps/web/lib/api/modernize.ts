import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type {
  ModernizeGenerateResponse,
  ModernizeResponse,
} from '@contracts/modernize.contract';

export type { ModernizeResponse, ModernizeGenerateResponse } from '@contracts/modernize.contract';

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
  generate: (ingest_id: string, project_name: string, user_model_choice?: string) =>
    send<ModernizeGenerateResponse>(
      '/api/modernize/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingest_id, project_name, user_model_choice, persist: true }),
      },
      TEN_MIN,
    ),
};
