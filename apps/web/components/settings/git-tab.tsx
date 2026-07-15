'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageError } from '@/components/feedback/error-system';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsMetricCard } from '@/components/settings/settings-metric-card';
import { RetentionSelect } from '@/components/settings/retention-select';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useLocale } from '@/hooks/use-locale';
import {
  useConnectGitProvider,
  useDisconnectGitProvider,
  useGitProviderConnection,
  useValidateGitProvider,
} from '@/hooks/use-git-providers';

export function GitTab() {
  const { t } = useLocale();
  return (
    <SettingsSection title={t('settings.git.title')} description={t('settings.git.description')}>
      <div className="grid gap-4 xl:grid-cols-2">
        <GitProviderCard provider="github" />
        <GitProviderCard provider="gitlab" />
      </div>
    </SettingsSection>
  );
}

function GitProviderCard({ provider }: { readonly provider: 'github' | 'gitlab' }) {
  const { locale, t } = useLocale();
  const label = provider === 'github' ? 'GitHub' : 'GitLab';
  const connection = useGitProviderConnection(provider);
  const connect = useConnectGitProvider(provider);
  const validate = useValidateGitProvider(provider);
  const disconnect = useDisconnectGitProvider(provider);
  const [token, setToken] = useState('');
  const [ttlSeconds, setTtlSeconds] = useState<number | null>(null);
  const data = connection.data;
  const connected = data?.status === 'connected';
  const error = connect.error ?? validate.error ?? disconnect.error ?? connection.error;

  const submit = async () => {
    if (!token.trim()) return;
    try {
      await connect.mutateAsync({ token: token.trim(), ttlSeconds });
      setToken('');
    } catch {
      // React Query exposes the recoverable provider error inline below.
    }
  };

  return (
    <Card className="space-y-5 p-5" data-testid={`${provider}-integration`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {data?.avatar_url ? <img src={data.avatar_url} alt="" className="h-11 w-11 rounded-full border border-white/10" /> : null}
          <div>
            <p className="t-overline">{label}</p>
            <h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">
              {connected ? t('settings.integrations.connected', { provider: label }) : t('settings.integrations.notConnected', { provider: label })}
            </h3>
          </div>
        </div>
        <Badge tone={connected ? 'success' : 'neutral'}>{data?.status ?? t('common.loading')}</Badge>
      </div>

      {connected && data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsMetricCard label={t('settings.integrations.username')} value={data.username ?? t('common.unavailable')} />
            <SettingsMetricCard label={provider === 'github' ? t('settings.integrations.organizations') : t('settings.integrations.groups')} value={String(data.namespaces.length)} />
            <SettingsMetricCard label={provider === 'github' ? t('settings.integrations.repositories') : t('settings.integrations.projects')} value={String(data.repositories_count)} />
            <SettingsMetricCard label={t('settings.integrations.permission')} value={data.permission} />
            <SettingsMetricCard label={t('settings.integrations.scopes')} value={data.scopes.join(', ') || t('settings.integrations.providerManaged')} />
            <SettingsMetricCard label={t('settings.integrations.lastSync')} value={data.last_sync ? new Date(data.last_sync).toLocaleString(locale) : t('common.never')} />
            <SettingsMetricCard
              label={t('settings.retention.label')}
              value={data.expires_at
                ? t('settings.retention.expiresAt', {
                    date: new Date(data.expires_at).toLocaleString(locale),
                  })
                : t('settings.retention.untilDisconnect')}
            />
          </div>
          <div className="flex flex-wrap gap-3">
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
          <RetentionSelect
            value={ttlSeconds}
            onChange={setTtlSeconds}
            defaultOptionLabel={t('settings.retention.gitDefault')}
            disabled={connect.isPending}
            className="max-w-xs"
          />
          <Button variant="primary" disabled={!token.trim()} loading={connect.isPending} onClick={() => void submit()}>{t('settings.integrations.connect', { provider: label })}</Button>
        </div>
      )}

      {error ? <PageError title={t('settings.integrations.errorTitle', { provider: label })} description={getApiErrorMessage(error, t('settings.integrations.errorDescription', { provider: label }))} className="p-4" /> : null}
    </Card>
  );
}
