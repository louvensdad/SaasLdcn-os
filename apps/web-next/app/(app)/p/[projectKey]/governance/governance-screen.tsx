'use client';

import Link from 'next/link';

import { useQuery } from '@tanstack/react-query';

import { Signal } from '@/components/signal';
import { Badge, Kv, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

export function GovernanceScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const exceptions = useQuery({ queryKey: ['policy-exceptions'], queryFn: api.policyExceptions, retry: false });
  const github = useQuery({ queryKey: ['git-integration', 'github'], queryFn: () => api.gitIntegration('github'), retry: false });
  const gitlab = useQuery({ queryKey: ['git-integration', 'gitlab'], queryFn: () => api.gitIntegration('gitlab'), retry: false });

  const mine = (exceptions.data ?? []).filter((exception) => !exception.project_id || exception.project_id === projectKey);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.governance')}</span><span className="chip mono">{projectKey}</span></div>
          <h1 className="title">{t('governance.title')}</h1>
          <p className="lede">{t('governance.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('governance.sandbox.title')}</h2>
          <span className="meta">{t('governance.sandbox.meta', { count: mine.length })}</span>
        </div>
        {exceptions.isPending ? <Skeleton lines={3} /> : null}
        {exceptions.isError ? <StateBlock kind="error" title={t('governance.sandbox.unreadable')} /> : null}
        {exceptions.data && mine.length === 0 ? (
          <StateBlock kind="empty" title={t('governance.sandbox.none')}>{t('governance.sandbox.noneBody')}</StateBlock>
        ) : null}
        {mine.length > 0 ? (
          <div className="list">
            {mine.map((exception) => (
              <div className="li" key={exception.id}>
                <Signal family={exception.revoked_at ? 'stop' : 'caution'} label={exception.program} />
                <span className="li-title mono">{exception.program}</span>
                <span className="meta">
                  <Badge value={exception.revoked_at ? 'REVOKED' : 'ACTIVE'} family={exception.revoked_at ? 'stop' : 'caution'} />
                </span>
                <span className="li-sub">
                  {exception.reason} · {t('governance.sandbox.until', { when: formatWhen(exception.expires_at, locale) })}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('governance.sandbox.note')}</p>
        <Source>GET /api/execution/policy-exceptions</Source>
      </section>

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('governance.integrations.title')}</h2></div>
        <div className="grid g-2">
          {[['github', github], ['gitlab', gitlab]].map(([name, query]) => {
            const provider = name as string;
            const result = query as typeof github;
            return (
              <div className="panel" key={provider}>
                <div className="panel-head">
                  <h3 className="h-sub mono">{provider}</h3>
                  {result.data ? <Badge value={result.data.status} family={familyFor(result.data.status)} /> : null}
                </div>
                <div className="panel-body stack">
                  {result.isPending ? <Skeleton lines={2} /> : null}
                  {result.isError ? <p className="meta">{t('governance.integrations.unreadable')}</p> : null}
                  {result.data ? (
                    <Kv
                      pairs={[
                        [t('governance.integrations.account'), <span key="a" className="mono">{result.data.username ?? '—'}</span>],
                        [t('governance.integrations.scopes'), result.data.scopes && result.data.scopes.length > 0
                          ? <span key="s" className="chips">{result.data.scopes.map((scope) => <span className="chip mono" key={scope}>{scope}</span>)}</span>
                          : <span key="s" className="meta">—</span>],
                        [t('governance.integrations.validated'), result.data.last_sync ? formatWhen(String(result.data.last_sync), locale) : '—'],
                      ]}
                    />
                  ) : null}
                  <Link className="btn btn-quiet btn-sm" href="/settings/integrations">{t('governance.integrations.manage')}</Link>
                </div>
              </div>
            );
          })}
        </div>
        <p className="meta" style={{ marginTop: 10 }}>{t('governance.integrations.note')}</p>
        <Source>GET /api/integrations/git/{'{'}provider{'}'}</Source>
      </section>
    </>
  );
}
