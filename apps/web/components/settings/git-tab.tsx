'use client';

import { useState } from 'react';
import { Boxes, GitBranch, GitCommitHorizontal, Github, Gitlab, KeyRound, Link2, Plus, Rocket, Server } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SettingsToggleRow } from '@/components/settings/settings-toggle-row';
import { GitProviderDialog } from '@/components/settings/git-provider-dialog';
import { useGitProviderConnection } from '@/hooks/use-git-providers';
import { useGitPreferencesStore } from '@/stores/use-git-preferences-store';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';
import type { LucideIcon } from 'lucide-react';

type RealProvider = 'github' | 'gitlab';
type SubTab = 'integrations' | 'tokens';

interface ProviderDef {
  readonly id: string;
  readonly name: string;
  readonly Icon: LucideIcon;
  readonly color: string;
  readonly real?: RealProvider;
}

const PROVIDERS: readonly ProviderDef[] = [
  { id: 'github', name: 'GitHub', Icon: Github, color: '#f0f6fc', real: 'github' },
  { id: 'gitlab', name: 'GitLab', Icon: Gitlab, color: '#fc6d26', real: 'gitlab' },
  { id: 'bitbucket', name: 'Bitbucket', Icon: Boxes, color: '#2684ff' },
  { id: 'azure', name: 'Azure DevOps', Icon: Server, color: '#0078d4' },
  { id: 'gitea', name: 'Gitea', Icon: GitBranch, color: '#609926' },
];

const SUB_TABS: readonly { readonly id: SubTab; readonly Icon: LucideIcon }[] = [
  { id: 'integrations', Icon: Link2 },
  { id: 'tokens', Icon: KeyRound },
];

export function GitTab() {
  const { t } = useLocale();
  const [tab, setTab] = useState<SubTab>('integrations');
  const [openProvider, setOpenProvider] = useState<{ provider: RealProvider; label: string } | null>(null);

  return (
    <div className="space-y-5">
      <Card surface="secondary" className="rounded-[1.5rem] p-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('settings.git.title')}>
          {SUB_TABS.map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3.5 py-2 text-sm font-medium transition-colors',
                tab === id ? 'text-[color:var(--text)]' : 'text-[color:var(--muted)] hover:text-[color:var(--text)]',
              )}
              style={tab === id ? { background: 'color-mix(in srgb, var(--accent) 14%, transparent)' } : undefined}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(`settings.git.subtab.${id}`)}
            </button>
          ))}
        </div>
      </Card>

      {tab === 'integrations' ? <IntegrationsView onConfigure={setOpenProvider} /> : null}
      {tab === 'tokens' ? <TokensView onConfigure={setOpenProvider} /> : null}

      {openProvider ? (
        <GitProviderDialog open onClose={() => setOpenProvider(null)} provider={openProvider.provider} label={openProvider.label} />
      ) : null}
    </div>
  );
}

function IntegrationsView({ onConfigure }: { readonly onConfigure: (v: { provider: RealProvider; label: string }) => void }) {
  const { t } = useLocale();
  const prefs = useGitPreferencesStore();
  return (
    <div className="space-y-5">
      <Card surface="secondary" className="rounded-[1.5rem] p-5">
        <div>
          <h2 className="ds-section text-[color:var(--text)]">{t('settings.git.title')}</h2>
          <p className="mt-1 ds-body ds-text-muted">{t('settings.git.description')}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {PROVIDERS.map((provider) => <ProviderCard key={provider.id} def={provider} onConfigure={onConfigure} />)}
          <button
            type="button"
            disabled
            title={t('settings.git.addSoon')}
            className="flex min-h-[9.5rem] cursor-not-allowed flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-4 text-center opacity-70"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[color:var(--border)] text-[color:var(--muted)]"><Plus className="h-5 w-5" aria-hidden /></span>
            <p className="text-sm font-semibold text-[color:var(--text)]">{t('settings.git.addIntegration')}</p>
            <p className="ds-caption">{t('settings.git.addSoon')}</p>
          </button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<GitBranch className="h-4 w-4" />} title={t('settings.git.reposTitle')} />
          <EmptyState icon={<GitBranch className="h-6 w-6" />} message={t('settings.git.reposEmpty')} />
        </Card>
        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<GitCommitHorizontal className="h-4 w-4" />} title={t('settings.git.activityTitle')} />
          <EmptyState icon={<GitCommitHorizontal className="h-6 w-6" />} message={t('settings.git.activityEmpty')} />
        </Card>
      </div>

      <Card surface="secondary" className="rounded-[1.5rem] p-5">
        <SectionHeading icon={<GitBranch className="h-4 w-4" />} title={t('settings.git.globalTitle')} description={t('settings.git.globalDescription')} />
        <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          <SettingsToggleRow label={t('settings.git.signCommits')} description={t('settings.git.signCommitsHint')} checked={prefs.signCommits} onChange={(v) => prefs.set('signCommits', v)} />
          <SettingsToggleRow label={t('settings.git.protectedBranches')} description={t('settings.git.protectedBranchesHint')} checked={prefs.protectedBranchChecks} onChange={(v) => prefs.set('protectedBranchChecks', v)} />
          <SettingsToggleRow label={t('settings.git.autoSync')} description={t('settings.git.autoSyncHint')} checked={prefs.autoSync} onChange={(v) => prefs.set('autoSync', v)} />
          <SettingsToggleRow label={t('settings.git.autoCleanup')} description={t('settings.git.autoCleanupHint')} checked={prefs.autoCleanup} onChange={(v) => prefs.set('autoCleanup', v)} />
        </div>
      </Card>
    </div>
  );
}

