import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';

export interface AiStatus {
  ai_active: boolean;
  mode: 'ai' | 'deterministic_preview';
  providers: string[];
}

export async function fetchAiStatus(allowRefresh = true): Promise<AiStatus> {
  const accessToken = getAccessToken();
  const res = await fetch(`${API_BASE_URL}/api/ai-status`, {
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
    return fetchAiStatus(false);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as AiStatus;
}
