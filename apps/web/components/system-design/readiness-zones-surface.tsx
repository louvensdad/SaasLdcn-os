'use client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ReadinessZone } from '@/lib/api/types';
import { useLocale } from '@/hooks/use-locale';
export function ReadinessZonesSurface({ zones }: { readonly zones: readonly ReadinessZone[] }) {
  const { t } = useLocale();
  return (
    <Card className="grid gap-4 p-5" data-testid="readiness-zones-surface">
      <div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('systemDesign.readiness.title')}</p><p className="mt-2 text-sm text-[color:var(--muted)]">{t('systemDesign.readiness.description')}</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{zones.map((zone) => <div key={zone.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.035] p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">{zone.label}</p><Badge>{zone.status}</Badge></div><p className="mt-3 text-2xl font-semibold text-[color:var(--text)]">{zone.score}</p></div>)}</div>
    </Card>
  );
}
