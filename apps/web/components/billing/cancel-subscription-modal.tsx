'use client';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useLocale } from '@/hooks/use-locale';

interface CancelSubscriptionModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly busy: boolean;
  readonly planName: string;
}

export function CancelSubscriptionModal({ open, onClose, onConfirm, busy, planName }: CancelSubscriptionModalProps) {
  const { t } = useLocale();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('billing.cancelModal.title')}
      description={t('billing.cancelModal.description', { plan: planName })}
      icon={<AlertTriangle className="h-5 w-5 text-[color:var(--danger)]" />}
      busy={busy}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            {t('billing.cancelModal.keep')}
          </Button>
          <Button type="button" variant="danger" loading={busy} onClick={onConfirm}>
            {t('billing.cancelModal.confirm')}
          </Button>
        </>
      }
    >
      <ul className="space-y-2 text-sm leading-6 text-[color:var(--muted)]">
        <li>• {t('billing.cancelModal.consequenceAccess')}</li>
        <li>• {t('billing.cancelModal.consequencePreserved')}</li>
        <li>• {t('billing.cancelModal.consequenceResubscribe')}</li>
      </ul>
    </Modal>
  );
}
