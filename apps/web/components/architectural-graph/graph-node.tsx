'use client';

import { Activity, AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { ArchitecturalGraphLayout, ArchitecturalNode } from '@/lib/api/types';

export function GraphNode({
  node,
  layout,
  selected,
  onSelect,
}: {
  readonly node: ArchitecturalNode;
  readonly layout: ArchitecturalGraphLayout;
  readonly selected: boolean;
  readonly onSelect: (node: ArchitecturalNode) => void;
}) {
  const point = layout.points.find((item) => item.node_id === node.id);
  if (!point) return null;

  return (
    <button
      type="button"
      data-testid={`graph-node-${node.id}`}
      onClick={() => onSelect(node)}
      className={`architectural-graph-node absolute z-10 grid h-[72px] w-[124px] gap-1 overflow-hidden rounded-[var(--radius-xl)] border bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-2 text-left shadow-[var(--shadow-soft)] ${
        selected ? 'border-[color:var(--accent)]' : 'border-white/10'
      } ${node.status === 'degraded' ? 'graph-node-degraded' : node.status === 'watch' ? 'graph-node-watch' : ''}`}
      style={{ left: point.x, top: point.y }}
      title={`${node.label}: ${node.ownership_role}`}
    >
      <span className="flex min-w-0 items-center justify-between gap-1">
        <span className="truncate text-xs font-semibold text-[color:var(--text)]">{node.label}</span>
        {node.warnings.length ? (
          <AlertTriangle className="h-3 w-3 shrink-0 text-[color:var(--warning)]" />
        ) : (
          <Activity className="h-3 w-3 shrink-0 text-[color:var(--success)]" />
        )}
      </span>
      <span className="truncate text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">{node.type}</span>
      <span className="flex gap-1">
        <Badge className="h-4 border-white/10 px-1 text-xs">{node.burden_score}</Badge>
        <Badge className="h-4 border-white/10 px-1 text-xs">{node.readiness_score}</Badge>
      </span>
    </button>
  );
}
