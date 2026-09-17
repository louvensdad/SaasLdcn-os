'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { Signal } from '@/components/signal';
import { Badge, Kv, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function PlatformScreen() {
  const { t } = useI18n();
  const status = useQuery({ queryKey: ['system-status'], queryFn: api.systemStatus, retry: false });
  const ai = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus, retry: false });

  const data = status.data;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.platform')}</span></div>
          <h1 className="title">{t('platform.title')}</h1>
          <p className="lede">{t('platform.lede')}</p>
        </div>
        <div className="btn-row">
          <Link className="btn btn-ghost" href="/platform/decisions">{t('platform.decisions')}</Link>
          <Link className="btn btn-ghost" href="/platform/roadmap">{t('platform.roadmap')}</Link>
        </div>
      </div>

      {status.isPending ? <Skeleton lines={4} /> : null}
      {status.isError ? <StateBlock kind="error" title={t('platform.unreadable')} /> : null}

      {data ? (
        <>
          <section className="sec">
            <div className="sec-head"><h2 className="h-sec">{t('platform.signals.title')}</h2></div>
            <div className="list">
              {[data.backend_status, data.frontend_status, data.api_status, data.build_status].map((signal) => (
                <div className="li" key={signal.id}>
                  <Signal family={familyFor(signal.status)} label={signal.label} />
                  <span className="li-title">{signal.label}</span>
                  <span className="meta"><Badge value={signal.status} family={familyFor(signal.status)} /></span>
                  {signal.detail ? <span className="li-sub">{signal.detail}</span> : null}
                </div>
              ))}
            </div>
            <Kv
              pairs={[
                [t('platform.lastValidation'), data.last_validation],
                [t('platform.coverage'), data.test_coverage],
              ]}
            />
            <Source>GET /api/system-status</Source>
          </section>

          <div className="grid g-2">
            <section className="sec">
              <div className="sec-head">
                <h2 className="h-sec">{t('platform.registries.title')}</h2>
                <span className="meta">{t('platform.registries.meta', { count: data.registry_health.length })}</span>
              </div>
              <div className="list">
                {data.registry_health.map((signal) => (
                  <div className="li" key={signal.id}>
                    <Signal family={familyFor(signal.status)} label={signal.label} />
                    <span className="li-title">{signal.label}</span>
                    <span className="meta mono">{signal.status}</span>
                    {signal.detail ? <span className="li-sub">{signal.detail}</span> : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="sec">
              <div className="sec-head">
                <h2 className="h-sec">{t('platform.ai.title')}</h2>
                {ai.data ? <Badge value={ai.data.available ? 'AVAILABLE' : 'UNAVAILABLE'} family={ai.data.available ? 'proof' : 'caution'} /> : null}
              </div>
              {ai.isPending ? <Skeleton lines={2} /> : null}
              {ai.data ? (
                <>
                  <Kv
                    pairs={[
                      [t('settings.ai.provider'), <span key="p" className="mono">{ai.data.provider ?? '—'}</span>],
                      [t('settings.ai.model'), <span key="m" className="mono">{ai.data.model ?? '—'}</span>],
                      [t('settings.ai.reason'), ai.data.reason ?? '—'],
                    ]}
                  />
                  <Source>GET /api/ai-status</Source>
                </>
              ) : null}
            </section>
          </div>

          <section className="sec">
            <div className="sec-head"><h2 className="h-sec">{t('platform.active.title')}</h2></div>
            <div className="grid g-4">
              {([
                ['modules', data.active_modules],
                ['engines', data.active_engines],
                ['templates', data.active_templates],
                ['skills', data.active_skills],
              ] as const).map(([key, values]) => (
                <div key={key}>
                  <span className="label">{t(`platform.active.${key}`)} · {values.length}</span>
                  <div className="chips" style={{ marginTop: 6 }}>
                    {values.slice(0, 10).map((value) => <span className="chip mono" key={value}>{value}</span>)}
                    {values.length > 10 ? <span className="meta">+{values.length - 10}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
