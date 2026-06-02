'use client';
import { Ship } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DeploymentTopology } from '@/lib/api/types';
export function DeploymentTopologySurface({ topology }: { readonly topology: DeploymentTopology }) {
  return (
    <Card className="grid gap-4 p-5" data-testid="deployment-topology-surface">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Deployment Topology</p><p className="mt-2 text-sm text-[color:var(--muted)]">{topology.operational_overhead}</p></div><Ship className="h-5 w-5 text-[color:var(--accent-2)]" /></div>
      <div className="flex flex-wrap gap-2">{topology.nodes.map((node) => <Badge key={node.id} className="border-white/10 bg-black/15">{node.label}</Badge>)}</div>
      <div className="grid gap-2 sm:grid-cols-2"><p className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-[color:var(--muted)]">Mode: <span className="font-semibold text-[color:var(--text)]">{topology.mode}</span></p><p className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-[color:var(--muted)]">Burden: <span className="font-semibold text-[color:var(--text)]">{topology.deployment_burden}</span></p></div>
    </Card>
  );
}
