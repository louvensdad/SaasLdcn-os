'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Kv, Failure, Skeleton, Source } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

const PROVIDERS = ['github', 'gitlab'] as const;

export function IntegrationsScreen() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [tokens, setTokens] = useState<Record<string, string>>({ github: '', gitlab: '' });

  const github = useQuery({ queryKey: ['git-integration', 'github'], queryFn: () => api.gitIntegration('github'), retry: false });
  const gitlab = useQuery({ queryKey: ['git-integration', 'gitlab'], queryFn: () => api.gitIntegration('gitlab'), retry: false });
  const queries = { github, gitlab } as const;

  const connect = useMutation({
    mutationFn: ({ provider, token }: { readonly provider: 'github' | 'gitlab'; readonly token: string }) => api.connectGit(provider, token),
    onSuccess: (_result, variables) => {
      setTokens((current) => ({ ...current, [variables.provider]: '' }));
      void queryClient.invalidateQueries({ queryKey: ['git-integration', variables.provider] });
    },
  });
  const validate = useMutation({
    mutationFn: (provider: 'github' | 'gitlab') => api.validateGit(provider),
    onSuccess: (_result, provider) => queryClient.invalidateQueries({ queryKey: ['git-integration', provider] }),
  });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.settings')}</span></div>
          <h1 className="title">{t('settings.integrations.title')}</h1>
          <p className="lede">{t('settings.integrations.lede')}</p>
        </div>
      </div>

      {connect.isError ? <Failure title={t('settings.integrations.failed')} error={connect.error} /> : null}

      <div className="grid g-2">
        {PROVIDERS.map((provider) => {
          const query = queries[provider];
          const connection = query.data;
          return (
            <section className="sec" key={provider}>
              <div className="sec-head">
                <h2 className="h-sec mono">{provider}</h2>
                {connection ? <Badge value={connection.status} family={familyFor(connection.status)} /> : null}
              </div>
              {query.isPending ? <Skeleton lines={3} /> : null}
              {connection ? (
                <Kv
                  pairs={[
                    [t('governance.integrations.account'), <span key="a" className="mono">{connection.username ?? '—'}</span>],
                    [t('settings.integrations.namespaces'), connection.namespaces.length > 0
                      ? <span key="n" className="chips">{connection.namespaces.map((namespace) => <span className="chip mono" key={namespace}>{namespace}</span>)}</span>
                      : <span key="n" className="meta">—</span>],
                    [t('settings.integrations.repositories'), <span key="r" className="num">{connection.repositories_count}</span>],
                    [t('governance.integrations.scopes'), connection.scopes.length > 0 ? connection.scopes.join(', ') : '—'],
                    [t('governance.integrations.validated'), connection.last_sync ? formatWhen(String(connection.last_sync), locale) : '—'],
                    [t('settings.integrations.expires'), connection.expires_at ? formatWhen(String(connection.expires_at), locale) : t('settings.integrations.noExpiry')],
                  ]}
                />
              ) : null}
              <label className="field" style={{ marginTop: 12 }}>
                <span className="field-label">{t('settings.integrations.token', { provider })}</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={tokens[provider] ?? ''}
                  onChange={(event) => setTokens((current) => ({ ...current, [provider]: event.target.value }))}
                />
                <span className="hint">{t('settings.integrations.tokenHint')}</span>
              </label>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={connect.isPending || !(tokens[provider] ?? '').trim()}
                  onClick={() => connect.mutate({ provider, token: tokens[provider] ?? '' })}
                >
                  {t('settings.integrations.connect')}
                </button>
                <button className="btn btn-ghost" type="button" disabled={validate.isPending || connection?.status !== 'connected'} onClick={() => validate.mutate(provider)}>
                  {t('settings.integrations.validate')}
                </button>
              </div>
              <Source>GET · POST /api/integrations/git/{provider}</Source>
            </section>
          );
        })}
      </div>

      <section className="sec">
        <p className="meta">{t('settings.integrations.note')}</p>
      </section>
    </>
  );
}
