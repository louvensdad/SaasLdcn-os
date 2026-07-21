'use client';

import { ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import type { PlanView, SubscriptionView } from '@/lib/api/billing-catalog';

function formatPrice(priceCents: number | null, currency: string, undefinedLabel: string): string {
  if (priceCents === null) return undefinedLabel;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(priceCents / 100);
}

interface CurrentSubscriptionCardProps {
  readonly subscription: SubscriptionView;
  readonly plan: PlanView | null;
  readonly onChangePlan: () => void;
  readonly onCancel: () => void;
}

export function CurrentSubscriptionCard({ subscription, plan, onChangePlan, onCancel }: CurrentSubscriptionCardProps) {
  const { t, locale } = useLocale();
  const startedAt = new Date(subscription.started_at);
  const nextBilling = subscription.current_period_end ? new Date(subscription.current_period_end) : null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--success)_14%,transparent)]">
            <ShieldCheck className="h-5 w-5 text-[color:var(--success)]" aria-hidden />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[color:var(--text)]">{plan?.name ?? subscription.plan_code}</p>
              <Badge tone="success">{subscription.status}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {t('billing.currentPlan.since', { date: startedAt.toLocaleDateString(locale) })}
              {nextBilling ? ` · ${t('billing.currentPlan.nextBilling', { date: nextBilling.toLocaleDateString(locale) })}` : ''}
              {plan ? ` · ${formatPrice(plan.price_cents, plan.currency, t('pricing.plan.priceUndefined'))}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={onChangePlan}>
            {t('billing.currentPlan.changePlan')}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('billing.currentPlan.cancel')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
