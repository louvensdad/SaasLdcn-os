'use client';

import { useEffect, useRef } from 'react';

import { useLocale } from '@/hooks/use-locale';
import { useNotifications } from '@/hooks/use-notifications';
import { maybeShowBrowserNotification, notificationMessageKey, notificationTitleKey } from '@/lib/notifications';
import { useInterfacePreferencesStore } from '@/stores/use-interface-preferences-store';

/** Mounted once, globally (AppShell) -- diffs each notifications poll/push
 * against what's already been seen and fires a native browser notification
 * for genuinely new, allowlisted ones when the user opted in. The first load
 * only records a baseline (never fires for the user's existing inbox on
 * mount/login). */
export function useNotificationSideEffects(enabled: boolean) {
  const { data } = useNotifications(enabled);
  const { t } = useLocale();
  const browserNotificationsEnabled = useInterfacePreferencesStore((state) => state.browserNotificationsEnabled);
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled) {
      seenIds.current = null;
      return;
    }
    // A malformed or unexpected response shape (e.g. a route that hasn't
    // implemented this endpoint yet) must never crash this globally-mounted
    // effect -- guard defensively rather than assuming `items` is an array.
    const items = Array.isArray(data?.items) ? data.items : null;
    if (!items) return;
    if (seenIds.current === null) {
      seenIds.current = new Set(items.map((item) => item.id));
      return;
    }
    for (const notification of items) {
      if (seenIds.current.has(notification.id)) continue;
      seenIds.current.add(notification.id);
      if (!browserNotificationsEnabled) continue;
      maybeShowBrowserNotification(
        notification,
        t(notificationTitleKey(notification.type)),
        t(notificationMessageKey(notification.type), notification.stage ? { stage: notification.stage } : undefined),
      );
    }
  }, [data, enabled, browserNotificationsEnabled, t]);
}
