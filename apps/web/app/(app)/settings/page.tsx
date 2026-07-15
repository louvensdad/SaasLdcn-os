'use client';

import { useState } from 'react';
import type { LocaleCode } from '@contracts/locale.contract';
import { useRouter } from 'next/navigation';
import { Activity, Check, Code2, GitBranch, Palette, Sparkles, User, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { PageError } from '@/components/feedback/error-system';
import { SectionHeader } from '@/components/shell/section-header';
import { LocaleSelector } from '@/components/shell/locale-selector';
import { Select } from '@/components/ui/select';
import { ThemeGallery } from '@/components/settings/theme-gallery';
import { AiProvidersTab } from '@/components/settings/ai-providers-tab';
import { RetentionSelect } from '@/components/settings/retention-select';
import { ArchitectureGraphSurface, OperationalRail, StackEcosystemMap } from '@/components/visual/engineering-surface';
import { useArchitectures } from '@/hooks/use-architectures';
import { useArchetypes } from '@/hooks/use-archetypes';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useFrameworks } from '@/hooks/use-frameworks';
import { useHealth } from '@/hooks/use-health';
import { useLanguages } from '@/hooks/use-languages';
import { useProjects } from '@/hooks/use-projects';
import { useStacks } from '@/hooks/use-stacks';
import { API_BASE_URL } from '@/lib/api/endpoints';
import { apiClient } from '@/lib/api/client';
import { getApiErrorMessage, isApiOffline } from '@/lib/api/errors';
import { useLocale } from '@/hooks/use-locale';
import { LOCALES } from '@/lib/i18n';
import { useLocaleStore } from '@/stores/use-locale-store';
import { useAuthStore } from '@/stores/use-auth-store';
import {
  useConnectGitProvider,
  useDisconnectGitProvider,
  useGitProviderConnection,
  useValidateGitProvider,
} from '@/hooks/use-git-providers';

