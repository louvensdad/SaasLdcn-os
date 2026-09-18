'use client';

import { useQuery } from '@tanstack/react-query';

import { Icon } from '@/components/signal';
import { Badge, Kv, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { currentAppUrl } from '@/lib/routes';

export function ModernizeScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const latest = useQuery({ queryKey: ['modernize-latest'], queryFn: api.modernizeLatest, retry: false });

  const data = latest.data;
  const mine = data && (data.project_id === projectKey || !projectKey) ? data : data ?? null;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.modernize')}</span></div>
          <h1 className="title">{t('modernize.title')}</h1>
          <p className="lede">{t('modernize.lede')}</p>
        </div>
        <div className="btn-row">
          <a className="btn btn-primary ext-mark" href={currentAppUrl('/modernize')}>{t('modernize.import')} <Icon name="external" /></a>
        </div>
      </div>

      {latest.isPending ? <Skeleton lines={4} /> : null}
      {latest.isError ? <StateBlock kind="error" title={t('modernize.unreadable')} /> : null}
      {!latest.isPending && !mine ? (
        <StateBlock kind="empty" title={t('modernize.none')}>{t('modernize.noneBody')}</StateBlock>
      ) : null}

      {mine ? (
        <>
          <div className="facts">
            <div className="fact"><span className="label">{t('modernize.files')}</span><div className="v num">{mine.file_count}</div></div>
            <div className="fact"><span className="label">{t('modernize.size')}</span><div className="v num">{Math.round(mine.total_bytes / 1024)} kB</div></div>
            <div className="fact">
              <span className="label">{t('modernize.score')}</span>
              <div className="v num">{mine.overall_score ?? '—'}</div>
            </div>
            <div className="fact">
              <span className="label">{t('modernize.report')}</span>
              <div className="v">{mine.has_report ? t('modernize.reportYes') : t('modernize.reportNo')}</div>
            </div>
          </div>

          <section className="sec" style={{ marginTop: 20 }}>
            <div className="sec-head"><h2 className="h-sec">{t('modernize.what.title')}</h2></div>
            <Kv
              pairs={[
                [t('modernize.project'), <span key="p" className="mono">{mine.project_id}</span>],
                [t('modernize.source'), <Badge key="s" value={mine.source} family="idle" />],
                [t('modernize.stack'), mine.detected_stack
                  ? <span key="st" className="mono">{mine.detected_stack}</span>
                  : <span key="st" className="meta">{t('common.notYet')}</span>],
                [t('modernize.languages'), <span key="l" className="chips">{Object.entries(mine.languages).map(([language, count]) => (
                  <span className="chip mono" key={language}>{language} · {count}</span>
                ))}</span>],
                [t('modernize.updated'), formatWhen(mine.updated_at, locale)],
              ]}
            />
            <p className="meta" style={{ marginTop: 10 }}>{t('modernize.note')}</p>
            <Source>GET /api/modernize/projects/latest</Source>
          </section>
        </>
      ) : null}
    </>
  );
}
