'use client';

import { useMemo, useState } from 'react';

import { GraphCanvas } from '@/components/canvas/graph-canvas';
import type { GraphNode } from '@/components/canvas/geometry';
import { HeroLink, useHeroPush } from '@/components/hero-link';
import { Signal } from '@/components/signal';
import {
  layoutProofGraph, PILLARS, type PillarId, type ProofEvidence, type ProofNodeData, type ProofPillar, type ProofRelease, type ProofVerdict,
} from '@/lib/evidence/proof-graph';
import { useI18n } from '@/lib/i18n/i18n';
import { useStatusLabel } from '@/lib/i18n/status-label';

import { Inspector } from './inspector';

/** The evidence graph on the evidence screen: verdict ← pillars ← evidence, every node carrying its own backend word. */
export function ProofGraph({ pillars, evidence, verdict, release, fitKey, testRoomHref = null }: {
  readonly pillars: readonly ProofPillar[];
  readonly evidence: readonly ProofEvidence[];
  readonly verdict: ProofVerdict;
  readonly release: ProofRelease;
  readonly fitKey: string;
  /** Where a Test Room gate opens: the session the gate nodes were read from. */
  readonly testRoomHref?: string | null;
}) {
  const { t } = useI18n();
  const say = useStatusLabel();
  const push = useHeroPush();
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<PillarId>>(new Set());
  const allOpen = PILLARS.every((id) => expanded.has(id) || !evidence.some((item) => item.pillar === id));

  const { nodes, edges } = useMemo(() => layoutProofGraph({
    pillars, evidence, verdict, release, expanded,
    labels: {
      evidence: (item) => `${item.label}: ${item.state}`,
      pillar: (item) => `${t(`proofmap.pillar.${item.id}`)}: ${item.state}`,
      toggle: (item, open) => t(open ? 'proofmap.fold' : 'proofmap.unfold', { pillar: t(`proofmap.pillar.${item.id}`) }),
      verdict: `${t('proofmap.verdict')}: ${say(verdict.phase)}`,
      release: `${t('proofmap.release')}: ${say(release.state)}`,
    },
  }), [evidence, expanded, pillars, release, say, t, verdict]);

  const toggle = (id: string) => {
    const pillar = id.replace('pillar:', '') as PillarId;
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(pillar)) next.delete(pillar); else next.add(pillar);
      return next;
    });
  };

  const render = (node: GraphNode<ProofNodeData>) => {
    const data = node.data;
    if (data.kind === 'column') return <div className="col-head"><span className="label">{t(`proofmap.col.${data.column}`)}</span></div>;
    if (data.kind === 'evidence') {
      return (
        <div className={`enode-card f-${data.family}${data.family === 'idle' || data.family === 'na' ? ' is-missing' : ''}`}>
          <Signal family={data.family} />
          <b>{data.label}</b>
          <span className="mono">{data.state}</span>
        </div>
      );
    }
    if (data.kind === 'pillar') {
      return (
        <div className={`pillar-card f-${data.family}`}>
          <Signal family={data.family} />
          <b>{t(`proofmap.pillar.${data.id}`)}</b>
          <span className="pillar-state">{data.state}</span>
          <span className="pillar-count">{t('proofmap.evidenceShort', { count: evidence.filter((item) => item.pillar === data.id).length })}</span>
        </div>
      );
    }
    if (data.kind === 'verdict') {
      return (
        <div className={`verdict-card f-${data.family}`}>
          <Signal family={data.family} />
          <span className="label">{t('proofmap.verdict')}</span>
          <b>{data.phase}</b>
          {data.state ? <span className="mono">{data.state}</span> : null}
        </div>
      );
    }
    return (
      <div className={`pillar-card f-${data.family}`}>
        <Signal family={data.family} />
        <b>{t('proofmap.release')}</b>
        <span className="pillar-state">{data.state}</span>
      </div>
    );
  };

  const tip = (node: GraphNode<ProofNodeData>) => {
    const data = node.data;
    if (data.kind === 'column') return null;
    if (data.kind === 'evidence') {
      return (
        <>
          <strong>{data.label}</strong>
          <span className="mono">{data.state}</span>
          {data.detail ? <p className="tip-body">{data.detail}</p> : null}
          <span className="tip-hint">{t(`proofmap.origin.${data.origin}`)}</span>
        </>
      );
    }
    if (data.kind === 'pillar') {
      return (
        <>
          <strong>{t(`proofmap.pillar.${data.id}`)}</strong>
          <span className="mono">{data.state}</span>
          <p className="tip-body">{t(`proofmap.why.${data.id}`)}</p>
        </>
      );
    }
    if (data.kind === 'verdict') return <><strong>{t('proofmap.verdict')}</strong><span className="mono">{data.phase}</span></>;
    return <><strong>{t('proofmap.release')}</strong><span className="mono">{data.state}</span></>;
  };

  const chosen = selected ? nodes.find((node) => node.id === selected)?.data : undefined;

  return (
    <GraphCanvas
      label={t('proofmap.label')}
      className="proof-canvas"
      nodes={nodes}
      edges={edges}
      render={render}
      tip={tip}
      selected={selected}
      onSelect={setSelected}
      onToggle={toggle}
      onEnter={(id, element) => {
        const data = nodes.find((node) => node.id === id)?.data;
        if (data?.kind === 'evidence' && data.origin === 'gate' && testRoomHref) push(testRoomHref, element);
      }}
      fitKey={`${fitKey}:${[...expanded].sort().join(',')}`}
      maxFit={1}
      height={{ min: 360, max: 720 }}
    >
      <div className="g-hud">
        <div className="g-legend">
          <span><Signal family="proof" />{t('map.legend.proof')}</span>
          <span><Signal family="fault" />{t('map.legend.fault')}</span>
          <span><Signal family="caution" />{t('proofmap.legend.caution')}</span>
          <span><Signal family="idle" />{t('proofmap.missing')}</span>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => setExpanded(allOpen ? new Set() : new Set(PILLARS))}
        >
          {t(allOpen ? 'proofmap.foldAll' : 'proofmap.unfoldAll')}
        </button>
      </div>
      {chosen?.kind === 'evidence' ? (
        <Inspector
          eyebrow={t(`proofmap.origin.${chosen.origin}`)}
          title={chosen.label}
          family={chosen.family}
          state={chosen.state}
          source={chosen.source}
          onClose={() => setSelected(null)}
        >
          {chosen.detail ? <p className="body ink2 wrap-any">{chosen.detail}</p> : null}
          {chosen.pillar ? <p className="meta">{t('proofmap.supports', { pillar: t(`proofmap.pillar.${chosen.pillar}`) })}</p> : null}
          {chosen.origin === 'gate' && testRoomHref ? (
            <div className="btn-row"><HeroLink className="btn btn-ghost btn-sm" href={testRoomHref}>{t('links.openInTestRoom')}</HeroLink></div>
          ) : null}
        </Inspector>
      ) : null}
      {chosen?.kind === 'pillar' ? (
        <Inspector title={t(`proofmap.pillar.${chosen.id}`)} family={chosen.family} state={chosen.state} source={chosen.source} onClose={() => setSelected(null)}>
          <p className="body ink2">{t(`proofmap.why.${chosen.id}`)}</p>
          <p className="meta">{t('proofmap.pillarCount', { count: evidence.filter((item) => item.pillar === chosen.id).length })}</p>
        </Inspector>
      ) : null}
      {chosen?.kind === 'verdict' ? (
        <Inspector
          title={t('proofmap.verdict')}
          family={chosen.family}
          state={chosen.phase}
          source="GET /api/meta-factory/{project_id}/engineering-kernel · kernel_phase, state, reason"
          onClose={() => setSelected(null)}
        >
          {chosen.state ? <p className="mono">{chosen.state}</p> : null}
          {chosen.reason ? <p className="body ink2">{chosen.reason}</p> : null}
        </Inspector>
      ) : null}
      {chosen?.kind === 'release' ? (
        <Inspector
          title={t('proofmap.release')}
          family={chosen.family}
          state={chosen.state}
          source="GET /api/meta-factory/{project_id}/quality-report · can_release"
          onClose={() => setSelected(null)}
        >
          <p className="body ink2">{t('proofmap.why.release')}</p>
        </Inspector>
      ) : null}
    </GraphCanvas>
  );
}
