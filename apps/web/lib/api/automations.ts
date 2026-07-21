import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type { Automation } from '@contracts/automation.contract';

export type { Automation } from '@contracts/automation.contract';

async function send<T>(path: string, init: RequestInit, allowRefresh = true): Promise<T> {
  const accessToken = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(init.headers ?? {}) },
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
    return send<T>(path, init, false);
  }
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = body && typeof body === 'object' && typeof (body as Record<string, unknown>).detail === 'string' ? (body as Record<string, string>).detail : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body as T;
}

export const automationsClient = {
  list: () => send<Automation[]>('/api/automations', { method: 'GET' }),
};
