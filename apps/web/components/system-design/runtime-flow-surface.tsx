'use client';
import { ArrowRight, Workflow } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { RuntimeFlow } from '@/lib/api/types';
export function RuntimeFlowSurface({ flow }: { readonly flow: RuntimeFlow }) {
  return (
    <Card className="grid gap-4 p-5" data-testid="runtime-flow-surface">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Runtime Visualization</p><p className="mt-2 text-sm text-[color:var(--muted)]">Synchronized execution path with sync, async, queue and telemetry edges.</p></div><Workflow className="h-5 w-5 text-[color:var(--accent)]" /></div>
      <div className="flex flex-wrap items-center gap-2">
        {flow.steps.map((step, index) => <div key={`${step}-${index}`} className="flex items-center gap-2"><Badge className="border-white/10 bg-white/[0.04]">{step}</Badge>{index < flow.steps.length - 1 ? <ArrowRight className="runtime-flow-arrow h-4 w-4 text-[color:var(--accent-2)]" /> : null}</div>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{flow.edges.slice(0, 6).map((edge) => <p key={edge.id} className={`rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs text-[color:var(--muted)] ${edge.animated ? 'flow-signal' : ''}`}>{edge.label}: {edge.type}</p>)}</div>
    </Card>
  );
}
