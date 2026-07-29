import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type { ExecutionProfileSummary } from '@contracts/execution-profile.contract';

export async function fetchExecutionProfiles(allowRefresh = true): Promise<ExecutionProfileSummary[]> {
  const accessToken = getAccessToken();
  const res = await fetch(`${API_BASE_URL}/api/execution-profiles`, {
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
    return fetchExecutionProfiles(false);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ExecutionProfileSummary[];
}
