'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CalendarRange,
  ChevronDown,
  Clock3,
  Download,
  Factory,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';
import type {
  AnalyticsFilterOptions,
  AnalyticsFilters,
  AnalyticsMetric,
  AnalyticsRecord,
  AnalyticsSeriesPoint,
} from '@/lib/api/analytics';

type Translator = (key: string, values?: Record<string, string | number>) => string;

function numberFormat(locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
}

function displayValue(locale: string, metric: AnalyticsMetric): string {
  if (metric.value === null) return '—';
  if (metric.unit === 'percent') return `${numberFormat(locale).format(metric.value)}%`;
  if (metric.unit === 'currency') {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(metric.value);
  }
  if (metric.unit === 'seconds') return `${numberFormat(locale).format(metric.value)} s`;
  if (metric.unit === 'tokens') return `${numberFormat(locale).format(metric.value)} tok`;
  return numberFormat(locale).format(metric.value);
}

export function DataFreshnessBadge({ generatedAt }: { readonly generatedAt: string }) {
  const { t, locale } = useLocale();
  const date = new Date(generatedAt);
  const valid = !Number.isNaN(date.getTime());
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-emerald-200">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.7)]" />
      {valid ? t('analytics.components.freshness.updatedAt', { time: date.toLocaleString(locale) }) : t('analytics.components.freshness.registered')}
    </span>
  );
}

export function AnalyticsMetricCard({
  metric,
  onOpen,
}: {
  readonly metric: AnalyticsMetric;
  readonly onOpen: (metric: AnalyticsMetric) => void;
}) {
  const { t, locale } = useLocale();
  const tone = metric.severity ?? 'neutral';
  return (
    <button
      type="button"
      onClick={() => onOpen(metric)}
      className={cn(
        'group min-h-36 rounded-[var(--radius-lg)] border bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-5 text-left transition duration-200',
        'focus-ring hover:-translate-y-0.5 hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-2)]',
        tone === 'critical' && 'border-red-400/25',
        tone === 'warning' && 'border-amber-300/20',
        tone === 'positive' && 'border-emerald-300/20',
        tone === 'neutral' && 'border-[color:var(--border)]',
      )}
      aria-label={t('analytics.components.metricCard.openDetails', { label: metric.label })}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium leading-5 text-[color:var(--muted)]">{metric.label}</span>
        <ArrowRight className="h-3.5 w-3.5 text-[color:var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[color:var(--accent)]" />
      </span>
      <span className="mt-4 block font-mono text-2xl font-semibold tracking-[-0.05em] text-[color:var(--text)]">
        {displayValue(locale, metric)}
      </span>
      <span className="mt-3 flex min-h-5 items-center gap-2 font-mono text-xs text-[color:var(--muted)]">
        {metric.change !== null && metric.change !== undefined ? (
          <span className={metric.change >= 0 ? 'text-emerald-300' : 'text-red-300'}>
            {metric.change >= 0 ? '+' : ''}{numberFormat(locale).format(metric.change)}%
          </span>
        ) : null}
        <span>{metric.drilldown_count ? t('analytics.components.metricCard.recordsCount', { count: metric.drilldown_count }) : t('analytics.components.metricCard.openDetail')}</span>
      </span>
    </button>
  );
}

