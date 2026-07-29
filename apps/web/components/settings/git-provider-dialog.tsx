'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageError } from '@/components/feedback/error-system';
import { RetentionSelect } from '@/components/settings/retention-select';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useLocale } from '@/hooks/use-locale';
import {
  useConnectGitProvider, useDisconnectGitProvider, useGitProviderConnection, useValidateGitProvider,
} from '@/hooks/use-git-providers';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly provider: 'github' | 'gitlab';
  readonly label: string;
}

/** Configure dialog for a real Git provider: the full connect (token + TTL) /
 * validate / disconnect flow the old inline card had, now behind each provider
 * row's "Configurar" button to match the reference grid. */
export function GitProviderDialog({ open, onClose, provider, label }: Props) {
  const { locale, t } = useLocale();
  const connection = useGitProviderConnection(provider);
  const connect = useConnectGitProvider(provider);
  const validate = useValidateGitProvider(provider);
  const disconnect = useDisconnectGitProvider(provider);
  const [token, setToken] = useState('');
  const [ttlSeconds, setTtlSeconds] = useState<number | null>(null);
  const data = connection.data;
  const connected = data?.status === 'connected';
  const error = connect.error ?? validate.error ?? disconnect.error ?? connection.error;

  async function submit() {
    if (!token.trim()) return;
    try {
      await connect.mutateAsync({ token: token.trim(), ttlSeconds });
      setToken('');
    } catch {
      // React Query exposes the recoverable provider error inline below.
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={label} description={t('settings.git.dialogDescription', { provider: label })}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="ds-caption">{t('settings.git.statusLabel')}</span>
          <Badge tone={connected ? 'success' : 'neutral'}>
            {connected ? t('settings.git.connected') : t('settings.git.disconnected')}
          </Badge>
        </div>

        {connected && data ? (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <Detail label={t('settings.integrations.username')} value={data.username ?? t('common.unavailable')} />
              <Detail label={provider === 'github' ? t('settings.integrations.repositories') : t('settings.integrations.projects')} value={String(data.repositories_count)} />
              <Detail label={t('settings.integrations.permission')} value={data.permission} />
              <Detail label={t('settings.integrations.lastSync')} value={data.last_sync ? new Date(data.last_sync).toLocaleString(locale) : t('common.never')} />
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" loading={validate.isPending} onClick={() => validate.mutate()}>{t('settings.integrations.validate')}</Button>
              <Button variant="ghost" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>{t('settings.integrations.disconnect', { provider: label })}</Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <Input
              type="password"
              name={`${provider}-token`}
              autoComplete="off"
              spellCheck={false}
              aria-label={t('settings.integrations.tokenLabel', { provider: label })}
              placeholder={t('settings.integrations.tokenLabel', { provider: label })}
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            <p className="ds-caption">{t('settings.integrations.tokenDescription')}</p>
            <RetentionSelect value={ttlSeconds} onChange={setTtlSeconds} defaultOptionLabel={t('settings.retention.gitDefault')} disabled={connect.isPending} className="max-w-xs" />
            <Button variant="primary" disabled={!token.trim()} loading={connect.isPending} onClick={() => void submit()}>{t('settings.integrations.connect', { provider: label })}</Button>
          </div>
        )}

        {error ? <PageError title={t('settings.integrations.errorTitle', { provider: label })} description={getApiErrorMessage(error, t('settings.integrations.errorDescription', { provider: label }))} className="p-4" /> : null}
      </div>
    </Modal>
  );
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="ds-caption">{label}</dt>
      <dd className="truncate text-sm font-semibold text-[color:var(--text)]">{value}</dd>
    </div>
  );
}
