import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type {
  GenerationNotification,
  GenerationNotificationListResponse,
  MarkAllReadResponse,
} from '@contracts/generation-notification.contract';

export type { GenerationNotification, GenerationNotificationListResponse } from '@contracts/generation-notification.contract';

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

export const generationNotificationsClient = {
  list: (params: { read?: boolean; entityType?: string; cursor?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.read !== undefined) query.set('read', String(params.read));
    // Phase 2: optional, additive -- omitted (the only caller today), the
    // backend returns every subject type exactly as before this existed.
    if (params.entityType) query.set('entity_type', params.entityType);
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.limit) query.set('limit', String(params.limit));
    const suffix = query.toString();
    return send<GenerationNotificationListResponse>(`/api/notifications${suffix ? `?${suffix}` : ''}`, { method: 'GET' });
  },
  markRead: (notificationId: string) =>
    send<GenerationNotification>(`/api/notifications/${notificationId}/read`, { method: 'POST' }),
  markAllRead: () => send<MarkAllReadResponse>('/api/notifications/read-all', { method: 'POST' }),
};
