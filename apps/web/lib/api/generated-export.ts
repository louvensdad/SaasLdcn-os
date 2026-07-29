import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type { GitProvider } from '@contracts/git-provider.contract';
import type {
  GeneratedProjectExportRequest,
  GeneratedProjectExportResponse,
} from '@contracts/generated-export.contract';

export type GenerationSurface = 'meta-factory' | 'modernize';
export type { GeneratedProjectExportRequest, GeneratedProjectExportResponse };

async function request<T>(
  path: string,
  init: RequestInit,
  allowRefresh = true,
): Promise<T> {
  const accessToken = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401 && allowRefresh && await refreshAccessToken()) {
    return request<T>(path, init, false);
  }
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(extractError(body, res.status));
  }
  return body as T;
}

function extractError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    // FastAPI raw detail.
    if (typeof record.detail === 'string') return record.detail;
    // App-wide error envelope: { error: { code, message, details } }.
    if (record.error && typeof record.error === 'object') {
      const message = (record.error as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }
    if (typeof record.message === 'string') return record.message;
  }
  return `HTTP ${status}`;
}

export const generatedExportClient = {
  exportProject: (
    surface: GenerationSurface,
    projectId: string,
    provider: GitProvider,
    payload: GeneratedProjectExportRequest & { force?: boolean },
  ) =>
    request<GeneratedProjectExportResponse>(
      `/api/${surface}/${projectId}/export/${provider}`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
};
