'use client';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { RiskZone } from '@/lib/api/types';
import { useLocale } from '@/hooks/use-locale';
export function RiskZonesSurface({ zones }: { readonly zones: readonly RiskZone[] }) {
  const { t } = useLocale();
  return (
    <Card className="grid gap-4 p-5" data-testid="risk-zones-surface">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('systemDesign.risk.title')}</p><p className="mt-2 text-sm text-[color:var(--muted)]">{t('systemDesign.risk.description')}</p></div><AlertTriangle className="h-5 w-5 text-[color:var(--warning)]" /></div>
      <div className="grid gap-2">{zones.slice(0, 5).map((zone) => <div key={zone.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/15 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-[color:var(--text)]">{zone.label}</p><Badge>{zone.severity}</Badge></div><p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{zone.summary}</p></div>)}</div>
    </Card>
  );
}
