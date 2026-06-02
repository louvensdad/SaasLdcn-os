'use client';

import { Activity } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useArchitecturalGraph } from '@/hooks/use-architectural-graph';
import type { ArchitecturalGraphPayload, ArchitecturalGraphSnapshot, ArchitecturalNode } from '@/lib/api/types';
import { GraphEdge } from './graph-edge';
import { GraphLegend } from './graph-legend';
import { GraphNode } from './graph-node';
import { GraphNodeDetails } from './graph-node-details';
import { GraphToolbar } from './graph-toolbar';

export function ArchitecturalGraphCanvas({
  payload,
  snapshot,
  offlineMessage,
  title = 'Architecture Graph',
}: {
  readonly payload: ArchitecturalGraphPayload | null;
  readonly snapshot?: ArchitecturalGraphSnapshot | null;
  readonly offlineMessage: string;
  readonly title?: string;
}) {
  const query = useArchitecturalGraph(snapshot ? null : payload);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const graph = snapshot?.graph ?? query.data ?? null;

  useEffect(() => {
    setSelectedNodeId(null);
    setZoom(1);
  }, [payload?.architecture_id, payload?.framework_id, payload?.capability_ids.length, payload?.infrastructure_ids.length]);

  const selected = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph?.nodes, selectedNodeId],
  );

  if (!snapshot && (!payload || query.isLoading)) {
    return (
      <Card className="grid gap-3 p-5" data-testid="architectural-graph-canvas">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{title}</p>
        <p className="text-sm text-[color:var(--muted)]">{payload ? 'Synchronizing architectural graph.' : 'Select an architecture path to activate graph preview.'}</p>
      </Card>
    );
  }

  if (!snapshot && (query.isError || !graph)) {
    return (
      <Card className="grid gap-3 p-5" data-testid="architectural-graph-canvas">
        <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
          <Activity className="h-4 w-4 text-[color:var(--warning)]" />
          Architectural graph offline
        </div>
        <p className="text-sm text-[color:var(--muted)]">{offlineMessage}</p>
      </Card>
    );
  }

  if (!graph) {
    return null;
  }

  return (
    <Card className="relative overflow-hidden p-5" data-testid="architectural-graph-canvas">
      <div className="ambient-grid pointer-events-none absolute inset-0 opacity-15" />
      <div className="relative grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Architecture Graph Surface</p>
            <h3 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{title}</h3>
          </div>
          <GraphToolbar
            zoom={zoom}
            onZoomIn={() => setZoom((value) => Math.min(1.2, value + 0.1))}
            onZoomOut={() => setZoom((value) => Math.max(0.72, value - 0.1))}
            onFit={() => setZoom(1)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{graph.nodes.length} nodes</Badge>
          <Badge>{graph.edges.length} edges</Badge>
          <Badge>{graph.architecture_id}</Badge>
        </div>
        <GraphLegend />
        {graph.layout.simplified_mobile ? (
          <div className="grid gap-2 rounded-[var(--radius-lg)] border border-white/10 bg-black/15 p-3 md:hidden" data-testid="graph-mobile-summary">
            {graph.nodes.slice(0, 6).map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedNodeId(node.id)}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-white/10 bg-white/[0.04] px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[color:var(--text)]">{node.label}</span>
                  <span className="block truncate text-xs text-[color:var(--muted)]">{node.type} / {node.ownership_role}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-[color:var(--muted)]">{node.burden_score}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className={`architectural-graph-viewport overflow-auto rounded-[var(--radius-xl)] border border-white/10 bg-black/15 ${graph.layout.simplified_mobile ? 'hidden md:block' : ''}`}>
            <div
              className="relative origin-top-left transition-transform"
              style={{ width: graph.layout.width, height: graph.layout.height, transform: zoom === 1 ? undefined : `scale(${zoom})` }}
            >
              <svg viewBox={`0 0 ${graph.layout.width} ${graph.layout.height}`} className="absolute inset-0 z-0 h-full w-full text-[color-mix(in_srgb,var(--accent)_42%,white_10%)]" aria-label="Architectural edges">
                {graph.edges.map((edge) => <GraphEdge key={edge.id} edge={edge} layout={graph.layout} />)}
              </svg>
              {graph.nodes.map((node) => (
                <GraphNode
                  key={node.id}
                  node={node}
                  layout={graph.layout}
                  selected={node.id === selectedNodeId}
                  onSelect={(next: ArchitecturalNode) => setSelectedNodeId(next.id)}
                />
              ))}
            </div>
          </div>
          <GraphNodeDetails node={selected} />
        </div>
      </div>
    </Card>
  );
}
