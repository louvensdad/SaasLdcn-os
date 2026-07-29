import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type {
  AiKeyListResponse,
  AiKeyView,
  KeyProvider,
  TestKeyResponse,
} from '@contracts/ai-key-vault.contract';

export type { AiKeyListResponse, AiKeyView, KeyProvider, TestKeyResponse } from '@contracts/ai-key-vault.contract';

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

export const aiKeyVaultClient = {
  list: (provider?: KeyProvider) =>
    send<AiKeyListResponse>(`/api/user-ai-keys${provider ? `?provider=${encodeURIComponent(provider)}` : ''}`, { method: 'GET' }),
  testKey: (provider: KeyProvider, api_key: string) =>
    send<TestKeyResponse>('/api/user-ai-keys/test', {
      method: 'POST',
      body: JSON.stringify({ provider, api_key }),
    }),
  testSavedKey: (keyId: string) =>
    send<TestKeyResponse>(`/api/user-ai-keys/${encodeURIComponent(keyId)}/test`, { method: 'POST' }),
  create: (provider: KeyProvider, nome: string, api_key: string, apelido?: string, modelo_padrao?: string) =>
    send<AiKeyView>('/api/user-ai-keys', {
      method: 'POST',
      body: JSON.stringify({ provider, nome, api_key, apelido, modelo_padrao }),
    }),
  update: (keyId: string, patch: { nome?: string; apelido?: string; modelo_padrao?: string; ativo?: boolean }) =>
    send<AiKeyView>(`/api/user-ai-keys/${keyId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  setDefault: (keyId: string) =>
    send<AiKeyView>(`/api/user-ai-keys/${keyId}/set-default`, { method: 'POST' }),
  remove: (keyId: string) =>
    send<null>(`/api/user-ai-keys/${keyId}`, { method: 'DELETE' }),
};
