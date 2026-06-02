'use client';
import { GitBranch } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DependencyVisualization } from '@/lib/api/types';
export function DependencyGraphSurface({ visualization }: { readonly visualization: DependencyVisualization }) {
  return (
    <Card className="grid gap-4 p-5" data-testid="dependency-visualization-surface">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Dependency Propagation</p><p className="mt-2 text-sm text-[color:var(--muted)]">Requires, recommendations, conflicts and burden chains.</p></div><GitBranch className="h-5 w-5 text-[color:var(--accent)]" /></div>
      <div className="grid gap-2">{visualization.chains.slice(0, 5).map((chain) => <p key={chain} className="propagation-line rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-[color:var(--text)]">{chain}</p>)}</div>
      <div className="flex flex-wrap gap-2">{visualization.burden_signals.slice(0, 3).map((signal) => <Badge key={signal} className="border-white/10 bg-black/15">{signal}</Badge>)}</div>
    </Card>
  );
}
