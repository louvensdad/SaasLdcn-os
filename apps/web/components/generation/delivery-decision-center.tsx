'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { useDeliveryDecision, useRecordDeliveryDecision } from '@/hooks/use-delivery-decision';
import type { DeliveryMode } from '@contracts/delivery.contract';

interface DeliveryDecisionCenterProps {
  readonly projectId: string;
}

// Generation finishing and how the user wants the output delivered are
// independent decisions (Delivery Freedom Policy) -- this panel only
// recommends and records a preference. The existing Download ZIP button and
// <ExportPanel /> below stay reachable regardless of what's chosen here.
export function DeliveryDecisionCenter({ projectId }: DeliveryDecisionCenterProps) {
  const { t } = useLocale();
  const { data, isLoading } = useDeliveryDecision(projectId);
  const recordDecision = useRecordDeliveryDecision(projectId);
  const [selected, setSelected] = useState<DeliveryMode | null>(null);

  useEffect(() => {
    if (!data || !Array.isArray(data.options)) return;
    const current = data.current_profile?.delivery_mode;
    const recommended = data.options.find((option) => option.recommended)?.mode;
    setSelected((prev) => prev ?? current ?? recommended ?? null);
  }, [data]);

  // Defensive: an unmocked/unexpected response shape (e.g. a test's generic
  // catch-all route stub) must never crash this panel -- it's additive to an
  // already-working screen, never load-bearing for it.
  if (isLoading || !data || !Array.isArray(data.options)) return null;

  if (data.blocked) {
    return (
      <section className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-700 dark:text-amber-300">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" />
          {t('metaFactory.delivery.blockedTitle')}
        </div>
        <p>{data.block_reason || t('metaFactory.delivery.blockedDetail')}</p>
      </section>
    );
  }

  const confirmedMode = recordDecision.isSuccess ? recordDecision.data?.current_profile?.delivery_mode : data.current_profile?.delivery_mode;

  return (
    <section className="mt-6 rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('metaFactory.delivery.approvedTitle')}
        </h3>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t('metaFactory.delivery.question')}</p>

      <div className="grid gap-2">
        {data.options.map((option) => (
          <label
            key={option.mode}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3 text-sm transition hover:bg-background/60 has-[:checked]:border-[color:var(--accent)] has-[:checked]:bg-background/60"
          >
            <input
              type="radio"
              name="delivery-mode"
              className="mt-1"
              checked={selected === option.mode}
              onChange={() => setSelected(option.mode)}
            />
            <span className="flex-1">
              <span className="flex items-center gap-2 font-medium">
                {t(`metaFactory.delivery.option.${option.mode}`)}
                {option.recommended && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-[color:var(--accent)]">
                    <Sparkles className="h-3 w-3" />
                    {t('metaFactory.delivery.recommended')}
                  </span>
                )}
              </span>
              {option.reason && <span className="text-xs text-muted-foreground">{option.reason}</span>}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          type="button"
          onClick={() => selected && recordDecision.mutate(selected)}
          disabled={!selected || recordDecision.isPending}
          className="rounded-xl"
        >
          {recordDecision.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {t('metaFactory.delivery.confirm')}
        </Button>
        {confirmedMode && (
          <span className="text-xs text-muted-foreground">
            {confirmedMode === 'ldcn_only'
              ? t('metaFactory.delivery.confirmedLdcnOnly')
              : t('metaFactory.delivery.confirmedUseActionsBelow')}
          </span>
        )}
      </div>
    </section>
  );
}
