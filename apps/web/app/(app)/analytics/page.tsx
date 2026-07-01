'use client';

import { startTransition, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  DatabaseZap,
  Layers3,
  Radio,
} from 'lucide-react';

import {
  AnalyticsAgentTable,
  AnalyticsChartCard,
  AnalyticsDrilldownDrawer,
  AnalyticsFilterBar,
  AnalyticsMetricCard,
  AnalyticsProviderBreakdown,
  AnalyticsQualityRadar,
  AnalyticsSecurityMark,
  AnalyticsTrendChart,
  DataFreshnessBadge,
  EmptyStatePremium,
  ExportAnalyticsButton,
} from '@/components/analytics/analytics-components';
import { PageError } from '@/components/feedback/error-system';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/hooks/use-analytics';
import type {
  AnalyticsFilters,
  AnalyticsMetric,
  AnalyticsRecord,
  AnalyticsSection,
} from '@/lib/api/analytics';
import { getApiErrorMessage } from '@/lib/api/errors';

const INITIAL_FILTERS: AnalyticsFilters = {
  period: '30d',
  workspace: 'all',
  project_type: 'all',
  provider: 'all',
  stack: 'all',
  status: 'all',
  module: 'all',
  severity: 'all',
  agent: 'all',
  language: 'all',
  framework: 'all',
};

const SECTION_ORDER = [
  'projects',
  'llm',
  'agents',
  'quality',
  'modernize',
  'laboratory',
  'documentation',
  'security',
  'business',
  'technology-trends',
] as const;

function AnalyticsSkeleton() {
  return (
    <div className="space-y-5" data-testid="analytics-loading">
      <Skeleton className="h-28 rounded-[var(--radius-xl)]" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-36 rounded-[var(--radius-lg)]" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-[var(--radius-xl)]" />
        <Skeleton className="h-80 rounded-[var(--radius-xl)]" />
      </div>
    </div>
  );
}

function SectionContent({
  section,
  onRecord,
}: {
  readonly section: AnalyticsSection;
  readonly onRecord: (record: AnalyticsRecord) => void;
}) {
  const series = section.series ?? [];
  const records = section.records ?? [];
  const columns = section.columns ?? (records[0] ? Object.keys(records[0]).slice(0, 8) : []);

  if (section.id === 'agents' && records.length && columns.length) {
    return <AnalyticsAgentTable records={records} columns={columns} onSelect={onRecord} />;
  }
  if (section.id === 'quality' && series.length) return <AnalyticsQualityRadar points={series} />;
  if (section.id === 'llm' && series.length) return <AnalyticsProviderBreakdown points={series} />;
  if (series.length) return <AnalyticsTrendChart points={series} />;
  if (records.length && columns.length) return <AnalyticsAgentTable records={records} columns={columns} onSelect={onRecord} />;
  return (
    <div className="rounded-lg border border-dashed border-[color:var(--border)] px-5 py-8 text-center">
      <p className="text-sm font-medium text-[color:var(--text)]">Sem série analítica para este recorte.</p>
      <p className="mt-2 text-xs text-[color:var(--muted)]">A seção permanece vazia até o backend retornar observações agregadas.</p>
    </div>
  );
}

function AnalyticsSectionPanel({
  section,
  index,
  onRecord,
}: {
  readonly section: AnalyticsSection;
  readonly index: number;
  readonly onRecord: (record: AnalyticsRecord) => void;
}) {
  return (
    <details className="group rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] [content-visibility:auto]" open={index < 2}>
      <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="font-mono text-[0.66rem] text-[color:var(--accent)]">{String(index + 1).padStart(2, '0')}</span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-[color:var(--text)]">{section.title}</h2>
            {section.description ? <p className="mt-1 truncate text-xs text-[color:var(--muted)]">{section.description}</p> : null}
          </div>
        </div>
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-[color:var(--muted)] group-open:text-[color:var(--accent)]">
          {section.metrics?.length ?? 0} métricas
        </span>
      </summary>
      <div className="border-t border-[color:var(--border)] p-5">
        {section.metrics?.length ? (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {section.metrics.map((metric) => (
              <div key={metric.id} className="rounded-lg border border-[color:var(--border)] bg-white/[0.018] p-4">
                <p className="text-xs text-[color:var(--muted)]">{metric.label}</p>
                <p className="mt-2 font-mono text-lg font-semibold text-[color:var(--text)]">{metric.value ?? '—'}{metric.unit === 'percent' ? '%' : ''}</p>
              </div>
            ))}
          </div>
        ) : null}
        <SectionContent section={section} onRecord={onRecord} />
      </div>
    </details>
  );
}

