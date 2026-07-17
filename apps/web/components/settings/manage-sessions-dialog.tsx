'use client';

import { useCallback, useEffect, useState } from 'react';
import { Monitor, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { apiClient } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useLocale } from '@/hooks/use-locale';
import type { SessionResponse } from '@/lib/api/types';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Notifies the parent that the active-session count may have changed. */
  readonly onChanged?: () => void;
}

export function ManageSessionsDialog({ open, onClose, onChanged }: Props) {
  const { locale, t } = useLocale();
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await apiClient.listSessions());
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function revokeOne(sessionId: string) {
    setBusyId(sessionId);
    setError(null);
    try {
      await apiClient.revokeSession(sessionId);
      await load();
      onChanged?.();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    setBusyId('__others__');
    setError(null);
    try {
      await apiClient.revokeOtherSessions();
      await load();
      onChanged?.();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusyId(null);
    }
  }

  function formatWhen(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? iso
      : date.toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const hasOthers = sessions.some((session) => !session.is_current);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.account.sessionsTitle')}
      description={t('settings.account.sessionsDescription')}
      icon={<Monitor className="h-5 w-5 text-[color:var(--accent)]" />}
      busy={busyId !== null}
      footer={
        <Button
          variant="secondary"
          onClick={() => void revokeOthers()}
          disabled={!hasOthers || busyId !== null}
          loading={busyId === '__others__'}
        >
          {t('settings.account.revokeOtherSessions')}
        </Button>
      }
    >
      {loading ? (
        <p className="ds-caption">{t('settings.account.sessionsLoading')}</p>
      ) : sessions.length === 0 ? (
        <p className="ds-caption">{t('settings.account.sessionsEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li
              key={session.session_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[color:var(--text)]">
                    {session.device_label ?? t('settings.account.unknownDevice')}
                  </p>
                  {session.is_current ? (
                    <Badge tone="success">{t('settings.account.currentSession')}</Badge>
                  ) : null}
                </div>
                <p className="ds-caption t-mono">
                  {(session.ip_address ?? '—')} · {formatWhen(session.last_seen_at)}
                </p>
              </div>
              {session.is_current ? (
                <span className="flex items-center gap-1 text-xs text-[color:var(--muted)]">
                  <ShieldCheck className="h-3.5 w-3.5" /> {t('settings.account.thisDevice')}
                </span>
              ) : (
                <Button
                  variant="ghost"
                  className="text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                  onClick={() => void revokeOne(session.session_id)}
                  loading={busyId === session.session_id}
                  disabled={busyId !== null}
                >
                  {t('settings.account.revokeSession')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="mt-3 ds-caption text-[color:var(--danger)]">
          {getApiErrorMessage(error, t('settings.account.sessionsError'))}
        </p>
      ) : null}
    </Modal>
  );
}
