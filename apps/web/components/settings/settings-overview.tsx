'use client';

import { Activity, CheckCircle2, Command, Layers3, Radio, ShieldAlert, Sparkles, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useHealth } from '@/hooks/use-health';
import { useSystemStatus } from '@/hooks/use-system-status';
import { useLocale } from '@/hooks/use-locale';

function statusTone(status: string | undefined): BadgeTone {
  if (status === 'healthy' || status === 'ok') return 'success';
  if (status === 'warning' || status === 'degraded') return 'warning';
  if (status === 'blocked' || status === 'error') return 'danger';
  return 'neutral';
}

function StatusIcon({ status }: { readonly status: string | undefined }) {
  if (status === 'healthy' || status === 'ok') return <CheckCircle2 className="h-4 w-4" aria-hidden />;
  if (status === 'blocked' || status === 'error') return <XCircle className="h-4 w-4" aria-hidden />;
  return <ShieldAlert className="h-4 w-4" aria-hidden />;
}

export function SettingsOverview() {
  const { t } = useLocale();
  const health = useHealth();
  const status = useSystemStatus();
  const backendStatus = status.data?.backend_status;
  const apiStatus = status.data?.api_status;
  const overall = health.data?.status ?? backendStatus?.status;
  const activeModules = status.data?.active_modules?.length;
  const activeEngines = status.data?.active_engines?.length;

  return (
    <Card surface="primary" className="relative overflow-hidden rounded-[1.75rem] p-0">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(color-mix(in_srgb,var(--accent)_16%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--accent)_16%,transparent)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative grid gap-6 p-5 md:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[color:var(--accent)]"><Sparkles className="h-5 w-5" aria-hidden /></span>
            <Badge tone={statusTone(overall)}><StatusIcon status={overall} /> {overall ?? t('common.loading')}</Badge>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-3)] px-3 py-1 text-xs text-[color:var(--muted)]"><Command className="h-3.5 w-3.5" aria-hidden /> {t('settings.overview.shortcut')}</span>
          </div>
          <p className="mt-5 ds-overline text-[color:var(--accent)]">{t('settings.overview.controlPlane')}</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-[color:var(--text)] text-balance md:text-4xl">{t('settings.title')}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">{t('settings.description')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
          <OverviewMetric icon={<Radio className="h-4 w-4" />} label={t('settings.overview.backend')} value={backendStatus?.status ?? '—'} tone={statusTone(backendStatus?.status)} />
          <OverviewMetric icon={<Activity className="h-4 w-4" />} label={t('settings.overview.api')} value={apiStatus?.status ?? '—'} tone={statusTone(apiStatus?.status)} />
          <OverviewMetric icon={<Layers3 className="h-4 w-4" />} label={t('settings.overview.modules')} value={activeModules == null ? '—' : String(activeModules)} tone="accent" />
          <OverviewMetric icon={<Sparkles className="h-4 w-4" />} label={t('settings.overview.engines')} value={activeEngines == null ? '—' : String(activeEngines)} tone="accent" />
        </div>
      </div>
    </Card>
  );
}

function OverviewMetric({ icon, label, value, tone }: { readonly icon: ReactNode; readonly label: string; readonly value: string; readonly tone: BadgeTone }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-3)]/60 p-3">
      <div className="flex items-center gap-1.5 text-[color:var(--muted)]"><span className="text-[color:var(--accent)]">{icon}</span><span className="truncate text-xs">{label}</span></div>
      <Badge tone={tone} className="mt-2 max-w-full truncate capitalize">{value}</Badge>
    </div>
  );
}