export default function AnalyticsPage() {
  const [filters, setFilters] = useState<AnalyticsFilters>(INITIAL_FILTERS);
  const [drilldown, setDrilldown] = useState<{ title: string; records: readonly AnalyticsRecord[] } | null>(null);
  const query = useAnalytics(filters);
  const analytics = query.data;

  const sections = useMemo(() => {
    const available = new Map((analytics?.sections ?? []).map((section) => [section.id, section]));
    return SECTION_ORDER.flatMap((id) => {
      const section = available.get(id);
      return section ? [section] : [];
    }).concat((analytics?.sections ?? []).filter((section) => !SECTION_ORDER.includes(section.id as typeof SECTION_ORDER[number])));
  }, [analytics?.sections]);

  function changeFilter(key: keyof AnalyticsFilters, value: string) {
    startTransition(() => setFilters((current) => ({ ...current, [key]: value })));
  }

  function openMetric(metric: AnalyticsMetric) {
    const records = sections.flatMap((section) =>
      (section.records ?? []).filter((record) => record.metric_id === metric.id),
    );
    setDrilldown({ title: metric.label, records });
  }

  function openRecord(record: AnalyticsRecord) {
    setDrilldown({ title: String(record.name ?? record.label ?? record.id), records: [record] });
  }

  return (
    <div className="space-y-6" data-testid="analytics-page">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-[color:var(--muted)]">
        <Link href="/platform" className="focus-ring hover:text-[color:var(--text)]">Platform Map</Link>
        <span>/</span>
        <span className="text-[color:var(--accent)]">Analytics</span>
      </nav>

      <header className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-6 py-7 sm:px-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_right,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_66%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[color:var(--accent)]">
                <Radio className="h-3.5 w-3.5" /> Data Intelligence Center
              </span>
              <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 font-mono text-[0.6rem] uppercase text-[color:var(--muted)]">beta</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[color:var(--text)] sm:text-4xl">Inteligência operacional, sem estimativas.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Projetos, agentes, qualidade e consumo em uma superfície auditável. Cada número abre sua origem; campos sensíveis nunca chegam à interface.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {analytics ? <DataFreshnessBadge generatedAt={analytics.generated_at} /> : null}
            <ExportAnalyticsButton metrics={analytics?.metrics ?? []} period={filters.period} />
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[color:var(--border)] pt-4">
          <span className="inline-flex items-center gap-2 text-xs text-[color:var(--muted)]"><DatabaseZap className="h-3.5 w-3.5 text-[color:var(--accent)]" /> Fonte: telemetria persistida</span>
          <span className="inline-flex items-center gap-2 text-xs text-[color:var(--muted)]"><Layers3 className="h-3.5 w-3.5 text-[color:var(--accent)]" /> Filtros processados no servidor</span>
          <AnalyticsSecurityMark />
        </div>
      </header>

      <AnalyticsFilterBar
        filters={filters}
        options={analytics?.filters}
        onChange={changeFilter}
        onReset={() => setFilters(INITIAL_FILTERS)}
        pending={query.isFetching}
      />

      {query.isLoading ? (
        <AnalyticsSkeleton />
      ) : query.isError ? (
        <PageError
          title="Não foi possível consultar Analytics"
          description={getApiErrorMessage(query.error, 'O endpoint respondeu com erro. Nenhum dado parcial foi exibido.')}
          onRetry={() => void query.refetch()}
        />
      ) : !analytics || analytics.metrics.length === 0 ? (
        <EmptyStatePremium />
      ) : (
        <>
          <section aria-labelledby="executive-overview-title">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--accent)]">Executive overview</p>
                <h2 id="executive-overview-title" className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[color:var(--text)]">Pulso da plataforma</h2>
              </div>
              <span className="hidden items-center gap-2 text-xs text-[color:var(--muted)] sm:inline-flex"><Activity className="h-3.5 w-3.5" /> Clique em uma métrica para investigar</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" data-testid="analytics-metric-grid">
              {analytics.metrics.map((metric) => <AnalyticsMetricCard key={metric.id} metric={metric} onOpen={openMetric} />)}
            </div>
          </section>

          {sections.length ? (
            <section className="space-y-3" aria-labelledby="analytics-domains-title">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--accent)]">Domínios analíticos</p>
                  <h2 id="analytics-domains-title" className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[color:var(--text)]">Leituras por operação</h2>
                </div>
                <span className="text-xs text-[color:var(--muted)]">{sections.length} fontes conectadas</span>
              </div>
              {sections.map((section, index) => <AnalyticsSectionPanel key={section.id} section={section} index={index} onRecord={openRecord} />)}
            </section>
          ) : (
            <AnalyticsChartCard title="Domínios analíticos" description="O overview foi recebido, mas ainda não há séries ou tabelas de detalhe.">
              <p className="text-sm text-[color:var(--muted)]">Conecte os endpoints de domínio listados no relatório de contrato para habilitar comparações e drill-down.</p>
            </AnalyticsChartCard>
          )}

          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[color:var(--text)]">Precisa auditar a origem?</p>
              <p className="mt-1 text-xs text-[color:var(--muted)]">Os filtros atuais seguem em cada consulta e exportação.</p>
            </div>
            <Link href="/documentation" className="focus-ring inline-flex items-center gap-2 text-sm font-medium text-[color:var(--accent)]">Abrir documentação <ArrowUpRight className="h-4 w-4" /></Link>
          </Card>
        </>
      )}

      {drilldown ? <AnalyticsDrilldownDrawer title={drilldown.title} records={drilldown.records} onClose={() => setDrilldown(null)} /> : null}
    </div>
  );
}
