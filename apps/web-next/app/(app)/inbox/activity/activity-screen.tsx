'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { DayMap } from '@/components/drawings/day-map';
import { Pill, Toolbar } from '@/components/operate';
import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { statusLabel } from '@/lib/status';
import { familyFor } from '@/lib/status';

export function ActivityScreen() {
  const { t, tDynamic, locale } = useI18n();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const feed = useInfiniteQuery({
    queryKey: ['activity', category, search],
    queryFn: ({ pageParam }) => api.activity({ category: category || undefined, search: search || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const items = useMemo(() => (feed.data?.pages ?? []).flatMap((page) => page.items), [feed.data]);
  /** Only the categories that actually came back: no endpoint lists them. */
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.activity')}</span></div>
          <h1 className="title">{t('activity.title')}</h1>
          <p className="lede">{t('activity.lede')}</p>
        </div>
      </div>

      {/* One row of controls above the feed. The search reaches the backend, so it is submitted rather
          than typed live; the categories are only the ones that actually came back. */}
      <Toolbar
        view={{ query: draft, setQuery: (value) => { setDraft(value); if (!value) setSearch(''); } }}
        placeholder={t('activity.search')}
      >
        <Pill pressed={category === ''} onClick={() => setCategory('')}>{t('activity.filter.all')}</Pill>
        {categories.map((value) => (
          <Pill key={value} pressed={category === value} onClick={() => setCategory(value)}>{value}</Pill>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearch(draft.trim())}>{t('activity.searchGo')}</button>
      </Toolbar>

      {feed.isPending ? <Skeleton lines={6} /> : null}
      {feed.isError ? <StateBlock kind="error" title={t('activity.error')} /> : null}
      {!feed.isPending && !feed.isError && items.length === 0 ? <StateBlock kind="empty" title={t('activity.empty')} /> : null}

      {items.length > 0 ? <DayMap items={items} /> : null}

      {items.length > 0 ? (
        <div className="tbl-wrap" style={{ marginTop: 18 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('activity.col.event')}</th>
                <th>{t('activity.col.category')}</th>
                <th>{t('activity.col.status')}</th>
                <th>{t('activity.col.project')}</th>
                <th>{t('activity.col.when')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <Signal family={familyFor(item.status)} label={statusLabel(item.action, tDynamic)} />
                      <span>{statusLabel(item.action, tDynamic)}<span className="src">{item.action}</span></span>
                    </span>
                  </td>
                  <td>{item.category}</td>
                  <td><Badge value={item.status} family={familyFor(item.status)} /></td>
                  <td className="id">{item.project_id ?? '—'}</td>
                  <td className="meta nowrap">{formatWhen(item.occurred_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tablefoot">
            <span className="meta">{t('activity.showing', { shown: String(items.length) })}</span>
            {feed.hasNextPage ? <span className="meta">{t('activity.more')}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="row" style={{ gap: 12, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {feed.hasNextPage ? (
          <button className="btn btn-ghost btn-sm" type="button" disabled={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
            {feed.isFetchingNextPage ? t('common.loading') : t('activity.more')}
          </button>
        ) : null}
        <Source>GET /api/activity-feed · category, status, search, cursor</Source>
      </div>
    </>
  );
}
