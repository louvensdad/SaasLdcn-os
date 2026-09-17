'use client';

import type { AgentExecutionView, CompanyJobView, ImplementationPlanView } from '@contracts/company.contract';
import type { ResilientGenerationJob } from '@contracts/generation-job.contract';
import type { TestRoomSessionView } from '@contracts/test-room.contract';
import { useMemo, useState } from 'react';

import { GraphCanvas } from '@/components/canvas/graph-canvas';
import type { GraphNode } from '@/components/canvas/geometry';
import { Signal } from '@/components/signal';
import { layoutWorkbenchTrace, type WorkbenchData } from '@/lib/engineering/workbench-trace';
import { useI18n } from '@/lib/i18n/i18n';

import { Inspector } from './inspector';

/** The last two segments of a path: the file and its folder say more than the root the paths share. */
const shortPath = (path: string) => {
  const parts = path.split('/');
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path;
};

const SOURCE: Readonly<Record<string, string>> = {
  requirement: 'GET /api/companies/by-job/{job_id}/plan · blueprints[].requirement_refs',
  unit: 'GET /api/companies/by-job/{job_id}/plan · /jobs · status',
  agent: 'GET /api/companies/by-job/{job_id}/executions · blueprint_ref, agent_instance_id',
  stage: 'GET /api/companies/by-job/{job_id}/executions · stage · GET /api/meta-factory/jobs/{job_id} · stageStatuses',
  files: 'GET /api/meta-factory/jobs/{job_id} · artifacts[].stage',
  build: 'GET /api/meta-factory/jobs/{job_id} · buildStatus',
  tests: 'GET /api/test-room/{project_id}/sessions · gates',
};

/** Why the code of a mission exists and what proves it; selecting a requirement lights everything it reaches. */
export function WorkbenchTrace({ plan, jobs, executions, job, session }: {
  readonly plan: ImplementationPlanView;
  readonly jobs: readonly CompanyJobView[];
  readonly executions: readonly AgentExecutionView[];
  readonly job: ResilientGenerationJob | null;
  readonly session: TestRoomSessionView | null;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const { nodes, edges } = useMemo(() => layoutWorkbenchTrace({
    plan, jobs, executions, job, session, expanded,
    words: {
      files: (count) => t('workbench.files', { count }),
      toggle: (stage, open) => t(open ? 'workbench.hideFiles' : 'workbench.showFiles', { stage }),
      build: t('changemap.col.build'),
      tests: t('workbench.col.tests'),
    },
  }), [executions, expanded, job, jobs, plan, session, t]);

  const toggle = (id: string) => {
    const stage = id.replace('files:', '');
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(stage)) next.delete(stage); else next.add(stage);
      return next;
    });
  };

  const chosen = selected ? nodes.find((node) => node.id === selected)?.data : undefined;

  const render = (node: GraphNode<WorkbenchData>) => {
    const data = node.data;
    if (data.kind === 'head') return <div className="col-head"><span className="label">{t(`workbench.col.${data.column}`)}</span></div>;
    const mono = data.column === 'requirement' || data.column === 'unit' || data.column === 'stage' || (data.column === 'files' && !data.files);
    return (
      <div className={`svc-card f-${data.family}${data.column === 'requirement' ? ' req-card' : ''}`}>
        <span className="svc-glyph"><Signal family={data.family} /></span>
        {data.column === 'requirement'
          ? <span className="svc-reason mono">{data.title}</span>
          : <>
            <b className={mono ? 'mono' : undefined}>{data.column === 'files' && !data.files ? shortPath(data.title) : data.title}</b>
            <span className="mono">{data.state}</span>
          </>}
      </div>
    );
  };

  return (
    <GraphCanvas
      label={t('workbench.label')}
      className="proof-canvas"
      nodes={nodes}
      edges={edges}
      render={render}
      tip={(node) => (node.data.kind === 'item' ? <><strong className="wrap-any">{node.data.title}</strong><span className="mono">{node.data.state}</span><span className="tip-hint">{t(`workbench.why.${node.data.column}`)}</span></> : null)}
      selected={selected}
      onSelect={setSelected}
      onToggle={toggle}
      fitKey={`workbench:${plan.plan_id}:${[...expanded].sort().join(',')}`}
      maxFit={1}
      height={{ min: 360, max: 700 }}
    >
      <div className="g-hud">
        <div className="g-legend">
          <span><Signal family="proof" />{t('map.legend.proof')}</span>
          <span><Signal family="fault" />{t('map.legend.fault')}</span>
          <span><Signal family="unknown" />{t('map.legend.unknown')}</span>
        </div>
      </div>
      {chosen?.kind === 'item' ? (
        <Inspector
          eyebrow={t(`workbench.col.${chosen.column}`)}
          title={chosen.title}
          family={chosen.family}
          state={chosen.state}
          source={SOURCE[chosen.column]}
          onClose={() => setSelected(null)}
        >
          <p className="body ink2">{t(`workbench.why.${chosen.column}`)}</p>
          {chosen.files ? (
            <ul className="proj-missions">
              {chosen.files.slice(0, 20).map((file) => (
                <li key={file.id}>
                  <Signal family={file.valid ? 'proof' : 'caution'} label={file.path} />
                  <span className="mono wrap-any">{file.path}</span>
                  <span className="meta num">{file.size_bytes} B</span>
                </li>
              ))}
            </ul>
          ) : null}
          {chosen.files && chosen.files.length > 20 ? <p className="meta">{t('workbench.moreFiles', { count: chosen.files.length - 20 })}</p> : null}
        </Inspector>
      ) : null}
    </GraphCanvas>
  );
}
