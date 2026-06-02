'use client';
import { Database } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { InfrastructureTopology } from '@/lib/api/types';
export function InfrastructureTopologySurface({ topology }: { readonly topology: InfrastructureTopology }) {
  return (
    <Card className="grid gap-4 p-5" data-testid="infrastructure-topology-surface">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Infrastructure Topology</p><p className="mt-2 text-sm text-[color:var(--muted)]">Datastores, queues, observability and deployment ownership.</p></div>
        <Database className="h-5 w-5 text-[color:var(--accent-2)]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {topology.nodes.map((node) => <div key={node.id} className={`rounded-[var(--radius-xl)] border border-white/10 bg-black/15 p-3 ${node.type === 'queue' ? 'queue-signal' : ''}`}><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-[color:var(--text)]">{node.label}</p><Badge>{node.type}</Badge></div><p className="mt-2 text-xs text-[color:var(--muted)]">{node.ownership} / {node.provider}</p></div>)}
      </div>
      <div className="flex flex-wrap gap-2">{topology.ownership_signals.map((item) => <Badge key={item} className="border-white/10 bg-white/[0.04]">{item}</Badge>)}</div>
    </Card>
  );
}
