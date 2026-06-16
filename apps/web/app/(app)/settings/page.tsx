'use client';

import { useState } from 'react';
import type { LocaleCode } from '@contracts/locale.contract';
import { useRouter } from 'next/navigation';

import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { SectionHeader } from '@/components/shell/section-header';
import { ThemeSwitcher } from '@/components/shell/theme-switcher';
import { LocaleSelector } from '@/components/shell/locale-selector';
import { Select } from '@/components/ui/select';
import {
  ArchitectureGraphSurface,
  OperationalRail,
  ReadinessRing,
  StackEcosystemMap,
} from '@/components/visual/engineering-surface';
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
  const preferences = useLocaleStore();
  const healthQuery = useHealth();
  const languagesQuery = useLanguages();
  const frameworksQuery = useFrameworks();
  const architecturesQuery = useArchitectures();
  const archetypesQuery = useArchetypes();
  const capabilitiesQuery = useCapabilities();
  const stacksQuery = useStacks();
  const projectsQuery = useProjects();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const offline = healthQuery.isError && isApiOffline(healthQuery.error);
  const readinessScore = offline ? 34 : healthQuery.data?.status === 'degraded' ? 72 : 92;

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t('settings.title')}
        description={t('settings.description')}
      />

      <SecurityPrivacyCard />

      {isAdmin ? <section id="integrations" className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('settings.integrations.eyebrow')}</p>
          <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{t('settings.integrations.title')}</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('settings.integrations.description')}</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <GitProviderCard provider="github" />
          <GitProviderCard provider="gitlab" />
        </div>
      </section> : (
        <Card id="integrations" className="space-y-3 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
            {t('settings.integrations.restrictedEyebrow')}
          </p>
          <h2 className="text-xl font-semibold text-[color:var(--text)]">
            {t('settings.integrations.restrictedTitle')}
          </h2>
          <p className="text-sm leading-6 text-[color:var(--muted)]">
            {t('settings.integrations.restrictedDescription')}
          </p>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="grid gap-4">
          <Card className="space-y-4 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('settings.theme.title')}</p>
            <ThemeSwitcher />
            <p className="text-sm leading-6 text-[color:var(--muted)]">
              {t('settings.theme.description')}
            </p>
          </Card>

          <Card className="space-y-5 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('settings.localization.title')}</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('settings.localization.description')}</p>
            </div>
            <LocaleField label={t('settings.interfaceLanguage')}><LocaleSelector /></LocaleField>
            <LocaleField label={t('settings.generatedProjectLanguage')}>
              <PreferenceSelect value={preferences.generatedProjectLocale} onChange={preferences.setGeneratedProjectLocale} />
            </LocaleField>
            <LocaleField label={t('settings.documentationLanguage')}>
              <PreferenceSelect value={preferences.documentationLocale} onChange={preferences.setDocumentationLocale} />
            </LocaleField>
            <LocaleField label={t('settings.codeCommentsLanguage')}>
              <PreferenceSelect value={preferences.codeCommentsLocale} onChange={preferences.setCodeCommentsLocale} />
            </LocaleField>
            <LocaleField label={t('settings.fallbackLanguage')}>
              <PreferenceSelect value={preferences.fallbackLocale} onChange={preferences.setFallbackLocale} />
            </LocaleField>
          </Card>

          <ArchitectureGraphSurface
            title={t('settings.contracts.title')}
            subtitle={t('settings.contracts.description')}
            nodes={[
              {
                label: t('settings.contracts.languages'),
                value: String(languagesQuery.data?.length ?? 0),
                detail: t('settings.contracts.languagesDetail'),
                tone: 'accent',
              },
              {
                label: t('settings.contracts.frameworks'),
                value: String(frameworksQuery.data?.length ?? 0),
                detail: t('settings.contracts.frameworksDetail'),
                tone: 'accent2',
              },
              {
                label: t('settings.contracts.architectures'),
                value: String(architecturesQuery.data?.length ?? 0),
                detail: t('settings.contracts.architecturesDetail'),
                tone: 'success',
              },
              {
                label: t('settings.contracts.archetypes'),
                value: String(archetypesQuery.data?.length ?? 0),
                detail: t('settings.contracts.archetypesDetail'),
                tone: 'muted',
              },
            ]}
          />
        </div>

        <div className="grid gap-4">
          <ReadinessRing
            title={t('settings.health.title')}
            value={readinessScore}
            label={offline ? t('common.offline') : healthQuery.data?.status ?? t('common.pending')}
            caption={t('settings.health.description')}
            tone={offline ? 'danger' : healthQuery.data?.status === 'degraded' ? 'warning' : 'success'}
          />

          <OperationalRail
            title={t('settings.runtime.title')}
            items={[
              {
                label: t('settings.runtime.backendRegistry'),
                value: offline ? t('common.unavailable') : t('common.visible'),
                detail: t('settings.runtime.backendRegistryDetail'),
                tone: offline ? 'warning' : 'success',
              },
              {
                label: t('settings.runtime.contractSync'),
                value: t('common.aligned'),
                detail: t('settings.runtime.contractSyncDetail'),
                tone: 'accent',
              },
              {
                label: t('settings.runtime.topologySync'),
                value: t('settings.runtime.stackCount', { count: stacksQuery.data?.length ?? 0 }),
                detail: t('settings.runtime.topologySyncDetail'),
                tone: 'accent2',
              },
              {
                label: t('settings.runtime.projectRegistry'),
                value: t('settings.runtime.recordCount', { count: projectsQuery.data?.length ?? 0 }),
                detail: t('settings.runtime.projectRegistryDetail'),
                tone: 'success',
              },
            ]}
          />

          <StackEcosystemMap
            title={t('settings.panels.title')}
            nodes={[
              {
                label: t('settings.panels.apiBase'),
                value: API_BASE_URL,
                detail: t('settings.panels.apiBaseDetail'),
                tone: 'accent',
              },
              {
                label: t('settings.panels.health'),
                value: healthQuery.data?.status ?? t('common.pending'),
                detail: healthQuery.data ? `${healthQuery.data.service} v${healthQuery.data.version}` : t('common.awaitingResponse'),
                tone: offline ? 'warning' : 'success',
              },
              {
                label: t('settings.panels.capabilities'),
                value: String(capabilitiesQuery.data?.length ?? 0),
                detail: t('settings.panels.capabilitiesDetail'),
                tone: 'accent2',
              },
              {
                label: t('settings.panels.registryMode'),
                value: offline ? t('common.recovery') : t('common.live'),
                detail: t('settings.panels.registryModeDetail'),
                tone: offline ? 'warning' : 'success',
              },
            ]}
          />

          <Card className="space-y-4 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('settings.actions.title')}</p>
            <div className="flex flex-wrap gap-3">
              <Badge>{offline ? t('settings.actions.backendOffline') : t('settings.actions.backendOnline')}</Badge>
              <Badge>{t('settings.actions.projectCount', { count: projectsQuery.data?.length ?? 0 })}</Badge>
              <Badge>{t('settings.actions.stackCount', { count: stacksQuery.data?.length ?? 0 })}</Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              <ActionLink href="/dashboard" variant="primary">
                {t('settings.actions.dashboard')}
              </ActionLink>
              <ActionLink href="/documentation" variant="secondary">
                {t('settings.actions.rules')}
              </ActionLink>
            </div>
          </Card>
        </div>
      </div>

      {healthQuery.isLoading ? (
        <CardLoading />
      ) : healthQuery.isError ? (
        <PageError
          title={offline ? t('settings.errors.offlineTitle') : t('settings.errors.healthTitle')}
          description={getApiErrorMessage(
            healthQuery.error,
            t('settings.errors.healthDescription'),
          )}
          onRetry={() => void healthQuery.refetch()}
        />
      ) : null}
    </div>
  );
}

