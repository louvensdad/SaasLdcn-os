'use client';

import type { ChangeRequest, FileDiff } from '@contracts/change-request.contract';
import { useMemo, useState } from 'react';

import { GraphCanvas } from '@/components/canvas/graph-canvas';
import type { GraphNode } from '@/components/canvas/geometry';
import { Signal } from '@/components/signal';
import { layoutChangeTrace, type TraceNodeData } from '@/lib/engineering/change-trace';
import { useI18n } from '@/lib/i18n/i18n';

import { Inspector } from './inspector';

/** The last two segments of a path: the file and its folder say more than the root the paths share. */
const shortPath = (path: string) => {
  const parts = path.split('/');
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path;
};

/** The trace of one change request, from the intent a person wrote to the result the backend recorded. */
export function ChangeTrace({ change, files }: { readonly change: ChangeRequest; readonly files: readonly FileDiff[] }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const { nodes, edges } = useMemo(() => layoutChangeTrace(change, files, {
    inScope: t('changemap.inScope'),
    notApplied: t('changemap.notApplied'),
    build: t('changemap.col.build'),
    preview: t('changemap.col.preview'),
    result: t('changemap.col.result'),
  }), [change, files, t]);

  const chosen = selected ? nodes.find((node) => node.id === selected)?.data : undefined;

  const render = (node: GraphNode<TraceNodeData>) => {
    const data = node.data;
    if (data.kind === 'head') return <div className="col-head"><span className="label">{t(`changemap.col.${data.column}`)}</span></div>;
    return (
      <div className={`svc-card f-${data.family}${data.observed ? '' : ' is-planned'}`}>
        <span className="svc-glyph"><Signal family={data.family} /></span>
        <b className={data.column === 'scope' || data.column === 'files' ? 'mono' : undefined}>
          {data.column === 'scope' || data.column === 'files' ? shortPath(data.title) : data.title}
        </b>
        <span className="mono">{data.state}</span>
      </div>
    );
  };

  return (
    <GraphCanvas
      label={t('changemap.label')}
      className="topo-canvas"
      nodes={nodes}
      edges={edges}
      render={render}
      tip={(node) => (node.data.kind === 'item' ? <><strong className="wrap-any">{node.data.title}</strong><span className="mono">{node.data.state}</span>{node.data.detail ? <p className="tip-body">{node.data.detail}</p> : null}</> : null)}
      selected={selected}
      onSelect={setSelected}
      fitKey={`change:${change.change_request_id}:${change.status}:${files.length}`}
      maxFit={1}
      height={{ min: 300, max: 560 }}
      bottom={48}
    >
      <div className="g-hud">
        <div className="g-legend">
          <span><Signal family="proof" />{t('map.legend.proof')}</span>
          <span><i />{t('changemap.legend.planned')}</span>
        </div>
      </div>
      {chosen?.kind === 'item' ? (
        <Inspector
          eyebrow={t(`changemap.col.${chosen.column}`)}
          title={chosen.title}
          family={chosen.family}
          state={chosen.state}
          source="GET /api/change-requests/{id} · GET /api/change-requests/{id}/diff"
          onClose={() => setSelected(null)}
        >
          <p className="body ink2">{chosen.observed ? t('changemap.observed') : t('changemap.planned')}</p>
          {chosen.detail ? <p className="meta wrap-any">{chosen.detail}</p> : null}
        </Inspector>
      ) : null}
    </GraphCanvas>
  );
}
