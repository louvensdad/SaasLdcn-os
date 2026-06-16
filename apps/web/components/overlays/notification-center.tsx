'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, CheckCheck, Inbox, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/use-ui-store';
import type { NotificationTone } from '@/lib/notifications';

const toneDot: Record<NotificationTone, string> = {
  success: 'bg-[color:var(--success)]',
  warning: 'bg-[color:var(--warning)]',
  error: 'bg-[color:var(--danger)]',
  info: 'bg-[color:var(--accent)]',
};

export function NotificationCenter() {
  const notifications = useUiStore((state) => state.notifications);
  const open = useUiStore((state) => state.notificationCenterOpen);
  const toggleNotificationCenter = useUiStore((state) => state.toggleNotificationCenter);
  const closeNotificationCenter = useUiStore((state) => state.closeNotificationCenter);
  const markNotificationsRead = useUiStore((state) => state.markNotificationsRead);
  const shouldReduceMotion = useReducedMotion();
  const { t } = useLocale();
  const unread = notifications.filter((notification) => notification.unread).length;

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
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[color:var(--accent)] shadow-[0_0_14px_var(--glow)]" />
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

            {notifications.length ? (
              <div className="mt-4 space-y-2">
                {notifications.map((notification) => (
                  <div key={notification.id} className="rounded-2xl border border-[color:var(--border)] bg-white/5 p-3">
                    <div className="flex items-start gap-3">
                      <span className={cn('mt-1 h-2 w-2 rounded-full shadow-[0_0_12px_var(--glow)]', toneDot[notification.tone])} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[color:var(--text)]">{notification.title}</p>
                          {notification.unread ? <Badge>{t('notifications.new')}</Badge> : null}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{notification.description}</p>
                        <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--muted)]">{notification.timestamp}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="secondary" className="w-full" onClick={markNotificationsRead}>
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
