import { API_BASE_URL, apiEndpoints } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type { UserPreferencesBlob } from '@contracts/user-preferences.contract';

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

/** Backend-persisted mirror of the Interface/IA settings tabs' client
 * preference stores -- survives logout and process restarts, unlike the
 * localStorage-only copy the stores also keep for instant pre-auth paint. */
export const userPreferencesClient = {
  getInterface: () => send<UserPreferencesBlob>('/api/users/me/preferences/interface', { method: 'GET' }),
  setInterface: (data: Record<string, unknown>) =>
    send<UserPreferencesBlob>('/api/users/me/preferences/interface', { method: 'PUT', body: JSON.stringify({ data }) }),
  getAi: () => send<UserPreferencesBlob>('/api/users/me/preferences/ai', { method: 'GET' }),
  setAi: (data: Record<string, unknown>) =>
    send<UserPreferencesBlob>('/api/users/me/preferences/ai', { method: 'PUT', body: JSON.stringify({ data }) }),
  getCategory: (category: 'personal' | 'git' | 'advanced' | 'locale') =>
    send<UserPreferencesBlob>(apiEndpoints.userPreferences(category), { method: 'GET' }),
  setCategory: (category: 'personal' | 'git' | 'advanced' | 'locale', data: Record<string, unknown>) =>
    send<UserPreferencesBlob>(apiEndpoints.userPreferences(category), { method: 'PUT', body: JSON.stringify({ data }) }),
};
