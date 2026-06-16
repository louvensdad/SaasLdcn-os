import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type {
  KeyProvider,
  KeySessionStatusResponse,
} from '@contracts/user-ai-key.contract';

export type { KeyProvider, KeySessionStatus, KeySessionStatusResponse } from '@contracts/user-ai-key.contract';

const TIMEOUT = 15_000;

async function send<T>(path: string, init: RequestInit, allowRefresh = true): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const accessToken = getAccessToken();
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers ?? {}),
      },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
      return send<T>(path, init, false);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const userKeysClient = {
  status: () => send<KeySessionStatusResponse>('/api/user-ai-keys/status', { method: 'GET' }),
  // The raw key leaves the browser only on this call (over the API), is never
  // persisted client-side, and is never returned in any response.
  setKey: (provider: KeyProvider, api_key: string) =>
    send<KeySessionStatusResponse>('/api/user-ai-keys/session', {
      method: 'POST',
      body: JSON.stringify({ provider, api_key }),
    }),
  remove: (provider?: string) =>
    send<null>(
      `/api/user-ai-keys/session${provider ? `?provider=${encodeURIComponent(provider)}` : ''}`,
      { method: 'DELETE' },
    ),
};
