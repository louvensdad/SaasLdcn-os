'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Signal } from '@/components/signal';
import { Badge, Kv, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { rememberedWorkspace, rememberWorkspace } from '@/lib/session/session';

export function WorkspaceSettingsScreen() {
  const { t, locale } = useI18n();
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => setCurrent(rememberedWorkspace()), []);

  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces, retry: false });
  const organizations = useQuery({ queryKey: ['organizations'], queryFn: api.organizations, retry: false });
  const selected = current ?? workspaces.data?.[0]?.workspace_id ?? null;
  const members = useQuery({
    queryKey: ['workspace-members', selected],
    queryFn: () => api.workspaceMembers(String(selected)),
    enabled: Boolean(selected),
    retry: false,
  });

  const choose = (workspaceId: string) => {
    rememberWorkspace(workspaceId);
    setCurrent(workspaceId);
  };

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.settings')}</span></div>
          <h1 className="title">{t('settings.workspace.title')}</h1>
          <p className="lede">{t('settings.workspace.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('settings.workspace.list.title')}</h2>
          <span className="meta">{t('settings.workspace.list.meta', { count: workspaces.data?.length ?? 0 })}</span>
        </div>
        {workspaces.isPending ? <Skeleton lines={3} /> : null}
        {workspaces.data && workspaces.data.length > 0 ? (
          <div className="list">
            {workspaces.data.map((workspace) => (
              <div className="li" key={workspace.workspace_id}>
                <Signal family={workspace.workspace_id === selected ? 'proof' : 'idle'} label={workspace.name} />
                <span className="li-title">{workspace.name}</span>
                <span className="meta">
                  {workspace.workspace_id === selected
                    ? <Badge value="CURRENT" family="proof" />
                    : <button className="btn btn-quiet btn-sm" type="button" onClick={() => choose(workspace.workspace_id)}>{t('settings.workspace.list.use')}</button>}
                </span>
                <span className="li-sub">
                  <span className="mono">{workspace.workspace_id}</span>
                  {' · '}
                  {workspace.is_personal ? t('workspace.personal') : t('workspace.team')}
                  {' · '}
                  {t('workspace.role', { role: workspace.role })}
                  {' · '}
                  {t('workspace.since', { when: formatWhen(workspace.created_at, locale, false) })}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('settings.workspace.list.note')}</p>
        <Source>GET /api/workspaces</Source>
      </section>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('settings.workspace.members.title')}</h2>
            <span className="meta">{t('settings.workspace.members.meta', { count: members.data?.length ?? 0 })}</span>
          </div>
          {members.isPending && selected ? <Skeleton lines={3} /> : null}
          {members.isError ? <StateBlock kind="error" title={t('settings.workspace.members.unreadable')} /> : null}
          {members.data && members.data.length > 0 ? (
            <div className="list">
              {members.data.map((member) => (
                <div className="li" key={member.user_id}>
                  <Signal family={member.role === 'owner' ? 'proof' : 'idle'} label={member.user_id} />
                  <span className="li-title mono">{member.email || member.user_id}</span>
                  <span className="meta"><Badge value={member.role} family="idle" /></span>
                  <span className="li-sub">{formatWhen(member.created_at, locale, false)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <p className="meta" style={{ marginTop: 10 }}>{t('settings.workspace.members.note')}</p>
          <Source>GET /api/workspaces/{'{'}workspace_id{'}'}/members</Source>
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('settings.workspace.orgs.title')}</h2>
            <span className="meta">{t('settings.workspace.orgs.meta', { count: organizations.data?.length ?? 0 })}</span>
          </div>
          {organizations.isPending ? <Skeleton lines={3} /> : null}
          {organizations.data && organizations.data.length > 0 ? (
            <div className="list">
              {organizations.data.map((organization) => (
                <div className="li" key={organization.organization_id}>
                  <Signal family="idle" label={organization.name} />
                  <span className="li-title">{organization.name}</span>
                  <span className="meta"><Badge value={organization.role} family="idle" /></span>
                  <span className="li-sub mono">{organization.organization_id}</span>
                </div>
              ))}
            </div>
          ) : null}
          <Source>GET /api/organizations</Source>
        </section>
      </div>

      <section className="sec">
        <Kv pairs={[[t('settings.workspace.remembered'), <span key="r" className="mono">{selected ?? '—'}</span>]]} />
        <p className="meta" style={{ marginTop: 8 }}>{t('settings.workspace.rememberedNote')}</p>
      </section>
    </>
  );
}
