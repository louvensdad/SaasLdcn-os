'use client';

import type { ArchitecturalEdge, ArchitecturalGraphLayout } from '@/lib/api/types';

export function GraphEdge({
  edge,
  layout,
}: {
  readonly edge: ArchitecturalEdge;
  readonly layout: ArchitecturalGraphLayout;
}) {
  const source = layout.points.find((point) => point.node_id === edge.source_id);
  const target = layout.points.find((point) => point.node_id === edge.target_id);
  if (!source || !target) return null;

  const x1 = source.x + 124;
  const y1 = source.y + 36;
  const x2 = target.x;
  const y2 = target.y + 36;
  const curve = Math.max(38, Math.abs(x2 - x1) / 2);

  return (
    <g className={edge.animated ? 'architectural-edge-animated' : undefined}>
      <path
        data-testid={`graph-edge-${edge.source_id}-${edge.target_id}`}
        d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
        fill="none"
        className="pointer-events-auto"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={edge.type === 'async' || edge.type === 'event' || edge.type === 'queue' ? '6 5' : undefined}
        style={{ pointerEvents: 'stroke' }}
      />
      <circle cx={x2} cy={y2} r="3" fill="currentColor" />
      <title>
        {edge.label}: {edge.source_id} {edge.type} {edge.target_id}
        {edge.warning ? ` - ${edge.warning}` : ''}
      </title>
    </g>
  );
}
