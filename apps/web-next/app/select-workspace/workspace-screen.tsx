'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PublicHead } from '@/components/public-head';
import { Icon } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { rememberedWorkspace, rememberWorkspace, safeNext, useSession } from '@/lib/session/session';

/** After sign-in (the vault's login flow): choose the workspace; skipped when the account has only one. */
export function WorkspaceScreen() {
  const { t, locale } = useI18n();
  const { state } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNext(search.get('next'));
  const signedIn = state.status === 'signed-in';
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces, enabled: signedIn });
  const organizations = useQuery({ queryKey: ['organizations'], queryFn: api.organizations, enabled: signedIn });
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => setLast(rememberedWorkspace()), []);

  useEffect(() => {
    if (state.status === 'signed-out') router.replace(`/signin?next=${encodeURIComponent(next)}`);
  }, [state.status, next, router]);

  useEffect(() => {
    const list = workspaces.data;
    if (!list || list.length > 1) return;
    if (list[0]) rememberWorkspace(list[0].workspace_id);
    router.replace(next);
  }, [workspaces.data, next, router]);

  const choose = (workspaceId: string) => {
    rememberWorkspace(workspaceId);
    router.replace(next);
  };

  const orgName = (organizationId: string) => organizations.data?.find((o) => o.organization_id === organizationId)?.name;
  const list = workspaces.data ?? [];

  let content;
  if (workspaces.isError) {
    content = (
      <StateBlock
        kind="error"
        title={t('workspace.error.title')}
        action={
          <div className="btn-row">
            <button className="btn btn-primary btn-sm" type="button" onClick={() => void workspaces.refetch()}>{t('common.retry')}</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => router.replace(next)}>{t('workspace.continue')}</button>
          </div>
        }
      >
        {t('workspace.error.body')}
      </StateBlock>
    );
  } else if (!workspaces.data || list.length <= 1) {
    content = <div role="status" aria-live="polite"><p className="meta">{t('workspace.loading')}</p><Skeleton lines={2} /></div>;
  } else {
    content = (
      <>
        <p className="body ink2">{t('workspace.body', { count: list.length })}</p>
        <div className="list">
          {list.map((workspace) => (
            <button key={workspace.workspace_id} className="li li-link li-button" type="button" onClick={() => choose(workspace.workspace_id)}>
              <Icon name={workspace.is_personal ? 'file' : 'workforce'} className="sig" />
              <span className="li-title">{workspace.name}</span>
              {workspace.workspace_id === last ? <Badge value="CURRENT" family="proof" human={t('workspace.last')} /> : <span />}
              {/* Every personal workspace is called "Personal Workspace", so the id and the date are what tell two apart. */}
              <span className="li-sub">
                {workspace.is_personal ? t('workspace.personal') : `${t('workspace.team')}${orgName(workspace.organization_id) ? ` · ${orgName(workspace.organization_id)}` : ''}`}
                {' · '}
                {t('workspace.role', { role: workspace.role })}
                {' · '}
                {t('workspace.since', { when: formatWhen(workspace.created_at, locale, false) })}
                <br />
                <span className="mono">{workspace.workspace_id}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="meta">{t('workspace.create')}</p>
      </>
    );
  }

  return (
    <div className="public">
      <PublicHead />
      <main className="public-main" id="main">
        <div className="public-inner">
          <div className="auth-card" style={{ maxWidth: 640, margin: '24px auto 0' }}>
            <span className="label">{signedIn ? t('workspace.label', { email: state.user.email }) : t('shell.checking')}</span>
            <h1 className="title">{t('workspace.title')}</h1>
            {content}
            <Source>GET /api/workspaces · GET /api/organizations</Source>
          </div>
        </div>
      </main>
    </div>
  );
}
