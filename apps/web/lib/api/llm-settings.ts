import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type { ActiveLlmSettings, LlmCacheStats, LlmModelUsage, LlmProviderId, LlmResolution, LlmUsageStats } from '@contracts/llm-settings.contract';

async function send<T>(path: string, init: RequestInit, allowRefresh = true): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      ...(init.headers ?? {}),
    },
    credentials: 'include',
    cache: 'no-store',
  });
  if (response.status === 401 && allowRefresh && (await refreshAccessToken())) {
    return send<T>(path, init, false);
  }
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export const llmSettingsClient = {
  active: () => send<ActiveLlmSettings>('/api/llm/settings/active', { method: 'GET' }),
  select: (provider: LlmProviderId, model?: string) =>
    send<ActiveLlmSettings>('/api/llm/settings/active', {
      method: 'PUT',
      body: JSON.stringify({ provider, model }),
    }),
  confirm: (
    requestedCapability: string,
    mode: 'llm' | 'deterministic' = 'llm',
    optionalOverrideProvider?: LlmProviderId,
  ) =>
    send<LlmResolution>('/api/llm/settings/confirm', {
      method: 'POST',
      body: JSON.stringify({ requestedCapability, mode, optionalOverrideProvider }),
    }),
  cacheStats: () => send<LlmCacheStats>('/api/llm/cache-stats', { method: 'GET' }),
  usageStats: () => send<LlmUsageStats>('/api/llm/usage/stats', { method: 'GET' }),
  usageByModel: () => send<LlmModelUsage[]>('/api/llm/usage/by-model', { method: 'GET' }),
};
