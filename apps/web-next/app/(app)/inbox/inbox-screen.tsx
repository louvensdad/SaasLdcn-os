'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { DecisionCard } from '@/components/decision-card';
import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';
import type { DecisionKind } from '@/lib/work/decisions';
import { useWork } from '@/lib/work/use-work';

type Filter = 'all' | DecisionKind;
const FILTERS: readonly Filter[] = ['all', 'room', 'job', 'change'];

export function InboxScreen() {
  const { t, locale } = useI18n();
  const { decisions, unreadable, pending } = useWork();
  const [filter, setFilter] = useState<Filter>('all');
  const queryClient = useQueryClient();

  const presence = useQuery({ queryKey: ['presence-decisions'], queryFn: () => api.presenceDecisions({ limit: 6 }) });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => api.notifications({ limit: 8 }) });
  const markRead = useMutation({
    mutationFn: api.markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const shown = filter === 'all' ? decisions : decisions.filter((decision) => decision.kind === filter);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.inbox')}</span></div>
          <h1 className="title">{t('inbox.title')}</h1>
          <p className="lede">{t('inbox.lede')}</p>
        </div>
        <div className="btn-row">
          <div className="seg" role="group" aria-label={t('nav.inbox')}>
            {FILTERS.map((value) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {t(`inbox.filter.${value}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {unreadable.length > 0 ? <p className="meta">{t('command.unreadable', { sources: unreadable.join(' · ') })}</p> : null}

      <div className="grid g-main-side">
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('inbox.count', { count: shown.length })}</h2>
          </div>
          {pending ? <Skeleton lines={5} /> : null}
          {!pending && shown.length === 0 ? (
            <StateBlock kind="empty" title={t('inbox.empty')}>{t('inbox.emptyBody')}</StateBlock>
          ) : null}
          <div className="stack">
            {shown.map((decision) => <DecisionCard key={decision.id} decision={decision} />)}
          </div>
          <div className="panel" style={{ marginTop: 18 }}>
            <div className="panel-head"><h2 className="h-sub">{t('inbox.how.title')}</h2></div>
            <div className="panel-body stack">
              <p className="body ink2">{t('inbox.how.body')}</p>
              <Source>GET /api/project-rooms · GET /api/meta-factory/jobs · GET /api/change-requests</Source>
            </div>
          </div>
        </section>

        <div className="stack-lg">
          <section className="panel">
            <div className="panel-head">
              <h2 className="h-sub">{t('inbox.system.title')}</h2>
              <span className="meta">{t('inbox.system.meta')}</span>
            </div>
            <div className="panel-body">
              {presence.isPending ? <Skeleton lines={3} /> : null}
              {presence.isError ? <p className="meta">{t('inbox.system.error')}</p> : null}
              {presence.data && presence.data.items.length === 0 ? <p className="meta">{t('inbox.system.empty')}</p> : null}
              {presence.data && presence.data.items.length > 0 ? (
                <div className="list">
                  {presence.data.items.map((item) => (
                    <div className="li" key={item.id}>
                      <Signal family={familyFor(item.severity)} label={item.title} />
                      <span className="li-title">{item.title}</span>
                      <span className="meta num">{formatWhen(item.occurredAt, locale)}</span>
                      <span className="li-sub">
                        <span className="mono">{item.category} · {item.status} · {item.importance}</span>
                        {item.summary ? ` — ${item.summary}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              <Source>GET /api/system/presence/decisions · severity, importance</Source>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="h-sub">{t('inbox.notifications.title')}</h2>
              {notifications.data ? <span className="meta">{t('inbox.notifications.unread', { count: notifications.data.unread_count })}</span> : null}
              <div className="actions">
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  disabled={markRead.isPending || !notifications.data || notifications.data.unread_count === 0}
                  onClick={() => markRead.mutate()}
                >
                  {t('inbox.notifications.markRead')}
                </button>
              </div>
            </div>
            <div className="panel-body">
              {notifications.isPending ? <Skeleton lines={3} /> : null}
              {notifications.isError ? <p className="meta">{t('inbox.notifications.error')}</p> : null}
              {notifications.data && notifications.data.items.length === 0 ? <p className="meta">{t('inbox.notifications.empty')}</p> : null}
              {notifications.data && notifications.data.items.length > 0 ? (
                <div className="list">
                  {notifications.data.items.map((item) => (
                    <div className="li" key={item.id}>
                      <Signal family={familyFor(item.severity)} label={item.type} />
                      <span className="li-title mono">{item.type}</span>
                      <span className="meta num">{formatWhen(item.created_at, locale)}</span>
                      <span className="li-sub">
                        <Badge value={item.severity} family={familyFor(item.severity)} />
                        {item.stage ? <span className="mono"> · {item.stage}</span> : null}
                        <span className="mono"> · read={String(item.read)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              <Source>GET /api/notifications · type, severity, read</Source>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
