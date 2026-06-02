'use client';

import { Boxes } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ArchitectureTopology, ServiceNode } from '@/lib/api/types';

function NodeCell({ node }: { readonly node: ServiceNode }) {
  return (
    <div className={`topology-node min-w-0 rounded-[var(--radius-xl)] border border-white/10 bg-black/15 p-3 ${node.type === 'observability' ? 'observability-pulse' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-[color:var(--text)]">{node.label}</p>
        <Badge className="border-white/10 text-[color:var(--muted)]">{node.type}</Badge>
      </div>
      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{node.zone} / {node.ownership}</p>
    </div>
  );
}

export function ArchitectureTopologySurface({ topology }: { readonly topology: ArchitectureTopology }) {
  return (
    <Card className="relative overflow-hidden p-5" data-testid="architecture-topology-surface">
      <div className="ambient-grid pointer-events-none absolute inset-0 opacity-15" />
      <div className="relative grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Architecture Cockpit</p>
            <h3 className="mt-2 text-xl font-semibold text-[color:var(--text)]">Architecture topology</h3>
          </div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
            <Boxes className="h-4 w-4 text-[color:var(--accent)]" />
            <Badge>{topology.complexity}</Badge>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {topology.nodes.map((node) => <NodeCell key={node.id} node={node} />)}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {topology.edges.slice(0, 6).map((edge) => (
            <div key={edge.id} className={`topology-edge rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-[color:var(--muted)] ${edge.animated ? 'flow-signal' : ''}`}>
              {edge.source_id} {edge.type} {edge.target_id}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {topology.signals.map((signal) => <Badge key={signal} className="border-white/10 bg-white/[0.04]">{signal}</Badge>)}
        </div>
      </div>
    </Card>
  );
}
