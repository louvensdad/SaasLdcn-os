'use client';

import type { ArchitectureBlueprint } from '@contracts/architecture-blueprint.contract';
import { useMemo, useState } from 'react';

import { GraphCanvas } from '@/components/canvas/graph-canvas';
import type { GraphNode } from '@/components/canvas/geometry';
import { Signal } from '@/components/signal';
import { layoutDecisionMap, type MapData } from '@/lib/architecture/decision-map';
import { useI18n } from '@/lib/i18n/i18n';

import { Inspector } from './inspector';

/** The blueprint's decisions as a map; selecting a requirement lights exactly the decisions that cite it. */
export function DecisionMap({ blueprint }: { readonly blueprint: ArchitectureBlueprint }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const { nodes, edges } = useMemo(() => layoutDecisionMap(blueprint, {
    decision: (decision) => `${decision.area}: ${decision.choice}`,
    requirement: (text) => t('archmap.requirementLabel', { text }),
  }), [blueprint, t]);

  const chosen = selected ? nodes.find((node) => node.id === selected) : undefined;
  const lit = useMemo(() => {
    if (chosen?.data.kind !== 'requirement') return null;
    return new Set([chosen.id, ...chosen.data.decisions.map((area) => `decision:${area}`)]);
  }, [chosen]);

  const render = (node: GraphNode<MapData>) => {
    const data = node.data;
    if (data.kind === 'layer') return <div className="col-head"><span className="label">{t(`archmap.layer.${data.layer}`)}</span></div>;
    if (data.kind === 'requirement') {
      return (
        <div className="svc-card req-card">
          <span className="svc-glyph"><Signal family="idle" /></span>
          <span className="svc-reason">{data.text}</span>
        </div>
      );
    }
    return (
      <div className={`svc-card${blueprint.degraded ? ' f-caution' : ''}`}>
        <span className="svc-glyph"><Signal family={blueprint.degraded ? 'caution' : 'proof'} /></span>
        <span className="mono">{data.decision.area}</span>
        <b>{data.decision.choice}</b>
      </div>
    );
  };

  const decision = chosen?.data.kind === 'decision' ? chosen.data : null;
  const requirement = chosen?.data.kind === 'requirement' ? chosen.data : null;

  return (
    <GraphCanvas
      label={t('archmap.label')}
      className="proof-canvas"
      nodes={nodes}
      edges={edges}
      render={render}
      tip={(node) => (node.data.kind === 'decision'
        ? <><strong>{node.data.decision.choice}</strong><span className="mono">{node.data.decision.area}</span><p className="tip-body">{node.data.decision.justification}</p></>
        : node.data.kind === 'requirement' ? <><strong>{t('archmap.requirement')}</strong><p className="tip-body">{node.data.text}</p><span className="tip-hint">{t('archmap.traceHint')}</span></> : null)}
      selected={selected}
      onSelect={setSelected}
      lit={lit}
      traceOnSelect={false}
      fitKey={`arch:${blueprint.version}:${nodes.length}`}
      maxFit={1}
      height={{ min: 360, max: 700 }}
    >
      <div className="g-hud">
        <div className="g-legend">
          <span><i />{t('archmap.legend.depends')}</span>
          <span><Signal family="idle" />{t('archmap.requirement')}</span>
          {blueprint.degraded ? <span><Signal family="caution" />{t('archmap.degraded')}</span> : null}
        </div>
      </div>
      {decision ? (
        <Inspector
          eyebrow={decision.decision.area}
          title={decision.decision.choice}
          family={blueprint.degraded ? 'caution' : 'proof'}
          source="GET /api/project-rooms/{room_id} · architecture_blueprint.decisions[]"
          onClose={() => setSelected(null)}
        >
          <p className="body ink2">{decision.decision.justification}</p>
          <dl className="kv">
            {decision.decision.alternatives_considered.length > 0 ? (
              <>
                <dt>{t('archmap.alternatives')}</dt>
                <dd>{decision.decision.alternatives_considered.join(' · ')}</dd>
              </>
            ) : null}
            {decision.resolved.length > 0 ? (
              <>
                <dt>{t('archmap.dependsOn')}</dt>
                <dd><span className="chips">{decision.resolved.map((area) => <span key={area} className="chip mono">{area}</span>)}</span></dd>
              </>
            ) : null}
            {decision.unresolved.length > 0 ? (
              <>
                <dt>{t('archmap.otherDependencies')}</dt>
                <dd>{decision.unresolved.join(' · ')}</dd>
              </>
            ) : null}
            {(decision.decision.risks ?? []).length > 0 ? (
              <>
                <dt>{t('archmap.risks')}</dt>
                <dd>{(decision.decision.risks ?? []).join(' · ')}</dd>
              </>
            ) : null}
          </dl>
        </Inspector>
      ) : null}
      {requirement ? (
        <Inspector title={t('archmap.requirement')} family="idle" onClose={() => setSelected(null)} source="GET /api/project-rooms/{room_id} · decisions[].requirement_links">
          <p className="body ink2">{requirement.text}</p>
          <p className="meta">{t('archmap.citedBy', { areas: [...new Set(requirement.decisions)].join(', ') })}</p>
        </Inspector>
      ) : null}
    </GraphCanvas>
  );
}
