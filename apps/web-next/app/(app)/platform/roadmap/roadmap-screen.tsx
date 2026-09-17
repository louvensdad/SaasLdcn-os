'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function RoadmapScreen() {
  const { t } = useI18n();
  const [category, setCategory] = useState('all');
  const roadmap = useQuery({ queryKey: ['roadmap'], queryFn: api.roadmap, retry: false });

  const items = useMemo(() => roadmap.data?.items ?? [], [roadmap.data]);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);
  const shown = category === 'all' ? items : items.filter((item) => item.category === category);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.platform')}</span></div>
          <h1 className="title">{t('roadmap.title')}</h1>
          <p className="lede">{t('roadmap.lede')}</p>
        </div>
      </div>

      {roadmap.isPending ? <Skeleton lines={5} /> : null}
      {roadmap.isError ? <StateBlock kind="error" title={t('roadmap.unreadable')} /> : null}

      {roadmap.data ? (
        <>
          {roadmap.data.platform_metrics.length > 0 ? (
            <div className="facts">
              {roadmap.data.platform_metrics.slice(0, 6).map((metric) => (
                <div className="fact" key={metric.id}>
                  <span className="label">{metric.label}</span>
                  <div className="v num">{metric.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          <section className="sec" style={{ marginTop: 18 }}>
            <div className="sec-head">
              <h2 className="h-sec">{t('roadmap.items.title')}</h2>
              <span className="meta">{t('roadmap.items.meta', { count: shown.length })}</span>
              <div className="actions seg" role="group" aria-label={t('roadmap.items.filter')}>
                <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{t('workforce.seats.all')}</button>
                {categories.slice(0, 6).map((value) => (
                  <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>
                ))}
              </div>
            </div>
            <div className="list">
              {shown.map((item) => (
                <div className="li" key={item.id}>
                  <Signal family={familyFor(item.status)} label={item.title} />
                  <span className="li-title">{item.title}</span>
                  <span className="meta"><Badge value={item.status} family={familyFor(item.status)} /></span>
                  <span className="li-sub">
                    <span className="mono">{item.category} · {item.progress}% · {item.release}</span>
                    {item.summary ? ` · ${item.summary}` : ''}
                  </span>
                </div>
              ))}
            </div>
            <Source>GET /api/roadmap</Source>
          </section>

          {roadmap.data.releases.length > 0 ? (
            <section className="sec">
              <div className="sec-head">
                <h2 className="h-sec">{t('roadmap.releases.title')}</h2>
                <span className="meta">{t('roadmap.releases.meta', { count: roadmap.data.releases.length })}</span>
              </div>
              <div className="list">
                {roadmap.data.releases.map((release) => (
                  <div className="li" key={release.id}>
                    <Signal family={familyFor(release.status)} label={release.title} />
                    <span className="li-title">{release.title}</span>
                    <span className="meta mono">{release.status} · {release.progress}%</span>
                    <span className="li-sub">{release.date}{release.features.length > 0 ? ` · ${release.features.length} features` : ''}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