function SecurityPrivacyCard() {
  const router = useRouter();
  const { t } = useLocale();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [busy, setBusy] = useState<'export' | 'delete' | 'logout' | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function exportData() {
    setBusy('export');
    setError(null);
    try {
      const payload = await apiClient.exportMyData();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      );
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
    <Card className="space-y-5 p-5" surface="primary">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
          {t('settings.privacy.eyebrow')}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">
          {t('settings.privacy.title')}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
          {t('settings.privacy.description')}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <IntegrationMetric label={t('settings.privacy.account')} value={user?.email ?? '-'} />
        <IntegrationMetric label={t('settings.privacy.role')} value={user?.role ?? '-'} />
        <IntegrationMetric
          label={t('settings.privacy.consent')}
          value={user?.consent_policy_version ?? t('settings.privacy.notRecorded')}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={() => void exportData()} disabled={busy !== null}>
          {busy === 'export' ? t('settings.privacy.exporting') : t('settings.privacy.export')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void signOut()} disabled={busy !== null}>
          {t('settings.privacy.logout')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void deleteAccount()} disabled={busy !== null}>
          {busy === 'delete' ? t('settings.privacy.deleting') : t('settings.privacy.delete')}
        </Button>
      </div>

      {error ? (
        <PageError
          title={t('settings.privacy.error')}
          description={getApiErrorMessage(error, t('settings.privacy.errorDescription'))}
          className="p-4"
        />
      ) : null}
    </Card>
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
  const data = connection.data;
  const connected = data?.status === 'connected';
  const error = connect.error ?? validate.error ?? disconnect.error ?? connection.error;

  const submit = async () => {
    if (!token.trim()) return;
    try {
      await connect.mutateAsync(token.trim());
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
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{label}</p>
            <h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">
              {connected
                ? t('settings.integrations.connected', { provider: label })
                : t('settings.integrations.notConnected', { provider: label })}
            </h3>
          </div>
        </div>
        <Badge>{data?.status ?? t('common.loading')}</Badge>
      </div>

      {connected && data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <IntegrationMetric label={t('settings.integrations.username')} value={data.username ?? t('common.unavailable')} />
            <IntegrationMetric label={provider === 'github' ? t('settings.integrations.organizations') : t('settings.integrations.groups')} value={String(data.namespaces.length)} />
            <IntegrationMetric label={provider === 'github' ? t('settings.integrations.repositories') : t('settings.integrations.projects')} value={String(data.repositories_count)} />
            <IntegrationMetric label={t('settings.integrations.permission')} value={data.permission} />
            <IntegrationMetric label={t('settings.integrations.scopes')} value={data.scopes.join(', ') || t('settings.integrations.providerManaged')} />
            <IntegrationMetric label={t('settings.integrations.lastSync')} value={data.last_sync ? new Date(data.last_sync).toLocaleString(locale) : t('common.never')} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={() => validate.mutate()} disabled={validate.isPending}>{t('settings.integrations.validate')}</Button>
            <Button type="button" variant="secondary" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>{t('settings.integrations.disconnect', { provider: label })}</Button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <Input type="password" aria-label={t('settings.integrations.tokenLabel', { provider: label })} placeholder={t('settings.integrations.tokenLabel', { provider: label })} value={token} onChange={(event) => setToken(event.target.value)} />
          <p className="text-xs leading-5 text-[color:var(--muted)]">{t('settings.integrations.tokenDescription')}</p>
          <Button type="button" variant="primary" onClick={() => void submit()} disabled={!token.trim() || connect.isPending}>{t('settings.integrations.connect', { provider: label })}</Button>
        </div>
      )}

      {error ? <PageError title={t('settings.integrations.errorTitle', { provider: label })} description={getApiErrorMessage(error, t('settings.integrations.errorDescription', { provider: label }))} className="p-4" /> : null}
    </Card>
  );
}

function IntegrationMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><p className="text-xs text-[color:var(--muted)]">{label}</p><p className="mt-1 break-words text-sm font-semibold text-[color:var(--text)]">{value}</p></div>;
}

function LocaleField({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-[color:var(--text)]"><span>{label}</span>{children}</label>;
}

function PreferenceSelect({ value, onChange }: { readonly value: LocaleCode; readonly onChange: (locale: LocaleCode) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as LocaleCode)}>
      {LOCALES.map((item) => <option key={item.code} value={item.code}>{item.nativeName}</option>)}
    </Select>
  );
}
