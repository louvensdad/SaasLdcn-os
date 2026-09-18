'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { Signal } from '@/components/signal';
import { Badge, GapChip, Kv, Live, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatBytes, formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function DataSessionScreen({ sessionId }: { readonly sessionId: string }) {
  const { t, locale } = useI18n();

  const session = useQuery({
    queryKey: ['analysis-session', sessionId],
    queryFn: () => api.analysisSession(sessionId),
    retry: false,
    /* A running job moves the journey forward; poll only while one is running. */
    refetchInterval: (query) => (query.state.data?.runningJob?.status === 'RUNNING' ? 4000 : false),
  });
  const datasets = useQuery({ queryKey: ['analysis-datasets', sessionId], queryFn: () => api.analysisDatasets(sessionId), retry: false });
  const agents = useQuery({ queryKey: ['analysis-agents', sessionId], queryFn: () => api.analysisAgents(sessionId), retry: false });
  const governance = useQuery({ queryKey: ['analysis-governance', sessionId], queryFn: () => api.analysisGovernance(sessionId), retry: false });

  const data = session.data;
  const job = data?.runningJob ?? null;
  const steps = data?.steps ?? [];

  if (session.isPending) return <Skeleton lines={8} />;
  if (session.isError || !data) {
    return (
      <PageState
        title={t('nav.data')}
        kind="error"
        stateTitle={t('session.unreadable')}
        action={<Link className="btn btn-quiet btn-sm" href="/studio/data">{t('session.back')}</Link>}
      >
        {t('session.unreadableBody')}
      </PageState>
    );
  }

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.data')}</span>
            <Badge value={data.status} family={familyFor(data.status)} />
            <span className="chip mono">{data.executionMode}</span>
          </div>
          <h1 className="title">{data.objectiveText || t('data.sessions.noObjective')}</h1>
          <p className="lede mono">{data.id}</p>
        </div>
        <div className="btn-row">
          <Link className="btn btn-quiet" href="/studio/data">{t('session.back')}</Link>
        </div>
      </div>

      {data.error ? (
        <Notice family="fault" title={t('session.error.title')}>
          <code className="mono">{JSON.stringify(data.error)}</code>
        </Notice>
      ) : null}

      {job ? (
        <section className="panel">
          <div className="panel-head">
            <h2 className="h-sub">{t('session.job.title')}</h2>
            <Live state={job.status === 'RUNNING' ? 'live' : 'snapshot'}>
              <Badge value={job.status} family={familyFor(job.status)} />
            </Live>
          </div>
          <div className="panel-body stack">
            <Kv
              pairs={[
                [t('session.job.operation'), <span className="mono" key="op">{job.operation}</span>],
                [t('session.job.stage'), <span className="mono" key="stage">{job.stage}</span>],
                [t('session.job.progress'), `${job.progress}%`],
                [t('session.job.agent'), job.currentAgent ?? t('session.job.noAgent')],
                [t('session.job.elapsed'), t('session.job.seconds', { value: Math.round(job.elapsedSeconds) })],
              ]}
            />
            <p className="body ink2">{job.message}</p>
            {job.blockerCount > 0 || job.warningCount > 0 ? (
              <div className="chips">
                {job.blockerCount > 0 ? <span className="chip mono">{t('session.job.blockers', { count: job.blockerCount })}</span> : null}
                {job.warningCount > 0 ? <span className="chip mono">{t('session.job.warnings', { count: job.warningCount })}</span> : null}
              </div>
            ) : null}
            <p className="meta">{job.recommendedAction}</p>
            <Source>GET /api/data-intelligence/sessions/{'{'}session_id{'}'} · runningJob</Source>
          </div>
        </section>
      ) : null}

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('session.journey.title')}</h2>
          <span className="meta">{t('session.journey.meta', { count: steps.length })}</span>
        </div>
        {steps.length === 0 ? (
          <StateBlock kind="empty" title={t('session.journey.none')}>{t('session.journey.noneBody')}</StateBlock>
        ) : null}
        <div className="list">
          {steps.map((step) => (
            <div className="li" key={step.id}>
              <Signal family={familyFor(step.status)} label={step.status} />
              <span className="li-title">{step.label}</span>
              <span className="li-aux">
                <span className="meta mono">{step.agent ?? '—'}</span>
                <Badge value={step.status} family={familyFor(step.status)} />
              </span>
              {step.outputSummary || step.inputSummary ? (
                <span className="li-sub">{step.outputSummary ?? step.inputSummary}</span>
              ) : null}
              {step.alerts.length > 0 || step.pendingDecisions.length > 0 || step.artifacts.length > 0 ? (
                <div className="chips">
                  {step.pendingDecisions.map((decision) => <span className="chip" key={decision}>{decision}</span>)}
                  {step.alerts.map((alert) => <span className="chip" key={alert}>{alert}</span>)}
                  {step.artifacts.length > 0 ? <span className="chip mono">{t('session.journey.artifacts', { count: step.artifacts.length })}</span> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <GapChip id="G13" detail={t('session.journey.gap')} />
        <Source>GET /api/data-intelligence/sessions/{'{'}session_id{'}'} · steps</Source>
      </section>

      <div className="grid g-2 g-start">
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('session.datasets.title')}</h2>
            <span className="meta">{t('session.datasets.meta', { count: datasets.data?.length ?? 0 })}</span>
          </div>
          {datasets.isError ? <p className="meta">{t('session.partial')}</p> : null}
          {datasets.data && datasets.data.length === 0 ? <p className="meta">{t('session.datasets.none')}</p> : null}
          <div className="list">
            {(datasets.data ?? []).map((dataset) => (
              <div className="li" key={dataset.id}>
                <Signal family={dataset.isOriginal ? 'idle' : 'proof'} label={`v${dataset.version}`} />
                <span className="li-title mono">v{dataset.version}</span>
                <span className="meta mono">{formatBytes(dataset.bytesSize, locale)}</span>
                <span className="li-sub">
                  {dataset.originalFilename ?? dataset.storageRef}
                  {dataset.rowCountEstimate != null ? ` · ${t('session.datasets.rows', { count: dataset.rowCountEstimate })}` : ''}
                </span>
                <div className="chips">
                  <span className="chip mono">{dataset.isOriginal ? t('session.datasets.original') : dataset.producedByAgent ?? t('session.datasets.derived')}</span>
                  <span className="chip">{formatWhen(dataset.createdAt, locale)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="meta">{t('session.datasets.note')}</p>
          <Source>GET /api/data-intelligence/sessions/{'{'}session_id{'}'}/datasets</Source>
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('session.agents.title')}</h2>
            <span className="meta">{t('session.agents.meta', { count: agents.data?.length ?? 0 })}</span>
          </div>
          {agents.isError ? <p className="meta">{t('session.partial')}</p> : null}
          {agents.data && agents.data.length === 0 ? <p className="meta">{t('session.agents.none')}</p> : null}
          <div className="list">
            {(agents.data ?? []).map((execution) => (
              <div className="li" key={execution.id}>
                <Signal family={familyFor(execution.status)} label={execution.status} />
                <span className="li-title mono">{execution.agentId}</span>
                <Badge value={execution.status} family={familyFor(execution.status)} />
                <span className="li-sub mono">{execution.stage}</span>
                <div className="chips">
                  <span className="chip mono">{t('session.agents.attempt', { count: execution.attempt })}</span>
                  <span className="chip mono">{execution.usedAI ? (execution.provider ?? t('session.agents.ai')) : t('session.agents.deterministic')}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="meta">{t('session.agents.note')}</p>
          <Source>GET /api/data-intelligence/sessions/{'{'}session_id{'}'}/agent-executions</Source>
        </section>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('session.governance.title')}</h2>
          <span className="meta">{t('session.governance.meta', { count: governance.data?.length ?? 0 })}</span>
        </div>
        <p className="body ink2">{t('session.governance.lede')}</p>
        {governance.isError ? <p className="meta">{t('session.partial')}</p> : null}
        {governance.data && governance.data.length === 0 ? (
          <p className="meta">{t('session.governance.none')}</p>
        ) : null}
        <div className="list">
          {(governance.data ?? []).map((flag) => (
            <div className="li" key={flag.id}>
              <Signal family="caution" label={flag.piiType} />
              <span className="li-title mono">{flag.columnName}</span>
              <span className="meta mono">{flag.piiType}</span>
              <span className="li-sub">{t('session.governance.action', { action: flag.actionTaken })}</span>
            </div>
          ))}
        </div>
        <Source>GET /api/data-intelligence/sessions/{'{'}session_id{'}'}/governance-flags</Source>
      </section>
    </>
  );
}
