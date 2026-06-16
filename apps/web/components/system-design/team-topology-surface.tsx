'use client';
import { UsersRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TeamTopology } from '@/lib/api/types';
import { useLocale } from '@/hooks/use-locale';
export function TeamTopologySurface({ topology }: { readonly topology: TeamTopology }) {
  const { t } = useLocale();
  return (
    <Card className="grid gap-4 p-5" data-testid="team-topology-surface">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('systemDesign.team.title')}</p><p className="mt-2 text-sm text-[color:var(--muted)]">{topology.coordination}</p></div><UsersRound className="h-5 w-5 text-[color:var(--success)]" /></div>
      <div className="grid gap-2 sm:grid-cols-2">{topology.nodes.slice(0, 6).map((node) => <div key={node.id} className="rounded-lg border border-white/10 bg-black/15 px-3 py-2"><p className="text-sm font-semibold text-[color:var(--text)]">{node.label}</p><p className="text-xs text-[color:var(--muted)]">{node.detail}</p></div>)}</div>
      <Badge className="w-fit border-white/10 bg-white/[0.04]">{t('systemDesign.team.requiredMaturity')}: {topology.maturity}</Badge>
    </Card>
  );
}
