'use client';

import { Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useLocale } from '@/hooks/use-locale';
import type { PlanView } from '@/lib/api/billing-catalog';

function formatPrice(priceCents: number | null, currency: string, undefinedLabel: string): string {
  if (priceCents === null) return undefinedLabel;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(priceCents / 100);
}

interface SubscribeConfirmationModalProps {
  readonly plan: PlanView | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly busy: boolean;
}

export function SubscribeConfirmationModal({ plan, onClose, onConfirm, busy }: SubscribeConfirmationModalProps) {
  const { t } = useLocale();
  if (!plan) return null;
  return (
    <Modal
      open={Boolean(plan)}
      onClose={onClose}
      title={t('billing.subscribeModal.title', { plan: plan.name })}
      description={t('billing.subscribeModal.description')}
      icon={<Wallet className="h-5 w-5 text-[color:var(--accent)]" />}
      busy={busy}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {t('billing.subscribeModal.cancel')}
          </Button>
          <Button type="button" variant="primary" loading={busy} onClick={onConfirm}>
            {t('billing.subscribeModal.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[color:var(--muted)]">{t('billing.subscribeModal.plan')}</span>
          <span className="text-sm font-semibold text-[color:var(--text)]">{plan.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[color:var(--muted)]">{t('billing.subscribeModal.price')}</span>
          <span className="text-sm font-semibold text-[color:var(--text)]">
            {formatPrice(plan.price_cents, plan.currency, t('pricing.plan.priceUndefined'))}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[color:var(--muted)]">{t('billing.subscribeModal.billingCycle')}</span>
          <span className="text-sm font-semibold text-[color:var(--text)]">{t('billing.subscribeModal.monthly')}</span>
        </div>
      </div>
    </Modal>
  );
}
