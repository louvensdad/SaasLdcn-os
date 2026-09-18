'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { AxisRing } from '@/components/drawings/org-chart';
import { Signal } from '@/components/signal';
import { Badge, Kv, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { runAxes } from '@/lib/company/org-chart';
import { familyFor } from '@/lib/status';

export function AgentScreen({ projectKey, jobId, instanceId }: {
  readonly projectKey: string;
  readonly jobId: string;
  readonly instanceId: string;
}) {
  const { t, locale } = useI18n();
  const base = `/p/${encodeURIComponent(projectKey)}/missions/${encodeURIComponent(jobId)}`;
  const agent = useQuery({ queryKey: ['agent', jobId, instanceId], queryFn: () => api.agent(jobId, instanceId), retry: false });
  const cognitive = useQuery({ queryKey: ['cognitive-certifications'], queryFn: api.cognitiveCertifications, retry: false });

  if (agent.isPending) return <Skeleton lines={6} />;
  if (!agent.data) {
    return (
      <PageState title={t('company.title')} kind="unknown" stateTitle={t('agent.none')} action={<div className="btn-row"><Link className="btn btn-ghost btn-sm" href={`${base}/company`}>{t('company.title')}</Link></div>}>
        {t('agent.noneBody', { id: instanceId })}
      </PageState>
    );
  }

  const data = agent.data;
  const tokens = data.executions.reduce((sum, execution) => sum + execution.input_tokens + execution.output_tokens, 0);
  const run = cognitive.data?.roles.find((entry) => entry.roleId === data.definition_id) ?? null;
  const axes = runAxes(run);
  const heaviest = Math.max(1, ...data.executions.map((execution) => execution.input_tokens + execution.output_tokens));

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('agent.eyebrow')}</span>
            <span className="chip mono">{data.instance_id}</span>
            <Badge value={data.certification} family={familyFor(data.certification)} />
          </div>
          <h1 className="title">{data.title}</h1>
          <p className="lede">{t('agent.lede', { definition: data.definition_id, version: data.definition_version })}</p>
        </div>
        <div className="btn-row"><Link className="btn btn-ghost" href={`${base}/company`}>{t('agent.backToCompany')}</Link></div>
      </div>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('agent.record.title')}</h2></div>
          <Kv
            pairs={[
              [t('agent.record.team'), <span key="t" className="mono">{data.team_key ?? '—'}</span>],
              [t('agent.record.membership'), <span key="m" className="mono">{data.membership_type}</span>],
              [t('agent.record.hired'), formatWhen(data.hired_at, locale)],
              [t('agent.record.released'), data.released_at ? formatWhen(data.released_at, locale) : t('agent.record.stillHired')],
              [t('agent.record.competencies'), <span key="c" className="chips">{data.competencies.map((item) => <span className="chip mono" key={item}>{item}</span>)}</span>],
            ]}
          />
          <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/agents/{'{'}instance_id{'}'}</Source>
        </section>

        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('agent.certification.title')}</h2></div>
          <Kv
            pairs={[
              [t('agent.certification.current'), <Badge key="c" value={data.certification} family={familyFor(data.certification)} />],
              [t('agent.certification.derived'), <Badge key="d" value={data.certification_derived} family={familyFor(data.certification_derived)} />],
              [t('agent.certification.source'), <span key="s" className="mono">{data.certification_source}</span>],
              [t('agent.certification.reliability'), <Badge key="r" value={data.reliability} family={familyFor(data.reliability)} />],
            ]}
          />
          <p className="meta" style={{ marginTop: 8 }}>{t('agent.certification.note')}</p>
        </section>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('agent.cognitive.title')}</h2>
          {run ? <Badge value={run.verdict} family={familyFor(run.verdict)} /> : null}
        </div>
        {cognitive.isPending ? <Skeleton lines={3} /> : null}
        {cognitive.isError ? <StateBlock kind="error" title={t('certification.unreadable')} /> : null}
        {cognitive.isSuccess && !run ? <StateBlock kind="empty" title={t('org.ringNone')} /> : null}
        {run ? (
          <div className="agent-cognitive">
            <div className="agent-ring" role="img" aria-label={t('org.ring', { passed: axes.filter((axis) => axis.family === 'proof').length, total: axes.length })}>
              <AxisRing run={run} size={112} />
            </div>
            <div className="list">
              {axes.map((axis) => {
                const result = run.axes[axis.axis]!;
                return (
                  <div className="li" key={axis.axis}>
                    <Signal family={axis.family} label={axis.status} />
                    <span className="li-title mono">{axis.axis}</span>
                    <span className="meta mono">{axis.status} · {result.depth}</span>
                    {result.failedChecks.length > 0 ? <span className="li-sub mono">{result.failedChecks.join(', ')}</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        <Source>GET /api/workforce/cognitive-certifications</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('agent.executions.title')}</h2>
          <span className="meta">{t('agent.executions.meta', { count: data.executions.length, tokens })}</span>
        </div>
        {data.executions.length === 0 ? (
          <StateBlock kind="empty" title={t('agent.executions.none')}>{t('agent.executions.noneBody')}</StateBlock>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <caption className="sr-only">{t('agent.executions.title')}</caption>
              <thead>
                <tr>
                  <th>{t('company.executions.stage')}</th>
                  <th>{t('company.executions.status')}</th>
                  <th>{t('company.executions.model')}</th>
                  <th className="r">{t('company.executions.tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {data.executions.map((execution) => (
                  <tr key={execution.id}>
                    <td className="id">{execution.stage}<div className="id">{execution.blueprint_ref ?? '—'}</div></td>
                    <td><Badge value={execution.status} family={familyFor(execution.status)} /></td>
                    <td className="id">
                      {execution.model ?? execution.provider ?? '—'}
                      {execution.served_by_fallback ? <> · <Badge value="FALLBACK" family="caution" /></> : null}
                    </td>
                    <td className="r">
                      <span className="token-bar" aria-hidden="true">
                        <span className={`f-${familyFor(execution.status)}`} style={{ width: `${Math.round(((execution.input_tokens + execution.output_tokens) / heaviest) * 100)}%` }} />
                      </span>
                      {execution.input_tokens} / {execution.output_tokens}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
