'use client';

import type { AgentExecutionView, CompanyJobView, ImplementationPlanView } from '@contracts/company.contract';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { GraphCanvas } from '@/components/canvas/graph-canvas';
import { useHeroPush } from '@/components/hero-link';
import type { GraphNode } from '@/components/canvas/geometry';
import { Signal } from '@/components/signal';
import { layoutJobGraph, neighbourhood, type JobGraphData } from '@/lib/company/job-graph';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

import { Inspector } from './inspector';

/**
 * The units of work of a mission. On the company screen it shows the whole graph; on a job's own screen (`focus`) it
 * lights that job's neighbourhood — what it waits on and what waits on it.
 */
export function JobGraph({ base, jobs, plan, executions, focus = null }: {
  /** `/p/{projectKey}/missions/{jobId}` */
  readonly base: string;
  readonly jobs: readonly CompanyJobView[];
  readonly plan: ImplementationPlanView | null;
  readonly executions: readonly AgentExecutionView[];
  readonly focus?: string | null;
}) {
  const { t } = useI18n();
  const push = useHeroPush();
  const [selected, setSelected] = useState<string | null>(null);
  const { nodes, edges, criticalIds } = useMemo(() => layoutJobGraph({
    jobs, plan, executions,
    label: (job) => `${job.blueprint_ref}: ${job.status}`,
  }), [executions, jobs, plan]);

  const lit = useMemo(() => (focus ? neighbourhood(jobs, focus) : null), [focus, jobs]);
  const chosen = selected ? nodes.find((node) => node.id === selected)?.data : undefined;
  const href = (id: string) => `${base}/jobs/${encodeURIComponent(id)}`;

  const render = (node: GraphNode<JobGraphData>) => {
    const data = node.data;
    if (data.kind === 'depth') return <div className="col-head"><span className="label">{t('jobmap.depth', { depth: data.depth })}</span></div>;
    return (
      <div className={`svc-card f-${data.family}${data.critical ? ' is-critical' : ''}`}>
        <span className="svc-glyph"><Signal family={data.family} /></span>
        <b className="mono">{data.job.blueprint_ref}</b>
        <span className="mono">{data.job.status}{data.job.refusal_code ? ` · ${data.job.refusal_code}` : ''}</span>
        <span className="svc-reason">{t('jobmap.runs', { count: data.executions.length })}</span>
      </div>
    );
  };

  return (
    <GraphCanvas
      label={t('jobmap.label')}
      className="topo-canvas"
      nodes={nodes}
      edges={edges}
      render={render}
      tip={(node) => (node.data.kind === 'job'
        ? <><strong>{node.data.job.title}</strong><span className="mono">{node.data.job.status}</span>{node.data.job.detail ? <p className="tip-body">{node.data.job.detail}</p> : null}<span className="tip-hint">{t('canvas.tipHint')}</span></>
        : null)}
      selected={selected ?? focus}
      onSelect={setSelected}
      onEnter={(id, element) => { if (nodes.some((node) => node.id === id && node.data.kind === 'job')) push(href(id), element); }}
      lit={selected ? null : lit}
      fitKey={`jobs:${jobs.length}:${focus ?? ''}`}
      maxFit={1}
      height={{ min: 300, max: 560 }}
    >
      <div className="g-hud">
        <div className="g-legend">
          <span><Signal family="proof" />READY</span>
          <span><Signal family="caution" />BLOCKED</span>
          <span><Signal family="fault" />REFUSED</span>
          {criticalIds.length > 0 ? <span><i className="is-critical" />{t('jobmap.critical')}</span> : null}
        </div>
      </div>
      {chosen?.kind === 'job' ? (
        <Inspector
          eyebrow={chosen.job.blueprint_ref}
          title={chosen.job.title}
          family={chosen.family}
          state={chosen.job.status}
          source="GET /api/companies/by-job/{job_id}/jobs · /plan · /executions"
          onClose={() => setSelected(null)}
        >
          {chosen.job.detail ? <p className="body ink2">{chosen.job.detail}</p> : null}
          <dl className="kv">
            <dt>{t('jobmap.waitsOn')}</dt>
            <dd>{(chosen.job.dependency_job_ids ?? []).length > 0
              ? (chosen.job.dependency_job_ids ?? []).map((id) => jobs.find((job) => job.id === id)?.blueprint_ref ?? id).join(' · ')
              : '—'}</dd>
            <dt>{t('jobmap.criticalPath')}</dt>
            <dd>{chosen.critical ? t('jobmap.onPath') : plan ? t('jobmap.offPath') : t('jobmap.noPlan')}</dd>
            <dt>{t('jobmap.executions')}</dt>
            <dd>
              {chosen.executions.length === 0 ? '—' : (
                <span className="stack" style={{ gap: 4 }}>
                  {chosen.executions.map((execution) => (
                    <span key={execution.id} className="row" style={{ gap: 6 }}>
                      <Signal family={familyFor(execution.status)} label={execution.status} />
                      <span className="mono">{execution.role} · {execution.stage}</span>
                    </span>
                  ))}
                </span>
              )}
            </dd>
          </dl>
          {chosen.job.id !== focus ? (
            <div className="btn-row"><Link className="btn btn-ghost btn-sm" href={href(chosen.job.id)}>{t('jobmap.open')}</Link></div>
          ) : null}
        </Inspector>
      ) : null}
    </GraphCanvas>
  );
}
