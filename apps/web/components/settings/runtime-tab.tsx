'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Activity, Clock, Cpu, Gauge, HardDrive, HeartPulse, Layers, ListChecks, MemoryStick, Network, ShieldAlert, Timer } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { PageError } from '@/components/feedback/error-system';
import { useHealth } from '@/hooks/use-health';
import { useRuntimeTelemetryStream } from '@/hooks/use-runtime-telemetry-stream';
import { useLocale } from '@/hooks/use-locale';
import { useAuthStore } from '@/stores/use-auth-store';
import { apiEndpoints } from '@/lib/api/endpoints';
import { apiClient, apiRequest } from '@/lib/api/client';
import { getApiErrorMessage, isApiOffline } from '@/lib/api/errors';
import type { RuntimeMetrics, PlatformRuntimeConfig } from '@contracts/runtime-metrics.contract';
import type { ReactNode } from 'react';

function fmtBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return `${h}h`;
  return `${Math.floor(seconds / 60)}m`;
}

export function RuntimeTab() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const healthQuery = useHealth();
  const telemetryStream = useRuntimeTelemetryStream();
  const metricsQuery = useQuery<RuntimeMetrics>({
    queryKey: ['runtime-metrics'],
    queryFn: () => apiRequest<RuntimeMetrics>(apiEndpoints.runtimeMetrics),
    refetchInterval: 5000,
    staleTime: 4000,
    retry: 1,
  });
  const configQuery = useQuery<PlatformRuntimeConfig>({
    queryKey: ['runtime-config'],
    queryFn: apiClient.getRuntimeConfig,
    staleTime: 10_000,
    retry: 1,
  });
  const configMutation = useMutation({
    mutationFn: apiClient.updateRuntimeConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['runtime-config'], updated);
      void queryClient.invalidateQueries({ queryKey: ['runtime-metrics'] });
    },
  });
  const config = configQuery.data;

  const offline = healthQuery.isError && isApiOffline(healthQuery.error);
  const healthy = !offline && healthQuery.data?.status === 'ok';
  const m = metricsQuery.data;
  const workers = m?.workers;

  return (
    <div className="space-y-5">
      {/* ---- Visão geral do runtime ---- */}
      <Card surface="secondary" className="rounded-[1.5rem] p-5">
        <div className="mb-4">
          <h2 className="ds-section text-[color:var(--text)]">{t('settings.runtime.overviewTitle')}</h2>
          <span className="ds-caption" role="status" aria-live="polite">Telemetry: {telemetryStream.transport}</span>
          <p className="mt-1 ds-body ds-text-muted">{t('settings.runtime.overviewDescription')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <OverviewTile
            icon={<HeartPulse className="h-4 w-4" />}
            label={t('settings.runtime.health')}
            value={offline ? t('common.offline') : healthy ? t('settings.runtime.healthy') : t('settings.runtime.degraded')}
            hint={t('settings.runtime.healthHint')}
            tone={offline ? 'danger' : healthy ? 'success' : 'warning'}
            emphasis
          />
          <OverviewTile icon={<Cpu className="h-4 w-4" />} label={t('settings.runtime.cpu')} value={m?.cpu ? `${m.cpu.percent}%` : '—'} hint={m?.cpu?.cores ? t('settings.runtime.cores', { count: String(m.cpu.cores) }) : ''} />
          <OverviewTile icon={<MemoryStick className="h-4 w-4" />} label={t('settings.runtime.memory')} value={m?.memory ? `${m.memory.percent}%` : '—'} hint={m?.memory ? `${fmtBytes(m.memory.used_bytes)} / ${fmtBytes(m.memory.total_bytes)}` : ''} />
          <OverviewTile icon={<Layers className="h-4 w-4" />} label={t('settings.runtime.workers')} value={workers ? String(workers.total) : '—'} hint={workers ? t('settings.runtime.activeCount', { count: String(workers.active) }) : ''} />
          <OverviewTile icon={<ListChecks className="h-4 w-4" />} label={t('settings.runtime.queued')} value={m ? String(m.jobs_queued) : '—'} hint={t('settings.runtime.queuedHint')} />
          <OverviewTile icon={<Timer className="h-4 w-4" />} label={t('settings.runtime.uptime')} value={m ? fmtUptime(m.uptime_seconds) : '—'} hint={t('settings.runtime.uptimeHint')} />
        </div>
        {metricsQuery.isError && !isApiOffline(metricsQuery.error) ? (
          <PageError title={t('settings.runtime.metricsErrorTitle')} description={getApiErrorMessage(metricsQuery.error, t('settings.runtime.metricsErrorDescription'))} className="mt-3 p-4" onRetry={() => void metricsQuery.refetch()} />
        ) : null}
      </Card>

      {/* ---- Recursos do sistema | Workers ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Gauge className="h-4 w-4" />} title={t('settings.runtime.resourcesTitle')} />
          <div className="mt-4 space-y-4">
            <ResourceBar icon={<Cpu className="h-4 w-4" />} label={t('settings.runtime.cpu')} percent={m?.cpu?.percent ?? null} detail={m?.cpu?.cores ? t('settings.runtime.cores', { count: String(m.cpu.cores) }) : '—'} />
            <ResourceBar icon={<MemoryStick className="h-4 w-4" />} label={t('settings.runtime.memory')} percent={m?.memory?.percent ?? null} detail={m?.memory ? `${fmtBytes(m.memory.used_bytes)} / ${fmtBytes(m.memory.total_bytes)}` : '—'} />
            <ResourceBar icon={<HardDrive className="h-4 w-4" />} label={t('settings.runtime.disk')} percent={m?.disk?.percent ?? null} detail={m?.disk ? `${fmtBytes(m.disk.used_bytes)} / ${fmtBytes(m.disk.total_bytes)}` : '—'} />
            <ResourceBar icon={<Network className="h-4 w-4" />} label={t('settings.runtime.queuedRunning')} percent={workers ? Math.round((workers.active / workers.total) * 100) : null} detail={m ? t('settings.runtime.runningQueued', { running: String(m.jobs_running), queued: String(m.jobs_queued) }) : '—'} />
          </div>
        </Card>

        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Layers className="h-4 w-4" />} title={t('settings.runtime.workersTitle')} description={workers ? t('settings.runtime.workersSummary', { active: String(workers.active), idle: String(workers.idle) }) : undefined} />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-4">
            {workers ? Array.from({ length: workers.total }).map((_, index) => {
              const busy = index < workers.active;
              return (
                <div key={index} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] p-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)]" style={{ background: busy ? 'color-mix(in srgb, var(--success) 16%, transparent)' : 'color-mix(in srgb, var(--muted) 12%, transparent)', color: busy ? 'var(--success)' : 'var(--muted)' }}>
                    <Cpu className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="t-mono truncate text-xs font-semibold text-[color:var(--text)]">{`worker-${String(index + 1).padStart(2, '0')}`}</p>
                    <p className="text-[11px]" style={{ color: busy ? 'var(--success)' : 'var(--muted)' }}>{busy ? t('settings.runtime.busy') : t('settings.runtime.idle')}</p>
                  </div>
                </div>
              );
            }) : <p className="ds-caption">{t('common.loading')}</p>}
          </div>
        </Card>
      </div>

      {/* ---- Configurações do runtime ---- */}
      <Card surface="secondary" className="rounded-[1.5rem] p-5">
        <SectionHeading
          icon={<Activity className="h-4 w-4" />}
          title={t('settings.runtime.configTitle')}
          description={isAdmin ? t('settings.runtime.configDescription') : t('settings.runtime.adminOnly')}
        />
        {configQuery.isError ? (
          <PageError title={t('settings.runtime.metricsErrorTitle')} description={getApiErrorMessage(configQuery.error, t('settings.runtime.metricsErrorDescription'))} className="mt-3 p-4" onRetry={() => void configQuery.refetch()} />
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[color:var(--text)]">{t('settings.runtime.autoScale')}</p>
                <p className="ds-caption mt-1">{t('settings.runtime.autoScaleHint')}</p>
              </div>
            </div>
            <NumberField
              icon={<Layers className="h-4 w-4" />}
              label={t('settings.runtime.workerLimit')}
              hint={t('settings.runtime.workerLimitHint')}
              value={config?.workerLimit ?? 0}
              min={1}
              max={64}
              disabled={!isAdmin || !config}
              onChange={(value) => configMutation.mutate({ workerLimit: value })}
            />
            <NumberField
              icon={<Clock className="h-4 w-4" />}
              label={t('settings.runtime.timeout')}
              hint={t('settings.runtime.timeoutHint')}
              value={config?.executionTimeoutMinutes ?? 0}
              min={1}
              max={240}
              disabled={!isAdmin || !config}
              onChange={(value) => configMutation.mutate({ executionTimeoutMinutes: value })}
            />
            <NumberField
              icon={<ListChecks className="h-4 w-4" />}
              label={t('settings.runtime.logRetention')}
              hint={t('settings.runtime.logRetentionHint')}
              value={config?.logRetentionDays ?? 0}
              min={1}
              max={3650}
              disabled={!isAdmin || !config}
              onChange={(value) => configMutation.mutate({ logRetentionDays: value })}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function SectionHeading({ icon, title, description }: { readonly icon: ReactNode; readonly title: string; readonly description?: string }) {
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

function OverviewTile({ icon, label, value, hint, tone, emphasis }: {
  readonly icon: ReactNode; readonly label: string; readonly value: string; readonly hint: string;
  readonly tone?: 'success' | 'warning' | 'danger'; readonly emphasis?: boolean;
}) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning,#eab308)' : tone === 'success' ? 'var(--success)' : 'var(--text)';
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] p-3">
      <div className="flex items-center gap-1.5 text-[color:var(--muted)]">
        <span style={{ color: 'var(--accent)' }}>{icon}</span>
        <p className="ds-caption">{label}</p>
      </div>
      <p className="mt-1 text-xl font-bold" style={{ color: emphasis ? color : 'var(--text)' }}>{value}</p>
      <p className="ds-caption truncate">{hint}</p>
    </div>
  );
}

function ResourceBar({ icon, label, percent, detail }: { readonly icon: ReactNode; readonly label: string; readonly percent: number | null; readonly detail: string }) {
  const pct = percent ?? 0;
  const color = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning,#eab308)' : 'var(--accent)';
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--text)]">
          <span style={{ color: 'var(--accent)' }}>{icon}</span>{label}
        </span>
        <span className="t-mono text-sm font-semibold" style={{ color }}>{percent != null ? `${percent}%` : '—'}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--border) 60%, transparent)' }}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="ds-caption mt-1">{detail}</p>
    </div>
  );
}

function NumberField({ icon, label, hint, value, min, max, onChange, disabled }: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly hint: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly disabled?: boolean;
}) {
  const inputId = `runtime-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
      <label htmlFor={inputId} className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--text)]">
        <span style={{ color: 'var(--accent)' }}>{icon}</span>{label}
      </label>
      <input
        id={inputId}
        name={inputId}
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="mt-2 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-3)] px-3 py-2 text-sm text-[color:var(--text)] focus-ring"
      />
      <p className="ds-caption mt-1">{hint}</p>
    </div>
  );
}
