'use client';

import type { AgentExecutionView, CompanyJobView, JobAssignment, VirtualCompanyView } from '@contracts/company.contract';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { GraphCanvas } from '@/components/canvas/graph-canvas';
import { useHeroPush } from '@/components/hero-link';
import type { GraphNode } from '@/components/canvas/geometry';
import { Signal, type Family } from '@/components/signal';
import type { CognitiveRun } from '@/lib/api/types';
import { layoutOrgChart, roleGlyph, runAxes, type OrgNodeData, type SeatData } from '@/lib/company/org-chart';
import { useI18n } from '@/lib/i18n/i18n';

import { Inspector } from './inspector';

/** A ring with one arc per axis the role's latest cognitive run recorded; a dashed ring when no run exists. */
export function AxisRing({ run, size = 44 }: { readonly run: CognitiveRun | null; readonly size?: number }) {
  const axes = runAxes(run);
  const c = size / 2;
  const r = c - 2.5;
  if (axes.length === 0) {
    return <svg className="ring" viewBox={`0 0 ${size} ${size}`} aria-hidden="true"><circle className="ring-none" cx={c} cy={c} r={r} /></svg>;
  }
  const gap = axes.length > 1 ? 0.22 : 0;
  const span = (Math.PI * 2) / axes.length;
  return (
    <svg className="ring" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {axes.map((axis, i) => {
        if (axes.length === 1) return <circle key={axis.axis} className={`ring-seg f-${axis.family}`} cx={c} cy={c} r={r} />;
        const a0 = -Math.PI / 2 + i * span + gap / 2;
        const a1 = -Math.PI / 2 + (i + 1) * span - gap / 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const d = `M${(c + r * Math.cos(a0)).toFixed(2)} ${(c + r * Math.sin(a0)).toFixed(2)} A${r} ${r} 0 ${large} 1 ${(c + r * Math.cos(a1)).toFixed(2)} ${(c + r * Math.sin(a1)).toFixed(2)}`;
        return <path key={axis.axis} className={`ring-seg f-${axis.family}`} d={d} />;
      })}
    </svg>
  );
}

