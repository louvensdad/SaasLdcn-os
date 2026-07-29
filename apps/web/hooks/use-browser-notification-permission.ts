'use client';

import { useCallback, useEffect, useState } from 'react';

export type BrowserNotificationPermission = 'unsupported' | 'default' | 'granted' | 'denied';

function readPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Thin wrapper over the real, live Notification.permission -- never a
 * cached/assumed value, since the OS-level grant can change outside this app
 * (e.g. the user revokes it from browser settings) and must never be
 * silently treated as still granted. */
export function useBrowserNotificationPermission() {
  const [permission, setPermission] = useState<BrowserNotificationPermission>('default');

  useEffect(() => {
    setPermission(readPermission());
  }, []);

  const requestPermission = useCallback(async (): Promise<BrowserNotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  return { permission, requestPermission };
}
