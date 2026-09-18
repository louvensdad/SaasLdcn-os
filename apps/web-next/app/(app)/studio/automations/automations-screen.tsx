'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Signal } from '@/components/signal';
import { Badge, Kv, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function AutomationsScreen() {
  const { t, locale } = useI18n();
  const [automationId, setAutomationId] = useState<string | null>(null);

  const automations = useQuery({ queryKey: ['automations'], queryFn: api.automations, retry: false });
  const rows = (automations.data ?? []).filter((automation) => automation.status !== 'archived');
  const selected = automationId ?? rows[0]?.id ?? null;
  const current = rows.find((automation) => automation.id === selected) ?? null;

  const runs = useQuery({
    queryKey: ['automation-runs', selected],
    queryFn: () => api.automationRuns(selected as string),
    enabled: Boolean(selected),
    retry: false,
  });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.studio')}</span></div>
          <h1 className="title">{t('automations.title')}</h1>
          <p className="lede">{t('automations.lede')}</p>
        </div>
      </div>

      <div className="grid g-side-main g-start">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h-sub">{t('automations.list.title')}</h2>
            <span className="meta">{t('automations.list.meta', { count: rows.length })}</span>
          </div>
          <div className="panel-body">
            {automations.isPending ? <Skeleton lines={4} /> : null}
            {automations.isError ? <StateBlock kind="error" title={t('automations.unreadable')}>{t('automations.unreadableBody')}</StateBlock> : null}
            {automations.data && rows.length === 0 ? (
              <StateBlock kind="empty" title={t('automations.list.none')}>{t('automations.list.noneBody')}</StateBlock>
            ) : null}
            <div className="list">
              {rows.map((automation) => (
                <button
                  className="li li-pick"
                  key={automation.id}
                  type="button"
                  aria-current={automation.id === selected}
                  onClick={() => setAutomationId(automation.id)}
                >
                  <Signal family={familyFor(automation.status)} label={automation.status} />
                  <span className="li-title">{automation.title}</span>
                  <Badge value={automation.status} family={familyFor(automation.status)} />
                  <span className="li-sub">{automation.description || t('automations.list.noDescription')}</span>
                </button>
              ))}
            </div>
            <Source>GET /api/automations</Source>
          </div>
        </section>

        <div className="stack">
          {current ? (
            <section className="panel">
              <div className="panel-head">
                <h2 className="h-sub">{t('automations.detail.title')}</h2>
                <Badge value={current.status} family={familyFor(current.status)} />
              </div>
              <div className="panel-body stack">
                <Kv
                  pairs={[
                    [t('automations.detail.trigger'), <span className="mono" key="trigger">{current.trigger_type}</span>],
                    [t('automations.detail.schedule'), current.trigger_config.cron
                      ? <span className="mono" key="cron">{current.trigger_config.cron} · {current.trigger_config.timezone}</span>
                      : t('automations.detail.noSchedule')],
                    [t('automations.detail.next'), current.next_run_at ? formatWhen(current.next_run_at, locale) : t('automations.detail.noNext')],
                    [t('automations.detail.action'), <span className="mono" key="action">{current.action_config.method} {current.action_config.url}</span>],
                  ]}
                />
                <p className="meta">{t('automations.detail.note')}</p>
                <Source>GET /api/automations/{'{'}automation_id{'}'}</Source>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-head">
              <h2 className="h-sub">{t('automations.runs.title')}</h2>
              <span className="meta">{t('automations.runs.meta', { count: runs.data?.length ?? 0 })}</span>
            </div>
            <div className="panel-body">
              {!selected ? <p className="meta">{t('automations.runs.pick')}</p> : null}
              {runs.isPending && selected ? <Skeleton lines={3} /> : null}
              {runs.isError ? <p className="meta">{t('automations.unreadableBody')}</p> : null}
              {runs.data && runs.data.length === 0 ? <p className="meta">{t('automations.runs.none')}</p> : null}
              <div className="list">
                {(runs.data ?? []).map((run) => (
                  <div className="li" key={run.id}>
                    <Signal family={familyFor(run.status)} label={run.status} />
                    <span className="li-title mono">{run.status}</span>
                    <span className="meta">{formatWhen(run.started_at, locale)}</span>
                    <span className="li-sub">
                      {run.error
                        ? run.error
                        : t('automations.runs.row', {
                            code: run.response_status_code ?? '—',
                            ms: run.duration_ms ?? '—',
                          })}
                    </span>
                    <div className="chips">
                      <span className="chip mono">{run.trigger_source}</span>
                      {run.retry_count > 0 ? <span className="chip mono">{t('automations.runs.retries', { count: run.retry_count })}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
              <p className="meta">{t('automations.runs.note')}</p>
              <Source>GET /api/automations/{'{'}automation_id{'}'}/runs</Source>
            </div>
          </section>
        </div>
      </div>

      <p className="meta" style={{ marginTop: 16 }}>{t('automations.note')}</p>
    </>
  );
}
