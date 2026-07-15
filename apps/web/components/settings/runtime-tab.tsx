'use client';

import { Check, X } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { PageError } from '@/components/feedback/error-system';
import { SettingsSection } from '@/components/settings/settings-section';
import { OperationalRail, StackEcosystemMap } from '@/components/visual/engineering-surface';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useHealth } from '@/hooks/use-health';
import { useLanguages } from '@/hooks/use-languages';
import { useLocale } from '@/hooks/use-locale';
import { useProjects } from '@/hooks/use-projects';
import { useStacks } from '@/hooks/use-stacks';
import { API_BASE_URL } from '@/lib/api/endpoints';
import { getApiErrorMessage, isApiOffline } from '@/lib/api/errors';

export function RuntimeTab() {
  const { locale, t } = useLocale();
  const healthQuery = useHealth();
  const stacksQuery = useStacks();
  const languagesQuery = useLanguages();
  const projectsQuery = useProjects();
  const capabilitiesQuery = useCapabilities();

  const offline = healthQuery.isError && isApiOffline(healthQuery.error);
  const score = offline ? 34 : healthQuery.data?.status === 'degraded' ? 72 : 92;
  const databaseCheck = healthQuery.data?.checks?.database;

  const checks: { label: string; ok: boolean }[] = [
    { label: t('settings.runtime.backendRegistry'), ok: !offline && healthQuery.data?.status === 'ok' },
    // Real, backend-reported check (checks.database from GET /api/health) --
    // not derived/guessed like the others below still are.
    ...(databaseCheck ? [{ label: t('settings.runtime.database'), ok: databaseCheck === 'ok' }] : []),
    { label: t('settings.runtime.contractSync'), ok: languagesQuery.isSuccess },
    { label: t('settings.runtime.topologySync'), ok: stacksQuery.isSuccess },
    { label: t('settings.runtime.projectRegistry'), ok: projectsQuery.isSuccess },
  ];

  return (
    <SettingsSection title={t('settings.runtime.tabTitle')} description={t('settings.runtime.tabDescription')} surface="none">
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
    </SettingsSection>
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
