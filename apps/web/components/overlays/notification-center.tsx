'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, CheckCheck, Inbox, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications';
import { cn } from '@/lib/cn';
import { notificationMessageKey, notificationTitleKey, notificationTone } from '@/lib/notifications';
import { useUiStore } from '@/stores/use-ui-store';
import type { GenerationNotification } from '@contracts/generation-notification.contract';
import type { NotificationTone } from '@/lib/notifications';

const toneDot: Record<NotificationTone, string> = {
  success: 'bg-[color:var(--success)]',
  warning: 'bg-[color:var(--warning)]',
  error: 'bg-[color:var(--danger)]',
  info: 'bg-[color:var(--accent)]',
};

type FilterTab = 'all' | 'unread' | 'completed' | 'failed' | 'actionNeeded';

const COMPLETED_TYPES = new Set(['TASK_COMPLETED', 'BUILD_COMPLETED']);
const FAILED_TYPES = new Set(['TASK_FAILED', 'TASK_STALLED']);
const ACTION_NEEDED_TYPES = new Set(['TASK_WAITING_USER']);

function matchesTab(notification: GenerationNotification, tab: FilterTab): boolean {
  switch (tab) {
    case 'unread': return !notification.read;
    case 'completed': return COMPLETED_TYPES.has(notification.type);
    case 'failed': return FAILED_TYPES.has(notification.type);
    case 'actionNeeded': return ACTION_NEEDED_TYPES.has(notification.type) || notification.severity === 'ACTION_REQUIRED';
    default: return true;
  }
}

/** Real elapsed time since an ISO timestamp -- never a fabricated ETA. */
function formatRelativeTime(t: (key: string, values?: Record<string, string | number>) => string, iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return t('notifications.relativeTime.now');
  if (minutes < 60) return t('notifications.relativeTime.minutesAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('notifications.relativeTime.hoursAgo', { count: hours });
  return t('notifications.relativeTime.daysAgo', { count: Math.round(hours / 24) });
}

export function NotificationCenter() {
  const open = useUiStore((state) => state.notificationCenterOpen);
  const toggleNotificationCenter = useUiStore((state) => state.toggleNotificationCenter);
  const closeNotificationCenter = useUiStore((state) => state.closeNotificationCenter);
  const shouldReduceMotion = useReducedMotion();
  const { t } = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<FilterTab>('all');

  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.items;
  const unread = data?.unread_count ?? 0;
  const visible = useMemo(() => (items ?? []).filter((item) => matchesTab(item, tab)), [items, tab]);

  const tabs: readonly { readonly id: FilterTab; readonly labelKey: string }[] = [
    { id: 'all', labelKey: 'notifications.tabs.all' },
    { id: 'unread', labelKey: 'notifications.tabs.unread' },
    { id: 'completed', labelKey: 'notifications.tabs.completed' },
    { id: 'failed', labelKey: 'notifications.tabs.failed' },
    { id: 'actionNeeded', labelKey: 'notifications.tabs.actionNeeded' },
  ];

  const handleSelect = (notification: GenerationNotification) => {
    if (!notification.read) markRead.mutate(notification.id);
    if (notification.action_url) {
      closeNotificationCenter();
      router.push(notification.action_url);
    }
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        className="search-surface relative h-11 w-11 rounded-[var(--radius-xl)] p-0"
        onClick={toggleNotificationCenter}
        aria-label={t('notifications.open')}
      >
        <Bell className="h-4 w-4" />
        {unread ? (
          <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--accent)] px-1 text-[10px] font-semibold leading-none text-white shadow-[0_0_14px_var(--glow)]">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            role="dialog"
            aria-label={t('notifications.center')}
            className="glass-panel-strong absolute right-0 top-14 z-[65] w-[calc(100vw-2rem)] max-w-sm rounded-[var(--radius-xl)] p-4 shadow-[var(--shadow-cinematic)]"
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : 8, scale: 0.98 }}
            transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 28 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[color:var(--text)]">{t('notifications.title')}</p>
                <p className="mt-1 text-xs text-[color:var(--muted)]">{t('notifications.description')}</p>
              </div>
              <Button type="button" variant="ghost" className="h-8 w-8 rounded-full p-0" onClick={closeNotificationCenter} aria-label={t('notifications.close')}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                    tab === item.id
                      ? 'bg-[color:var(--accent)] text-white'
                      : 'bg-white/5 text-[color:var(--muted)] hover:text-[color:var(--text)]',
                  )}
                >
                  {t(item.labelKey)}
                </button>
              ))}
            </div>

            {visible.length ? (
              <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">
                {visible.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleSelect(notification)}
                    className="w-full rounded-2xl border border-[color:var(--border)] bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full shadow-[0_0_12px_var(--glow)]', toneDot[notificationTone(notification.severity)])} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[color:var(--text)]">{t(notificationTitleKey(notification.type))}</p>
                          {!notification.read ? <Badge>{t('notifications.new')}</Badge> : null}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">
                          {t(notificationMessageKey(notification.type), notification.stage ? { stage: notification.stage } : undefined)}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">
                          {formatRelativeTime(t, notification.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => markAllRead.mutate()}
                  disabled={!unread || markAllRead.isPending}
                >
                  <CheckCheck className="h-4 w-4" />
                  {t('notifications.markRead')}
                </Button>
              </div>
            ) : (
              <div className="mt-6 rounded-[var(--radius-xl)] border border-dashed border-[color:var(--border)] p-6 text-center">
                <Inbox className="mx-auto h-6 w-6 text-[color:var(--muted)]" />
                <p className="mt-3 text-sm font-semibold text-[color:var(--text)]">{t('notifications.empty')}</p>
                <p className="mt-2 text-xs text-[color:var(--muted)]">{t('notifications.emptyDetail')}</p>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