export function AnalyticsChartCard({
  title,
  description,
  children,
  className,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <Card className={cn('overflow-hidden p-0', className)}>
      <div className="flex items-start justify-between border-b border-[color:var(--border)] px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--text)]">{title}</h3>
          {description ? <p className="mt-1 text-xs text-[color:var(--muted)]">{description}</p> : null}
        </div>
        <BarChart3 className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

export function AnalyticsTrendChart({ points }: { readonly points: readonly AnalyticsSeriesPoint[] }) {
  const { t, locale } = useLocale();
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <div className="flex h-48 items-end gap-2" role="img" aria-label={t('analytics.components.trendChart.aria')}>
      {points.map((point, index) => (
        <div key={`${point.label}-${point.series ?? ''}-${index}`} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <span className="font-mono text-xs text-[color:var(--muted)] opacity-0 transition group-hover:opacity-100">
            {numberFormat(locale).format(point.value)}
          </span>
          <div
            className="w-full min-w-2 rounded-t-sm bg-gradient-to-t from-[color:var(--accent-2)] to-[color:var(--accent)] opacity-70 transition group-hover:opacity-100"
            style={{ height: `${Math.max((point.value / max) * 132, 3)}px` }}
          />
          <span className="max-w-full truncate font-mono text-xs text-[color:var(--muted)]">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsProviderBreakdown({ points }: { readonly points: readonly AnalyticsSeriesPoint[] }) {
  const { locale } = useLocale();
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return (
    <div className="space-y-4">
      {points.map((point) => {
        const percent = total > 0 ? (point.value / total) * 100 : 0;
        return (
          <div key={`${point.series ?? 'provider'}-${point.label}`} className="space-y-2">
            <div className="flex justify-between gap-4 text-xs">
              <span className="text-[color:var(--text)]">{point.label}</span>
              <span className="font-mono text-[color:var(--muted)]">{numberFormat(locale).format(point.value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full bg-[color:var(--accent)]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AnalyticsQualityRadar({ points }: { readonly points: readonly AnalyticsSeriesPoint[] }) {
  const { t, locale } = useLocale();
  const count = Math.max(points.length, 3);
  const coordinates = points.map((point, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    const radius = Math.min(Math.max(point.value, 0), 100) * 0.72;
    return `${100 + Math.cos(angle) * radius},${100 + Math.sin(angle) * radius}`;
  });
  return (
    <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-center">
      <svg viewBox="0 0 200 200" className="mx-auto h-52 w-52" role="img" aria-label={t('analytics.components.qualityRadar.aria')}>
        {[24, 48, 72].map((radius) => (
          <circle key={radius} cx="100" cy="100" r={radius} fill="none" stroke="currentColor" className="text-white/10" />
        ))}
        <polygon points={coordinates.join(' ')} fill="color-mix(in srgb, var(--accent) 22%, transparent)" stroke="var(--accent)" strokeWidth="2" />
      </svg>
      <div className="grid grid-cols-2 gap-3">
        {points.map((point) => (
          <div key={point.label} className="border-l border-[color:var(--border)] pl-3">
            <p className="font-mono text-sm text-[color:var(--text)]">{numberFormat(locale).format(point.value)}</p>
            <p className="text-xs text-[color:var(--muted)]">{point.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsAgentTable({
  records,
  columns,
  onSelect,
}: {
  readonly records: readonly AnalyticsRecord[];
  readonly columns: readonly string[];
  readonly onSelect: (record: AnalyticsRecord) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-xs">
        <thead className="font-mono uppercase tracking-[0.12em] text-[color:var(--muted)]">
          <tr>{columns.map((column) => <th key={column} className="border-b border-[color:var(--border)] px-3 py-3 font-medium">{column}</th>)}</tr>
        </thead>
        <tbody>
          {records.slice(0, 100).map((record) => (
            <tr
              key={record.id}
              className="cursor-pointer border-b border-[color:var(--border)] text-[color:var(--text)] hover:bg-white/[0.025] [content-visibility:auto]"
              onClick={() => onSelect(record)}
            >
              {columns.map((column) => <td key={column} className="max-w-64 truncate px-3 py-3">{String(record[column] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {records.length > 100 ? <p className="pt-3 text-xs text-[color:var(--muted)]">{t('analytics.components.agentTable.shownOf', { shown: 100, total: records.length })}</p> : null}
    </div>
  );
}

export function AnalyticsHeatmap({ points }: { readonly points: readonly AnalyticsSeriesPoint[] }) {
  const { t } = useLocale();
  return (
    <div className="grid grid-cols-7 gap-1.5" aria-label={t('analytics.components.heatmap.aria')}>
      {points.map((point, index) => {
        const intensity = Math.min(Math.max(point.value / 100, 0.08), 1);
        return (
          <div
            key={`${point.label}-${index}`}
            className="aspect-square rounded-sm border border-white/[0.04]"
            style={{ background: `color-mix(in srgb, var(--accent) ${intensity * 100}%, transparent)` }}
            title={`${point.label}: ${point.value}`}
          />
        );
      })}
    </div>
  );
}

function buildFilters(t: Translator): readonly [keyof AnalyticsFilters, string, keyof AnalyticsFilterOptions | null][] {
  return [
    ['period', t('analytics.components.filters.period'), null],
    ['workspace', t('analytics.components.filters.workspace'), 'workspaces'],
    ['project_type', t('analytics.components.filters.projectType'), 'project_types'],
    ['provider', t('analytics.components.filters.providerLlm'), 'providers'],
    ['stack', t('analytics.components.filters.stack'), 'stacks'],
    ['status', t('analytics.components.filters.status'), 'statuses'],
    ['module', t('analytics.components.filters.module'), 'modules'],
    ['severity', t('analytics.components.filters.severity'), 'severities'],
    ['agent', t('analytics.components.filters.agent'), 'agents'],
    ['language', t('analytics.components.filters.language'), 'languages'],
    ['framework', t('analytics.components.filters.framework'), 'frameworks'],
  ];
}

export function AnalyticsTimeRangePicker({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useLocale();
  return (
    <label className="relative">
      <span className="sr-only">{t('analytics.components.filters.period')}</span>
      <CalendarRange className="pointer-events-none absolute left-3 top-3.5 h-3.5 w-3.5 text-[color:var(--muted)]" />
      <Select value={value} onChange={(event) => onChange(event.target.value)} className="w-full pl-9 font-mono text-xs">
        <option value="24h">{t('analytics.components.timeRange.last24h')}</option>
        <option value="7d">{t('analytics.components.timeRange.last7d')}</option>
        <option value="30d">{t('analytics.components.timeRange.last30d')}</option>
        <option value="90d">{t('analytics.components.timeRange.last90d')}</option>
      </Select>
    </label>
  );
}

export function AnalyticsFilterBar({
  filters,
  options,
  onChange,
  onReset,
  pending,
}: {
  readonly filters: AnalyticsFilters;
  readonly options?: AnalyticsFilterOptions;
  readonly onChange: (key: keyof AnalyticsFilters, value: string) => void;
  readonly onReset: () => void;
  readonly pending: boolean;
}) {
  const { t } = useLocale();
  const filterFields = buildFilters(t);
  return (
    <Card className="p-4" data-testid="analytics-filter-bar">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">{t('analytics.components.filterBar.scope')}</span>
          {pending ? <RefreshCw className="h-3 w-3 animate-spin text-[color:var(--accent)]" /> : null}
        </div>
        <button type="button" onClick={onReset} className="focus-ring min-h-11 text-xs text-[color:var(--muted)] hover:text-[color:var(--text)]">{t('analytics.components.filterBar.clear')}</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
        {filterFields.map(([key, label, optionKey]) => key === 'period' ? (
          <AnalyticsTimeRangePicker key={key} value={filters.period} onChange={(value) => onChange('period', value)} />
        ) : (
          <label key={key} className="relative">
            <span className="sr-only">{label}</span>
            <Select value={filters[key]} onChange={(event) => onChange(key, event.target.value)} className="w-full appearance-none pr-8 text-xs">
              <option value="all">{t('analytics.components.filters.allOption', { label })}</option>
              {(optionKey ? options?.[optionKey] ?? [] : []).map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-3.5 w-3.5 text-[color:var(--muted)]" />
          </label>
        ))}
      </div>
    </Card>
  );
}

export function ExportAnalyticsButton({ metrics, period }: { readonly metrics: readonly AnalyticsMetric[]; readonly period: string }) {
  const { t } = useLocale();
  function exportCsv() {
    const rows = [['metric', 'value', 'unit'], ...metrics.map((metric) => [metric.label, metric.value ?? '', metric.unit ?? ''])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ldcn-analytics-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button onClick={exportCsv} disabled={metrics.length === 0} className="h-10">
      <Download className="h-4 w-4" /> {t('analytics.components.exportCsv')}
    </Button>
  );
}

export function EmptyStatePremium() {
  const { t } = useLocale();
  return (
    <Card className="relative overflow-hidden border-[color-mix(in_srgb,var(--accent)_20%,var(--border))] p-8 sm:p-12" data-testid="analytics-empty-state">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[color:var(--accent)] opacity-[0.06] blur-3xl" />
      <div className="relative max-w-3xl">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--border)] bg-white/[0.025]">
          <Clock3 className="h-5 w-5 text-[color:var(--accent)]" />
        </span>
        <p className="mt-7 font-mono text-xs uppercase tracking-[0.24em] text-[color:var(--accent)]">{t('analytics.components.empty.eyebrow')}</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--text)]">{t('analytics.components.empty.title')}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
          {t('analytics.components.empty.description')}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/meta-factory" className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-[color:var(--accent-foreground)]"><Factory className="h-4 w-4" /> {t('analytics.components.empty.openMetaFactory')}</Link>
          <Link href="/modernize" className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-2.5 text-sm font-medium text-[color:var(--text)]"><RefreshCw className="h-4 w-4" /> {t('analytics.components.empty.openModernize')}</Link>
          <Link href="/engineering-laboratory" className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-2.5 text-sm font-medium text-[color:var(--text)]"><FlaskConical className="h-4 w-4" /> {t('analytics.components.empty.openLab')}</Link>
        </div>
      </div>
    </Card>
  );
}

export function AnalyticsDrilldownDrawer({
  title,
  records,
  onClose,
}: {
  readonly title: string;
  readonly records: readonly AnalyticsRecord[];
  readonly onClose: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={t('analytics.components.drawer.detailsOf', { title })}>
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label={t('analytics.components.drawer.closeDetails')} />
      <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border)] pb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[color:var(--accent)]">{t('analytics.components.drawer.eyebrow')}</p>
            <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{title}</h2>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0" aria-label={t('analytics.components.drawer.close')}><X className="h-4 w-4" /></Button>
        </div>
        {records.length ? (
          <div className="mt-5 space-y-3">
            {records.map((record) => (
              <div key={record.id} className="rounded-lg border border-[color:var(--border)] bg-white/[0.02] p-4">
                {Object.entries(record).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[9rem_1fr] gap-3 border-b border-white/[0.04] py-2 last:border-0">
                    <span className="font-mono text-xs uppercase text-[color:var(--muted)]">{key}</span>
                    <span className="break-words text-xs text-[color:var(--text)]">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-lg border border-dashed border-[color:var(--border)] p-6 text-sm text-[color:var(--muted)]">
            {t('analytics.components.drawer.empty')}
          </p>
        )}
      </aside>
    </div>
  );
}

export function AnalyticsSecurityMark() {
  const { t } = useLocale();
  return (
    <span className="inline-flex items-center gap-2 text-xs text-[color:var(--muted)]">
      <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
      {t('analytics.components.securityMark')}
    </span>
  );
}