export function OrgChart({ base, company, assignments, jobs, executions, runs }: {
  /** `/p/{projectKey}/missions/{jobId}` */
  readonly base: string;
  readonly company: VirtualCompanyView;
  readonly assignments: readonly JobAssignment[];
  readonly jobs: readonly CompanyJobView[];
  readonly executions: readonly AgentExecutionView[];
  readonly runs: readonly CognitiveRun[];
}) {
  const { t } = useI18n();
  const push = useHeroPush();
  const [selected, setSelected] = useState<string | null>(null);

  const seatWord = (seat: SeatData) => (seat.position.member ? seat.position.member.certification : seat.refusal ? t('org.unstaffed') : t('org.open'));
  const { nodes, edges } = useMemo(() => layoutOrgChart({
    company, assignments, jobs, executions, runs,
    seatLabel: (seat) => `${seat.position.title}: ${seat.position.member ? seat.position.member.certification : seat.refusal ? t('org.unstaffed') : t('org.open')}`,
  }), [assignments, company, executions, jobs, runs, t]);

  const seat = selected ? nodes.find((node) => node.id === selected && node.data.kind === 'seat')?.data as SeatData | undefined : undefined;
  const agentHref = (data: SeatData) => (data.position.member ? `${base}/company/agents/${encodeURIComponent(data.position.member.instance_id)}` : null);

  const render = (node: GraphNode<OrgNodeData>) => {
    const data = node.data;
    if (data.kind === 'zone') {
      return (
        <div className="team-zone">
          <span className="label">{t('org.team')}</span>
          <b>{data.team.label}</b>
          <p>{data.team.mandate}</p>
        </div>
      );
    }
    const { position, refusal } = data;
    const card = position.member ? '' : refusal ? ' is-refused' : ' is-open';
    return (
      <div className={`seat-card${card}`}>
        <span className="seat-glyph">
          <AxisRing run={data.run} />
          <svg className="ico" aria-hidden="true"><use href={`#r-${roleGlyph(position.definition_id)}`} /></svg>
        </span>
        <span className="seat-name">{position.title}</span>
        <span className="seat-line"><Signal family={data.family} />{seatWord(data)}</span>
        <span className={`seat-line${refusal ? ' is-refusal' : ''}`}>
          {position.member ? position.definition_id : refusal ? refusal.refusal_code : position.definition_id}
        </span>
      </div>
    );
  };

  const tip = (node: GraphNode<OrgNodeData>) => {
    if (node.data.kind !== 'seat') return null;
    const data = node.data;
    const axes = runAxes(data.run);
    const passed = axes.filter((axis) => axis.family === 'proof').length;
    return (
      <>
        <strong>{data.position.title}</strong>
        <span className="mono">{seatWord(data)}</span>
        <p className="tip-body">{data.run ? t('org.ring', { passed, total: axes.length }) : t('org.ringNone')}</p>
        <span className="tip-hint">{t('canvas.tipHint')}</span>
      </>
    );
  };

  const seats = company.teams.reduce((sum, team) => sum + team.positions.length, 0);

  return (
    <GraphCanvas
      label={t('org.label')}
      className="org-canvas"
      nodes={nodes}
      edges={edges}
      render={render}
      tip={tip}
      selected={selected}
      onSelect={setSelected}
      onEnter={(id, element) => {
        const target = nodes.find((node) => node.id === id)?.data;
        const href = target?.kind === 'seat' ? agentHref(target) : null;
        if (href) push(href, element);
      }}
      fitKey={`org:${company.company_id}:${seats}`}
      maxFit={1}
      height={{ min: 300, max: 640 }}
    >
      <div className="g-hud">
        <div className="g-legend">
          <span><Signal family="proof" />{t('org.legend.certified')}</span>
          <span><Signal family="caution" />{t('org.legend.qualified')}</span>
          <span><Signal family="fault" />{t('org.legend.unstaffed')}</span>
          <span><i />{t('org.legend.reports')}</span>
        </div>
      </div>
      {seat ? (
        <Inspector
          eyebrow={seat.team.label}
          title={seat.position.title}
          family={seat.family as Family}
          state={seat.position.member ? seat.position.member.certification : seat.refusal?.refusal_code ?? undefined}
          source="GET /api/companies/by-job/{job_id} · teams[].positions[]"
          onClose={() => setSelected(null)}
        >
          <p className="body ink2">{seat.position.why}</p>
          {seat.refusal ? <p className="meta">{seat.refusal.detail}</p> : null}
          {!seat.position.member && !seat.refusal ? <p className="meta">{t('company.notStaffedYet')}</p> : null}
          <dl className="kv">
            <dt>{t('org.seat.role')}</dt>
            <dd className="mono">{seat.position.definition_id} #{seat.position.seat_number}</dd>
            <dt>{t('org.seat.competencies')}</dt>
            <dd><span className="chips">{seat.position.required_competencies.map((item) => <span key={item} className="chip mono">{item}</span>)}</span></dd>
            <dt>{t('org.seat.cognitive')}</dt>
            <dd>
              {seat.run ? (
                <span className="stack" style={{ gap: 4 }}>
                  <span className="mono">{seat.run.verdict}</span>
                  {runAxes(seat.run).map((axis) => (
                    <span key={axis.axis} className="row" style={{ gap: 6 }}><Signal family={axis.family} label={axis.status} /><span className="mono">{axis.axis}</span></span>
                  ))}
                </span>
              ) : <span className="meta">{t('org.ringNone')}</span>}
            </dd>
          </dl>
          {agentHref(seat) ? (
            <div className="btn-row"><Link className="btn btn-ghost btn-sm" href={agentHref(seat)!}>{t('org.openAgent')}</Link></div>
          ) : null}
        </Inspector>
      ) : null}
    </GraphCanvas>
  );
}