function TokensView({ onConfigure }: { readonly onConfigure: (v: { provider: RealProvider; label: string }) => void }) {
  const { t } = useLocale();
  const prefs = useGitPreferencesStore();
  const realProviders = PROVIDERS.filter((p): p is ProviderDef & { real: RealProvider } => Boolean(p.real));

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <Card surface="secondary" className="rounded-[1.5rem] p-5">
        <div className="flex items-start justify-between gap-3">
          <SectionHeading icon={<KeyRound className="h-4 w-4" />} title={t('settings.git.tokensTitle')} description={t('settings.git.tokensDescription')} />
          <Button variant="secondary" onClick={() => onConfigure({ provider: 'github', label: 'GitHub' })}>
            <Plus className="h-4 w-4" /> {t('settings.git.newToken')}
          </Button>
        </div>
        <ul className="mt-4 space-y-2">
          {realProviders.map((provider) => <TokenRow key={provider.id} def={provider} onConfigure={onConfigure} />)}
        </ul>
      </Card>

      <div className="space-y-4">
        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Rocket className="h-4 w-4" />} title={t('settings.git.pipelinesRecentTitle')} />
          <EmptyState icon={<Rocket className="h-6 w-6" />} message={t('settings.git.pipelinesEmpty')} />
        </Card>
        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<GitBranch className="h-4 w-4" />} title={t('settings.git.advancedTitle')} description={t('settings.git.globalDescription')} />
          <div className="mt-4 space-y-3">
            <SettingsToggleRow label={t('settings.git.signCommits')} description={t('settings.git.signCommitsHint')} checked={prefs.signCommits} onChange={(v) => prefs.set('signCommits', v)} />
            <SettingsToggleRow label={t('settings.git.protectedBranches')} description={t('settings.git.protectedBranchesHint')} checked={prefs.protectedBranchChecks} onChange={(v) => prefs.set('protectedBranchChecks', v)} />
            <SettingsToggleRow label={t('settings.git.autoCleanup')} description={t('settings.git.autoCleanupHint')} checked={prefs.autoCleanup} onChange={(v) => prefs.set('autoCleanup', v)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function TokenRow({ def, onConfigure }: { readonly def: ProviderDef & { real: RealProvider }; readonly onConfigure: (v: { provider: RealProvider; label: string }) => void }) {
  const { locale, t } = useLocale();
  const connection = useGitProviderConnection(def.real);
  const data = connection.data;
  const connected = data?.status === 'connected';

  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)]" style={{ background: `color-mix(in srgb, ${def.color} 16%, transparent)`, color: def.color }}>
        <def.Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[color:var(--text)]">{t('settings.git.tokenName', { provider: def.name })}</p>
        <p className="t-mono truncate ds-caption">
          {connected ? (data?.masked ?? '••••••••') : t('settings.git.tokenNotSet')}
          {connected && data?.last_sync ? ` · ${t('settings.git.lastUsed', { time: new Date(data.last_sync).toLocaleString(locale) })}` : ''}
        </p>
      </div>
      <Badge tone={connected ? 'success' : 'neutral'} className="shrink-0">{connected ? t('settings.git.connected') : t('settings.git.notConnected')}</Badge>
      <Button variant="ghost" className="shrink-0" onClick={() => onConfigure({ provider: def.real, label: def.name })}>{t('settings.git.configure')}</Button>
    </li>
  );
}

function ProviderCard({ def, onConfigure }: { readonly def: ProviderDef; readonly onConfigure: (value: { provider: RealProvider; label: string }) => void }) {
  const { t } = useLocale();
  const connection = useGitProviderConnection((def.real ?? 'github'));
  const connected = Boolean(def.real) && connection.data?.status === 'connected';
  const status = !def.real ? 'soon' : connected ? 'connected' : 'disconnected';
  const repoCount = def.real && connected ? connection.data?.repositories_count ?? 0 : null;

  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] p-4 text-center">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)]" style={{ background: `color-mix(in srgb, ${def.color} 16%, transparent)`, color: def.color }}>
        <def.Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-[color:var(--text)]">{def.name}</p>
      <Badge tone={status === 'connected' ? 'success' : 'neutral'}>
        {status === 'connected' ? t('settings.git.connected') : status === 'soon' ? t('settings.git.soon') : t('settings.git.disconnected')}
      </Badge>
      <p className="ds-caption">
        {status === 'connected' && repoCount != null ? t('settings.git.repoCount', { count: String(repoCount) }) : status === 'soon' ? t('settings.git.soonHint') : t('settings.git.notConnected')}
      </p>
      {def.real ? (
        <Button variant="secondary" className="mt-auto w-full" onClick={() => onConfigure({ provider: def.real!, label: def.name })}>{t('settings.git.configure')}</Button>
      ) : (
        <Button variant="ghost" className="mt-auto w-full" disabled>{t('settings.git.soon')}</Button>
      )}
    </div>
  );
}

function SectionHeading({ icon, title, description }: { readonly icon: React.ReactNode; readonly title: string; readonly description?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)]" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>{icon}</span>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-[color:var(--text)]">{title}</h3>
        {description ? <p className="ds-caption mt-0.5">{description}</p> : null}
      </div>
    </div>
  );
}

function EmptyState({ icon, message }: { readonly icon: React.ReactNode; readonly message: string }) {
  return (
    <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[color:var(--border)] p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full text-[color:var(--muted)]" style={{ background: 'color-mix(in srgb, var(--muted) 10%, transparent)' }}>{icon}</span>
      <p className="ds-caption max-w-xs">{message}</p>
    </div>
  );
}
