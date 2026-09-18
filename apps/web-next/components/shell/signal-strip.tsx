'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { Signal } from '@/components/signal';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

/**
 * The signal strip: the latest events the backend recorded, one line each. A signal that arrived since the last read
 * glows once and settles (1.6 s); nothing here loops or pulses to look busy.
 */
export function SignalStrip() {
  const { t, locale } = useI18n();
  const feed = useQuery({ queryKey: ['activity-strip'], queryFn: () => api.activity({}), refetchInterval: 60_000, retry: false });
  const items = (feed.data?.items ?? []).slice(0, 5);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!feed.data) return;
    const ids = feed.data.items.slice(0, 5).map((item) => item.id);
    if (seen.current) {
      const arrived = ids.filter((id) => !seen.current!.has(id));
      if (arrived.length > 0) {
        setFresh(new Set(arrived));
        const timer = window.setTimeout(() => setFresh(new Set()), 1700);
        ids.forEach((id) => seen.current!.add(id));
        return () => window.clearTimeout(timer);
      }
    } else {
      seen.current = new Set(ids);
    }
    return undefined;
  }, [feed.data]);

  return (
    <footer className="strip" aria-label={t('strip.label')}>
      <span className="strip-label"><Signal family={items.length > 0 ? 'idle' : 'unknown'} />{t('strip.label')}</span>
      <span className="strip-items">
        {feed.isError ? <span className="strip-item muted">{t('strip.unreadable')}</span> : null}
        {!feed.isError && !feed.isPending && items.length === 0 ? <span className="strip-item muted">{t('strip.empty')}</span> : null}
        {items.map((item) => (
          <span key={item.id} className={`strip-item${fresh.has(item.id) ? ' is-fresh' : ''}`}>
            <span className="strip-time num">{formatWhen(item.occurred_at, locale)}</span>
            <Signal family={familyFor(item.status)} label={item.status} />
            <span className="strip-text">{item.action}<span className="muted"> · {item.category}</span></span>
          </span>
        ))}
      </span>
    </footer>
  );
}
