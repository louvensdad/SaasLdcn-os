'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Kv, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatCount, formatUsd, formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';

export function DecisionTracesScreen() {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const traces = useQuery({ queryKey: ['decision-traces'], queryFn: api.decisionTraces, retry: false });

  const trace = (traces.data ?? []).find((entry) => entry.id === selected) ?? traces.data?.[0] ?? null;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.platform')}</span></div>
          <h1 className="title">{t('traces.title')}</h1>
          <p className="lede">{t('traces.lede')}</p>
        </div>
      </div>

      {traces.isPending ? <Skeleton lines={5} /> : null}
      {traces.isError ? <StateBlock kind="error" title={t('traces.unreadable')} /> : null}
      {traces.data && traces.data.length === 0 ? (
        <StateBlock kind="empty" title={t('traces.none')}>{t('traces.noneBody')}</StateBlock>
      ) : null}

      {traces.data && traces.data.length > 0 ? (
        <div className="grid g-main-side">
          <section className="sec">
            <div className="sec-head">
              <h2 className="h-sec">{t('traces.list.title')}</h2>
              <span className="meta">{t('traces.list.meta', { count: traces.data.length })}</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('traces.col.model')}</th>
                    <th>{t('traces.col.role')}</th>
                    <th className="r">{t('traces.col.tokens')}</th>
                    <th className="r">{t('traces.col.latency')}</th>
                    <th className="r">{t('traces.col.cost')}</th>
                    <th>{t('traces.col.when')}</th>
                  </tr>
                </thead>
                <tbody>
                  {traces.data.map((entry) => (
                    <tr key={entry.id} className="is-link" onClick={() => setSelected(entry.id)}>
                      <td><strong className="mono">{entry.model}</strong><div className="id">{entry.provider}</div></td>
                      <td className="id">{entry.agent_role ?? '—'}</td>
                      <td className="r">{formatCount(entry.input_tokens + entry.output_tokens, locale)}</td>
                      <td className="r">{Math.round(entry.latency_ms)} ms</td>
                      <td className="r">{formatUsd(entry.estimated_cost_usd, locale)}</td>
                      <td className="meta nowrap">{formatWhen(entry.created_at, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Source>GET /api/observability/decisions</Source>
          </section>

          <section className="panel">
            <div className="panel-head"><h2 className="h-sub">{t('traces.detail.title')}</h2></div>
            <div className="panel-body stack">
              {trace ? (
                <>
                  <Kv
                    pairs={[
                      [t('traces.detail.policy'), <span key="p" className="mono">{trace.selection_policy}</span>],
                      [t('traces.detail.strategy'), <span key="s" className="mono">{trace.model_strategy ?? '—'}</span>],
                      [t('traces.detail.project'), <span key="pr" className="mono">{trace.project_id ?? '—'}</span>],
                    ]}
                  />
                  <div>
                    <span className="label">{t('traces.detail.alternatives')}</span>
                    <div className="list" style={{ marginTop: 6 }}>
                      {trace.alternatives.length === 0 ? <p className="meta">{t('traces.detail.noAlternatives')}</p> : null}
                      {trace.alternatives.map((alternative, index) => (
                        <div className="li" key={`${alternative.model}-${index}`}>
                          <span style={{ width: 16 }} />
                          <span className="li-title mono">{alternative.model}</span>
                          <span className="meta">
                            <Badge value={alternative.model === trace.model ? 'CHOSEN' : 'CANDIDATE'} family={alternative.model === trace.model ? 'proof' : 'idle'} />
                          </span>
                          <span className="li-sub mono">{alternative.policy}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="label">{t('traces.detail.context')}</span>
                    <div className="chips" style={{ marginTop: 6 }}>
                      {trace.context_used.map((item) => <span className="chip mono" key={item}>{item}</span>)}
                    </div>
                  </div>
                  <p className="meta">{t('traces.detail.note')}</p>
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