export default function SettingsPage() {
  const { t } = useLocale();

  const items: TabItem[] = [
    { id: 'account', label: t('settings.tabs.account'), icon: User, content: <AccountTab /> },
    { id: 'ai', label: t('settings.tabs.ai'), icon: Sparkles, content: <AiProvidersTab /> },
    { id: 'git', label: t('settings.tabs.git'), icon: GitBranch, content: <GitTab /> },
    { id: 'interface', label: t('settings.tabs.interface'), icon: Palette, content: <InterfaceTab /> },
    { id: 'runtime', label: t('settings.tabs.runtime'), icon: Activity, content: <RuntimeTab /> },
    { id: 'advanced', label: t('settings.tabs.advanced'), icon: Code2, content: <AdvancedTab /> },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <SectionHeader title={t('settings.title')} description={t('settings.description')} />
      <Tabs items={items} defaultTab="account" />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Account
// --------------------------------------------------------------------------- //

function AccountTab() {
  const router = useRouter();
  const { t } = useLocale();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [busy, setBusy] = useState<'export' | 'delete' | 'logout' | null>(null);
  const [error, setError] = useState<unknown>(null);

  const name = user?.full_name?.trim() || user?.email || '—';
  const initials = name.replace(/[^a-zA-Z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'U';

  async function exportData() {
    setBusy('export');
    setError(null);
    try {
      const payload = await apiClient.exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ldcn-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    if (!window.confirm(t('settings.privacy.deleteConfirm'))) return;
    setBusy('delete');
    setError(null);
    try {
      await apiClient.deleteAccount();
      clearSession();
      router.replace('/login');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy('logout');
    setError(null);
    try {
      await logout();
      router.replace('/login');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card surface="primary" className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-xl font-bold"
            style={{ background: 'var(--accent-gradient)', color: 'var(--control-selected-text)' }}
            aria-hidden
          >
            {initials}
          </span>
          <div className="min-w-0">
            <h2 className="ds-section text-[color:var(--text)]">{name}</h2>
            <p className="mt-1 t-mono text-sm text-[color:var(--muted)]">{user?.email ?? '—'}</p>
          </div>
          <Badge tone="accent" className="ml-auto capitalize">{user?.role ?? '—'}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label={t('settings.privacy.consent')} value={user?.consent_policy_version ?? t('settings.privacy.notRecorded')} />
          <label className="grid gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] p-3">
            <span className="ds-caption">{t('settings.interfaceLanguage')}</span>
            <LocaleSelector />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" loading={busy === 'export'} onClick={() => void exportData()} disabled={busy !== null}>
            {t('settings.privacy.export')}
          </Button>
          <Button variant="ghost" onClick={() => void signOut()} disabled={busy !== null}>
            {t('settings.privacy.logout')}
          </Button>
          <Button variant="ghost" className="ml-auto text-[color:var(--danger)]" loading={busy === 'delete'} onClick={() => void deleteAccount()} disabled={busy !== null}>
            {t('settings.privacy.delete')}
          </Button>
        </div>

        {error ? (
          <PageError title={t('settings.privacy.error')} description={getApiErrorMessage(error, t('settings.privacy.errorDescription'))} className="p-4" />
        ) : null}
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Git
// --------------------------------------------------------------------------- //

function GitTab() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <GitProviderCard provider="github" />
      <GitProviderCard provider="gitlab" />
    </div>
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
            <Metric label={t('settings.integrations.username')} value={data.username ?? t('common.unavailable')} />
            <Metric label={provider === 'github' ? t('settings.integrations.organizations') : t('settings.integrations.groups')} value={String(data.namespaces.length)} />
            <Metric label={provider === 'github' ? t('settings.integrations.repositories') : t('settings.integrations.projects')} value={String(data.repositories_count)} />
            <Metric label={t('settings.integrations.permission')} value={data.permission} />
            <Metric label={t('settings.integrations.scopes')} value={data.scopes.join(', ') || t('settings.integrations.providerManaged')} />
            <Metric label={t('settings.integrations.lastSync')} value={data.last_sync ? new Date(data.last_sync).toLocaleString(locale) : t('common.never')} />
            <Metric
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

// --------------------------------------------------------------------------- //
// Interface
// --------------------------------------------------------------------------- //

function InterfaceTab() {
  const { t } = useLocale();
  const preferences = useLocaleStore();

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <h2 className="ds-section text-[color:var(--text)]">{t('settings.theme.title')}</h2>
          <p className="mt-2 ds-body ds-text-muted">{t('settings.theme.description')}</p>
        </div>
        <ThemeGallery />
      </section>

      <Card className="space-y-5 p-6">
        <div>
          <h3 className="ds-subsection text-[color:var(--text)]">{t('settings.localization.title')}</h3>
          <p className="mt-2 ds-body ds-text-muted">{t('settings.localization.description')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <LocaleField label={t('settings.generatedProjectLanguage')}><PreferenceSelect value={preferences.generatedProjectLocale} onChange={preferences.setGeneratedProjectLocale} /></LocaleField>
          <LocaleField label={t('settings.documentationLanguage')}><PreferenceSelect value={preferences.documentationLocale} onChange={preferences.setDocumentationLocale} /></LocaleField>
          <LocaleField label={t('settings.codeCommentsLanguage')}><PreferenceSelect value={preferences.codeCommentsLocale} onChange={preferences.setCodeCommentsLocale} /></LocaleField>
          <LocaleField label={t('settings.fallbackLanguage')}><PreferenceSelect value={preferences.fallbackLocale} onChange={preferences.setFallbackLocale} /></LocaleField>
        </div>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Runtime
// --------------------------------------------------------------------------- //

function RuntimeTab() {
  const { locale, t } = useLocale();
  const healthQuery = useHealth();
  const stacksQuery = useStacks();
  const languagesQuery = useLanguages();
  const projectsQuery = useProjects();
  const capabilitiesQuery = useCapabilities();

  const offline = healthQuery.isError && isApiOffline(healthQuery.error);
  const score = offline ? 34 : healthQuery.data?.status === 'degraded' ? 72 : 92;

  const checks: { label: string; ok: boolean }[] = [
    { label: t('settings.runtime.backendRegistry'), ok: !offline && healthQuery.data?.status === 'ok' },
    { label: t('settings.runtime.contractSync'), ok: languagesQuery.isSuccess },
    { label: t('settings.runtime.topologySync'), ok: stacksQuery.isSuccess },
    { label: t('settings.runtime.projectRegistry'), ok: projectsQuery.isSuccess },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <HealthCard score={score} checks={checks} lastCheckedAt={healthQuery.dataUpdatedAt} offline={offline} locale={locale} />

        <OperationalRail
          title={t('settings.runtime.title')}
          items={[
            { label: t('settings.panels.apiBase'), value: API_BASE_URL, detail: t('settings.panels.apiBaseDetail'), tone: 'accent' },
            { label: t('settings.panels.health'), value: healthQuery.data?.status ?? t('common.pending'), detail: healthQuery.data ? `${healthQuery.data.service} v${healthQuery.data.version}` : t('common.awaitingResponse'), tone: offline ? 'warning' : 'success' },
            { label: t('settings.runtime.topologySync'), value: t('settings.runtime.stackCount', { count: stacksQuery.data?.length ?? 0 }), detail: t('settings.runtime.topologySyncDetail'), tone: 'accent2' },
            { label: t('settings.runtime.projectRegistry'), value: t('settings.runtime.recordCount', { count: projectsQuery.data?.length ?? 0 }), detail: t('settings.runtime.projectRegistryDetail'), tone: 'success' },
          ]}
        />
      </div>

      <StackEcosystemMap
        title={t('settings.panels.title')}
        nodes={[
          { label: t('settings.panels.capabilities'), value: String(capabilitiesQuery.data?.length ?? 0), detail: t('settings.panels.capabilitiesDetail'), tone: 'accent2' },
          { label: t('settings.panels.registryMode'), value: offline ? t('common.recovery') : t('common.live'), detail: t('settings.panels.registryModeDetail'), tone: offline ? 'warning' : 'success' },
        ]}
      />

      {healthQuery.isError ? (
        <PageError
          title={offline ? t('settings.errors.offlineTitle') : t('settings.errors.healthTitle')}
          description={getApiErrorMessage(healthQuery.error, t('settings.errors.healthDescription'))}
          onRetry={() => void healthQuery.refetch()}
        />
      ) : null}
    </div>
  );
}

function HealthCard({ score, checks, lastCheckedAt, offline, locale }: {
  readonly score: number;
  readonly checks: { label: string; ok: boolean }[];
  readonly lastCheckedAt: number;
  readonly offline: boolean;
  readonly locale: string;
}) {
  const { t } = useLocale();
  const tone = offline ? 'var(--danger)' : score >= 90 ? 'var(--success)' : 'var(--warning)';
  const label = offline ? t('common.offline') : score >= 90 ? t('settings.health.excellent') : t('common.pending');

  let relChecked = '—';
  if (lastCheckedAt) {
    const minutes = Math.round((lastCheckedAt - Date.now()) / 60000);
    try {
      relChecked = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(minutes, 'minute');
    } catch {
      relChecked = `${Math.abs(minutes)}m`;
    }
  }

  return (
    <Card surface="primary" className="glass noise relative overflow-hidden p-6">
      <p className="t-overline">{t('settings.health.title')}</p>
      <div className="mt-3 flex items-end gap-3">
        <span className="t-mono text-5xl font-bold leading-none text-[color:var(--text)]">{score}</span>
        <span className="t-mono text-2xl font-semibold" style={{ color: tone }}>%</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold" style={{ color: tone, background: 'color-mix(in srgb, currentColor 12%, transparent)' }}>
          {label}
        </span>
      </div>

      <ul className="mt-5 space-y-2" aria-label={t('settings.health.checks')}>
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2.5 text-sm text-[color:var(--text)]">
            <span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${check.ok ? 'var(--success)' : 'var(--danger)'} 16%, transparent)`, color: check.ok ? 'var(--success)' : 'var(--danger)' }}>
              {check.ok ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
            </span>
            {check.label}
          </li>
        ))}
      </ul>

      <p className="mt-5 ds-caption">{t('settings.health.lastCheck')} · {relChecked}</p>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Advanced / Developer Mode
// --------------------------------------------------------------------------- //

function AdvancedTab() {
  const { t } = useLocale();
  const [devMode, setDevMode] = useState(false);
  const languagesQuery = useLanguages();
  const frameworksQuery = useFrameworks();
  const architecturesQuery = useArchitectures();
  const archetypesQuery = useArchetypes();

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="ds-section text-[color:var(--text)]">{t('settings.advanced.title')}</h2>
          <p className="mt-2 max-w-xl ds-body ds-text-muted">{t('settings.advanced.description')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={devMode}
          onClick={() => setDevMode((value) => !value)}
          className="focus-ring inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-[color:var(--border)] p-0.5 transition-colors"
          style={devMode ? { background: 'color-mix(in srgb, var(--accent) 35%, transparent)' } : undefined}
        >
          <span className="h-5 w-5 rounded-full bg-[color:var(--text)] transition-transform" style={{ transform: devMode ? 'translateX(20px)' : 'translateX(0)' }} />
          <span className="sr-only">{t('settings.advanced.devMode')}</span>
        </button>
      </Card>

      {devMode ? (
        <ArchitectureGraphSurface
          title={t('settings.contracts.title')}
          subtitle={t('settings.contracts.description')}
          nodes={[
            { label: t('settings.contracts.languages'), value: String(languagesQuery.data?.length ?? 0), detail: t('settings.contracts.languagesDetail'), tone: 'accent' },
            { label: t('settings.contracts.frameworks'), value: String(frameworksQuery.data?.length ?? 0), detail: t('settings.contracts.frameworksDetail'), tone: 'accent2' },
            { label: t('settings.contracts.architectures'), value: String(architecturesQuery.data?.length ?? 0), detail: t('settings.contracts.architecturesDetail'), tone: 'success' },
            { label: t('settings.contracts.archetypes'), value: String(archetypesQuery.data?.length ?? 0), detail: t('settings.contracts.archetypesDetail'), tone: 'muted' },
          ]}
        />
      ) : (
        <p className="ds-caption">{t('settings.advanced.devModeHint')}</p>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Shared bits
// --------------------------------------------------------------------------- //

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] p-3">
      <p className="ds-caption">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[color:var(--text)]">{value}</p>
    </div>
  );
}

function LocaleField({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-[color:var(--text)]"><span>{label}</span>{children}</label>;
}

function PreferenceSelect({ value, onChange }: { readonly value: LocaleCode; readonly onChange: (locale: LocaleCode) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as LocaleCode)} className="w-full">
      {LOCALES.map((item) => <option key={item.code} value={item.code}>{item.nativeName}</option>)}
    </Select>
  );
}
