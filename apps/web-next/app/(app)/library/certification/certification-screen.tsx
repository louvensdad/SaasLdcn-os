'use client';

import { useQuery } from '@tanstack/react-query';

import { EvidenceLine } from '@/components/evidence-line';
import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function CertificationScreen() {
  const { t, locale } = useI18n();
  const compositions = useQuery({ queryKey: ['compositions'], queryFn: api.compositions, retry: false });
  const cognitive = useQuery({ queryKey: ['cognitive-certifications'], queryFn: api.cognitiveCertifications, retry: false });
  const packs = useQuery({ queryKey: ['language-packs'], queryFn: api.languagePacks, retry: false });

  const languages = (packs.data?.languages ?? []) as readonly Record<string, unknown>[];
  /** Every axis any run measured, in one stable order: a role that was not measured on an axis shows the gap. */
  const axes = [...new Set((cognitive.data?.roles ?? []).flatMap((run) => Object.keys(run.axes)))].sort();
  const breakable = (name: string) => name.replace(/_/g, '_​');

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.library')}</span></div>
          <h1 className="title">{t('certification.title')}</h1>
          <p className="lede">{t('certification.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('certification.compositions.title')}</h2>
          <span className="meta">{t('certification.compositions.meta', { count: compositions.data?.compositions.length ?? 0 })}</span>
        </div>
        {compositions.isPending ? <Skeleton lines={4} /> : null}
        {compositions.isError ? <StateBlock kind="error" title={t('certification.unreadable')} /> : null}
        {compositions.data && compositions.data.compositions.length === 0 ? (
          <StateBlock kind="empty" title={t('certification.compositions.none')}>{t('certification.compositions.noneBody')}</StateBlock>
        ) : null}
        <div className="stack">
          {(compositions.data?.compositions ?? []).map((composition) => (
            <section className="panel" key={`${composition.id}-${composition.mode}`}>
              <div className="panel-head">
                <h3 className="h-sub mono">{composition.id}</h3>
                <Badge value={composition.verdict} family={familyFor(composition.verdict)} />
                <span className="chip mono">{composition.mode}</span>
                <span className="meta">{formatWhen(composition.executed_at, locale)}</span>
              </div>
              <div className="panel-body stack">
                <EvidenceLine
                  label={composition.id}
                  size="sm"
                  stations={composition.checks.map((check) => ({ id: check.dimension, name: check.dimension, state: check.status, family: familyFor(check.status) }))}
                />
                <div className="list">
                  {composition.checks.map((check) => (
                    <div className="li" key={check.dimension}>
                      <Signal family={familyFor(check.status)} label={check.dimension} />
                      <span className="li-title mono">{check.dimension}</span>
                      <span className="meta mono">{check.status}</span>
                      {check.detail ? <span className="li-sub">{check.detail}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
        <p className="meta" style={{ marginTop: 10 }}>{t('certification.compositions.note')}</p>
        <Source>GET /api/workforce/compositions</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('certification.cognitive.title')}</h2>
          <span className="meta">{t('certification.cognitive.meta', { roles: cognitive.data?.roles.length ?? 0, runs: cognitive.data?.totalRuns ?? 0 })}</span>
        </div>
        {cognitive.isPending ? <Skeleton lines={4} /> : null}
        {cognitive.isError ? <StateBlock kind="error" title={t('certification.unreadable')} /> : null}
        {cognitive.data && cognitive.data.roles.length === 0 ? (
          <StateBlock kind="empty" title={t('certification.cognitive.none')}>{t('certification.cognitive.noneBody')}</StateBlock>
        ) : null}
        {cognitive.data && cognitive.data.roles.length > 0 ? (
          <div className="tbl-wrap">
            <table className="tbl axis-matrix">
              <caption className="sr-only">{t('certification.matrix.caption')}</caption>
              <thead>
                <tr>
                  <th>{t('certification.cognitive.role')}</th>
                  <th>{t('certification.cognitive.verdict')}</th>
                  {axes.map((axis) => <th key={axis} className="axis-head" scope="col">{breakable(axis)}</th>)}
                  <th>{t('certification.cognitive.when')}</th>
                </tr>
              </thead>
              <tbody>
                {cognitive.data.roles.map((run) => (
                  <tr key={run.runId}>
                    <td><strong className="mono">{run.roleId}</strong><div className="id dev-only">{run.runId}</div></td>
                    <td><Badge value={run.verdict} family={familyFor(run.verdict)} /></td>
                    {axes.map((axis) => {
                      const result = run.axes[axis];
                      if (!result) {
                        return (
                          <td key={axis} className="axis-cell">
                            <span className="mcell is-missing" title={t('certification.matrix.notMeasured')}>
                              <Signal family="na" label={t('certification.matrix.notMeasured')} />
                            </span>
                          </td>
                        );
                      }
                      const family = familyFor(result.status);
                      return (
                        <td key={axis} className="axis-cell">
                          <span className={`mcell f-${family}`} title={result.failedChecks.length > 0 ? result.failedChecks.join(', ') : result.model}>
                            <Signal family={family} label={`${axis}: ${result.status}`} />
                            <span className="mono">{result.depth}</span>
                          </span>
                        </td>
                      );
                    })}
                    <td className="meta nowrap">{formatWhen(run.finishedAt || run.startedAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('certification.cognitive.note')}</p>
        <Source>GET /api/workforce/cognitive-certifications</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('certification.languages.title')}</h2>
          <span className="meta">{t('certification.languages.meta', { count: languages.length })}</span>
        </div>
        {packs.isPending ? <Skeleton lines={3} /> : null}
        {languages.length > 0 ? (
          <div className="chips">
            {languages.map((pack, index) => {
              const id = String(pack.language ?? pack.id ?? index);
              const status = String(pack.status ?? pack.state ?? 'unknown');
              return (
                <span className="chip" key={id}>
                  <Signal family={familyFor(status)} label={id} />
                  <b>{id}</b> {status}
                </span>
              );
            })}
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('certification.languages.note')}</p>
        <Source>GET /api/workforce/languages</Source>
      </section>
    </>
  );
}
