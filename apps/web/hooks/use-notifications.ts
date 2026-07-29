'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { generationNotificationsClient } from '@/lib/api/generation-notifications';
import type { GenerationNotification, GenerationNotificationListResponse } from '@contracts/generation-notification.contract';

export const NOTIFICATIONS_QUERY_KEY = ['generation-notifications'] as const;

// Resilient polling fallback for when no job SSE stream is open (a job's
// stream, when open, pushes new notifications instantly via the `notification`
// frame -- see mergeStreamedNotification below). This app has no global
// WS/SSE-everywhere infra to justify building one just for the notification
// center, so 30s polling is the deliberate floor.
const POLL_INTERVAL_MS = 30_000;

export function useNotifications(enabled = true) {
  return useQuery<GenerationNotificationListResponse>({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => generationNotificationsClient.list({ limit: 30 }),
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 15_000,
    enabled,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => generationNotificationsClient.markRead(notificationId),
    onSuccess: (updated) => {
      queryClient.setQueryData<GenerationNotificationListResponse | undefined>(NOTIFICATIONS_QUERY_KEY, (current) => {
        if (!current || !Array.isArray(current.items)) return current;
        const wasUnread = current.items.find((item) => item.id === updated.id)?.read === false;
        return {
          ...current,
          items: current.items.map((item) => (item.id === updated.id ? updated : item)),
          unread_count: wasUnread ? Math.max(0, current.unread_count - 1) : current.unread_count,
        };
      });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => generationNotificationsClient.markAllRead(),
    onSuccess: () => {
      queryClient.setQueryData<GenerationNotificationListResponse | undefined>(NOTIFICATIONS_QUERY_KEY, (current) =>
        (current && Array.isArray(current.items)
          ? { ...current, items: current.items.map((item) => ({ ...item, read: true })), unread_count: 0 }
          : current));
    },
  });
}

/** Merges a notification pushed over an open job SSE stream into the cache
 * immediately, instead of waiting up to POLL_INTERVAL_MS for the next poll. */
export function mergeStreamedNotification(
  queryClient: ReturnType<typeof useQueryClient>,
  notification: GenerationNotification,
) {
  queryClient.setQueryData<GenerationNotificationListResponse | undefined>(NOTIFICATIONS_QUERY_KEY, (current) => {
    if (!current || !Array.isArray(current.items)) return current;
    if (current.items.some((item) => item.id === notification.id)) return current;
    return {
      ...current,
      items: [notification, ...current.items],
      unread_count: notification.read ? current.unread_count : current.unread_count + 1,
    };
  });
}
