'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { apiClient } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useLocale } from '@/hooks/use-locale';
import { useAuthStore } from '@/stores/use-auth-store';
import type { TwoFactorEnrollResponse } from '@/lib/api/types';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  /** When true the dialog runs the "disable" flow; otherwise the enroll flow. */
  readonly mode: 'enroll' | 'disable';
}

export function TwoFactorDialog({ open, onClose, mode }: Props) {
  const { t } = useLocale();
  const setUser = useAuthStore((state) => state.setUser);
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollResponse | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) {
      setEnrollment(null);
      setCode('');
      setError(null);
      setCopied(false);
      return;
    }
    if (mode === 'enroll') {
      setBusy(true);
      setError(null);
      apiClient
        .enrollTwoFactor()
        .then(setEnrollment)
        .catch(setError)
        .finally(() => setBusy(false));
    }
  }, [open, mode]);

  async function copySecret() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied: the secret is still shown for manual entry.
    }
  }

  async function submit() {
    if (code.trim().length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const updated = mode === 'enroll'
        ? await apiClient.verifyTwoFactor({ code: code.trim() })
        : await apiClient.disableTwoFactor({ code: code.trim() });
      setUser(updated);
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'enroll' ? t('settings.account.twoFactorEnrollTitle') : t('settings.account.twoFactorDisableTitle')}
      description={mode === 'enroll' ? t('settings.account.twoFactorEnrollDescription') : t('settings.account.twoFactorDisableDescription')}
      icon={<ShieldCheck className="h-5 w-5 text-[color:var(--accent)]" />}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('settings.account.cancel')}
          </Button>
          <Button
            variant={mode === 'disable' ? 'danger' : 'primary'}
            onClick={() => void submit()}
            loading={busy}
            disabled={busy || code.trim().length < 6 || (mode === 'enroll' && !enrollment)}
          >
            {mode === 'enroll' ? t('settings.account.twoFactorEnableConfirm') : t('settings.account.twoFactorDisableConfirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mode === 'enroll' && enrollment ? (
          <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
            <p className="ds-caption">{t('settings.account.twoFactorSecretLabel')}</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="t-mono flex-1 break-all rounded bg-[color:var(--surface-2)] px-2 py-1 text-sm text-[color:var(--text)]">
                {enrollment.secret}
              </code>
              <IconButton variant="secondary" size="sm" onClick={() => void copySecret()} aria-label={t('settings.account.twoFactorCopySecret')}>
                {copied ? <Check className="h-4 w-4 text-[color:var(--success)]" /> : <Copy className="h-4 w-4" />}
              </IconButton>
            </div>
            <p className="mt-2 ds-caption">{t('settings.account.twoFactorSecretHint')}</p>
          </div>
        ) : null}

        <label className="grid gap-2 text-sm font-medium text-[color:var(--text)]">
          <span>{t('settings.account.twoFactorCodeLabel')}</span>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
            error={Boolean(error)}
          />
        </label>

        {error ? (
          <p role="alert" className="ds-caption text-[color:var(--danger)]">
            {getApiErrorMessage(error, t('settings.account.twoFactorError'))}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
