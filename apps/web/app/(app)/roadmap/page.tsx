'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Blocks,
  CalendarDays,
  CheckCircle2,
  Circle,
  GitBranch,
  Gauge,
  Layers3,
  Map as MapIcon,
  Package,
  Search,
  Shield,
  Sparkles,
  Target,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { useRoadmap } from '@/hooks/use-roadmap';
import { useLocale } from '@/hooks/use-locale';
import { getApiErrorMessage } from '@/lib/api/errors';
import type { RoadmapResponse } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { useLDCNStore } from '@/stores/use-ldcn-store';

type RoadmapItem = RoadmapResponse['items'][number];
type Release = NonNullable<RoadmapResponse['releases']>[number];
type TimelineStep = NonNullable<RoadmapResponse['platform_timeline']>[number];
type GaugeItem = NonNullable<RoadmapResponse['executive_health']>[number];
type MetricItem = NonNullable<RoadmapResponse['platform_metrics']>[number];
type Edge = NonNullable<RoadmapResponse['dependency_edges']>[number];

type SectionKey = 'implemented' | 'development' | 'current' | 'next' | 'backlog' | 'research' | 'archived';

const statusLabel: Record<string, string> = {
  IMPLEMENTED: 'Implementado',
  IN_PROGRESS: 'Em desenvolvimento',
  PLANNED: 'Planejado',
  FUTURE: 'Futuro',
  ARCHIVED: 'Arquivado',
};

const priorityTone: Record<string, BadgeTone> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'accent',
  LOW: 'neutral',
};

const riskTone: Record<string, BadgeTone> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'success',
};

const categoryIcon: Record<string, LucideIcon> = {
  module: Blocks,
  engine: Zap,
  registry: Package,
  visualization: Activity,
  template: Layers3,
  skill: Sparkles,
  extension: GitBranch,
  agent: Sparkles,
  infrastructure: Workflow,
  backend: Workflow,
  frontend: Layers3,
  ai: Sparkles,
  security: Shield,
  deploy: GitBranch,
  architecture: MapIcon,
  documentation: Package,
  laboratory: Gauge,
};

const filters = [
  { id: 'all', label: 'Todos' },
  { id: 'engine', label: 'Motores' },
  { id: 'module', label: 'Modulos' },
  { id: 'agent', label: 'Agentes' },
  { id: 'skill', label: 'Skills' },
  { id: 'template', label: 'Templates' },
  { id: 'infrastructure', label: 'Infraestrutura' },
  { id: 'backend', label: 'Backend' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'ia', label: 'IA' },
  { id: 'security', label: 'Seguranca' },
  { id: 'deploy', label: 'Deploy' },
  { id: 'architecture', label: 'Arquitetura' },
];

const sectionConfig: { key: SectionKey; label: string; detail: string }[] = [
  { key: 'implemented', label: 'Implementado', detail: 'Entregue e disponivel no roadmap governado.' },
  { key: 'development', label: 'Em Desenvolvimento', detail: 'Modulos ativos com progresso parcial.' },
  { key: 'current', label: 'Sprint Atual', detail: 'Escopo da release ativa.' },
  { key: 'next', label: 'Proxima Sprint', detail: 'Itens planejados para a proxima release.' },
  { key: 'backlog', label: 'Backlog', detail: 'Trabalho futuro ainda nao iniciado.' },
  { key: 'research', label: 'Pesquisa', detail: 'Iniciativas experimentais ou aguardando decisao.' },
  { key: 'archived', label: 'Arquivado', detail: 'Itens documentados sem dependencia ativa.' },
];

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function formatLabel(value?: string) {
  return (value ?? 'nao informado').replaceAll('_', ' ');
}

function percent(value?: number) {
  return `${Math.max(0, Math.min(100, value ?? 0))}%`;
}

function iconFor(item: RoadmapItem) {
  return categoryIcon[item.category] ?? Blocks;
}

function statusTone(status?: string): BadgeTone {
  if (status === 'IMPLEMENTED') return 'success';
  if (status === 'IN_PROGRESS') return 'accent';
  if (status === 'ARCHIVED') return 'warning';
  return 'neutral';
}

function releaseTone(status?: string): BadgeTone {
  if (status === 'DELIVERED') return 'success';
  if (status === 'ACTIVE') return 'accent';
  return 'neutral';
}

function gaugeTone(status?: string): string {
  if (status === 'healthy') return 'var(--success)';
  if (status === 'blocked') return 'var(--danger)';
  return 'var(--warning)';
}

function fallbackMetrics(items: readonly RoadmapItem[]): MetricItem[] {
  const active = items.filter((item) => item.status !== 'ARCHIVED');
  const progress = active.length ? Math.round(active.reduce((sum, item) => sum + (item.progress ?? 0), 0) / active.length) : 0;
  const countBy = (category: string) => items.filter((item) => item.category === category).length;
  return [
    { contractVersion: '1.0.0', id: 'platform', label: 'Plataforma', value: `${progress}%`, detail: 'Derivado dos itens carregados.' },
    { contractVersion: '1.0.0', id: 'projects', label: 'Projetos', value: '0', detail: 'Telemetria de projetos nao veio no roadmap.' },
    { contractVersion: '1.0.0', id: 'engines', label: 'Motores', value: String(countBy('engine')), detail: 'Derivado da categoria dos itens.' },
    { contractVersion: '1.0.0', id: 'agents', label: 'Agentes', value: String(countBy('agent')), detail: 'Derivado da categoria dos itens.' },
    { contractVersion: '1.0.0', id: 'modules', label: 'Modulos', value: String(countBy('module')), detail: 'Derivado da categoria dos itens.' },
    { contractVersion: '1.0.0', id: 'skills', label: 'Skills', value: String(countBy('skill')), detail: 'Derivado da categoria dos itens.' },
    { contractVersion: '1.0.0', id: 'templates', label: 'Templates', value: String(countBy('template')), detail: 'Derivado da categoria dos itens.' },
    { contractVersion: '1.0.0', id: 'architectures', label: 'Arquiteturas', value: String(countBy('architecture')), detail: 'Derivado da categoria dos itens.' },
  ];
}

function fallbackReleases(items: readonly RoadmapItem[]): Release[] {
  const releaseIds = Array.from(new Set(items.map((item) => item.release).filter(Boolean)));
  return releaseIds.map((id) => {
    const releaseItems = items.filter((item) => item.release === id);
    const progress = releaseItems.length ? Math.round(releaseItems.reduce((sum, item) => sum + (item.progress ?? 0), 0) / releaseItems.length) : 0;
    return {
      contractVersion: '1.0.0',
      id,
      title: id,
      date: 'nao informado',
      status: progress >= 100 ? 'DELIVERED' : progress > 0 ? 'ACTIVE' : 'PLANNED',
      progress,
      features: releaseItems.map((item) => item.id),
      dependencies: [],
      risks: [],
    } satisfies Release;
  });
}

function fallbackTimeline(items: readonly RoadmapItem[]): TimelineStep[] {
  const ids = ['project_room', 'prompt_master', 'architect', 'blueprint', 'meta_factory', 'engineering_review', 'engineering_laboratory', 'deploy_center'];
  return ids.flatMap((id) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return [];
    return [{ contractVersion: item.contractVersion, id: item.id, title: item.title, status: item.status, description: item.summary, dependencies: item.dependencies ?? [], engines: item.engines ?? [], apis: item.apis ?? [], documentation: item.documentation ?? [] }];
  });
}

function ProgressBar({ value, className }: { readonly value?: number; readonly className?: string }) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-white/10', className)}>
      <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),color-mix(in_srgb,var(--accent)_45%,var(--success)))]" style={{ width: percent(value) }} />
    </div>
  );
}

function GaugeCard({ gauge }: { readonly gauge: GaugeItem }) {
  const value = Math.max(0, Math.min(100, gauge.value ?? 0));
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_42%,transparent)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[color:var(--text)]">{gauge.label}</span>
        <span className="font-mono text-sm text-[color:var(--text)]">{value}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: gaugeTone(gauge.status) }} />
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">{gauge.basis}</p>
    </div>
  );
}

function ModuleCard({ item, onOpen }: { readonly item: RoadmapItem; readonly onOpen: (item: RoadmapItem) => void }) {
  const { t } = useLocale();
  const Icon = iconFor(item);
  return (
    <article className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_74%,transparent)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 text-[color:var(--accent)]">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-[color:var(--text)]">{item.title}</h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">{item.summary}</p>
          </div>
        </div>
        <Badge tone={statusTone(item.status)} className="shrink-0">{statusLabel[item.status] ?? item.status}</Badge>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
          <span>{t('roadmap.card.progress')}</span>
          <span className="font-mono text-[color:var(--text)]">{percent(item.progress)}</span>
        </div>
        <ProgressBar value={item.progress} />
      </div>
      <div className="mt-4 grid gap-2 text-xs text-[color:var(--muted)] sm:grid-cols-2">
        <span>{t('roadmap.card.release')} <strong className="text-[color:var(--text)]">{item.release || 'nao informado'}</strong></span>
        <span>{t('roadmap.card.owner')} <strong className="text-[color:var(--text)]">{item.owner || 'nao informado'}</strong></span>
        <span>{t('roadmap.card.updated')} <strong className="text-[color:var(--text)]">{item.updated_at || 'nao informado'}</strong></span>
        <span>{t('roadmap.card.deps')} <strong className="text-[color:var(--text)]">{(item.dependencies ?? []).length}</strong></span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={priorityTone[item.priority] ?? 'neutral'}>{formatLabel(item.priority)}</Badge>
        <Badge tone={riskTone[item.risk] ?? 'neutral'}>{t('roadmap.card.risk')} {formatLabel(item.risk)}</Badge>
        <Badge>{formatLabel(item.maturity)}</Badge>
        <Button type="button" variant="ghost" className="ml-auto h-8 px-3" onClick={() => onOpen(item)}>{t('roadmap.card.open')}</Button>
      </div>
    </article>
  );
}

function EdgeMap({ title, edges, items, selectedId, onSelect }: { readonly title: string; readonly edges: readonly Edge[]; readonly items: readonly RoadmapItem[]; readonly selectedId?: string; readonly onSelect: (id: string) => void }) {
  const { t } = useLocale();
  const label = useMemo(() => new Map(items.map((item) => [item.id, item.title])), [items]);
  const visible = edges.slice(0, 12);
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.map.eyebrow')}</p>
          <h2 className="text-lg font-semibold text-[color:var(--text)]">{title}</h2>
        </div>
        <Badge>{t('roadmap.map.relations', { count: edges.length })}</Badge>
      </div>
      <div className="grid gap-2">
        {visible.length ? visible.map((edge) => (
          <button
            key={`${edge.source}-${edge.target}-${edge.kind}`}
            type="button"
            onClick={() => onSelect(edge.target)}
            className={cn(
              'focus-ring grid gap-2 rounded-[var(--radius-md)] border p-3 text-left transition md:grid-cols-[1fr_auto_1fr]',
              selectedId === edge.target ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]' : 'border-[color:var(--border)] bg-white/5 hover:border-[color:var(--border-strong)]',
            )}
          >
            <span className="truncate text-sm font-medium text-[color:var(--text)]">{label.get(edge.source) ?? edge.source}</span>
            <span className="text-xs text-[color:var(--muted)] md:text-center">{t('roadmap.map.impacts')}</span>
            <span className="truncate text-sm font-medium text-[color:var(--text)]">{label.get(edge.target) ?? edge.target}</span>
          </button>
        )) : <p className="text-sm text-[color:var(--muted)]">{t('roadmap.map.empty')}</p>}
      </div>
    </Card>
  );
}

function DetailPanel({ item }: { readonly item?: RoadmapItem }) {
  const { t } = useLocale();
  if (!item) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[color:var(--muted)]">{t('roadmap.detail.empty')}</p>
      </Card>
    );
  }
  const groups = [
    ['Dependencias', item.dependencies ?? []],
    ['Motores', item.engines ?? []],
    ['APIs', item.apis ?? []],
    ['Skills', item.skills ?? []],
    ['Contratos', item.contracts ?? []],
    ['Documentacao', item.documentation ?? []],
  ] as const;
  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.detail.openModule')}</p>
          <h2 className="mt-1 text-xl font-semibold text-[color:var(--text)]">{item.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{item.summary}</p>
        </div>
        <Badge tone={statusTone(item.status)}>{statusLabel[item.status] ?? item.status}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><span className="text-xs text-[color:var(--muted)]">{t('roadmap.detail.release')}</span><p className="font-mono text-sm text-[color:var(--text)]">{item.release}</p></div>
        <div><span className="text-xs text-[color:var(--muted)]">{t('roadmap.detail.priority')}</span><p className="font-mono text-sm text-[color:var(--text)]">{formatLabel(item.priority)}</p></div>
        <div><span className="text-xs text-[color:var(--muted)]">{t('roadmap.detail.maturity')}</span><p className="font-mono text-sm text-[color:var(--text)]">{formatLabel(item.maturity)}</p></div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted-2)]">{t('roadmap.detail.impact')}</p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text)]">{item.impact}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted-2)]">{t('roadmap.detail.riskBasis')}</p>
        <ul className="mt-2 space-y-1 text-sm text-[color:var(--muted)]">
          {(item.risk_basis ?? []).map((basis) => <li key={basis}>- {basis}</li>)}
        </ul>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map(([title, values]) => (
          <div key={title} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 p-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--muted-2)]">{title}</p>
            <p className="mt-2 text-sm text-[color:var(--text)]">{values.length ? values.join(', ') : t('roadmap.detail.notInformed')}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function RoadmapPage() {
  const { t } = useLocale();
  const roadmapQuery = useRoadmap();
  const roadmap = roadmapQuery.data;
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<ReadonlySet<SectionKey>>(() => new Set());

  const items = roadmap?.items ?? [];
  const releases = roadmap?.releases?.length ? roadmap.releases : fallbackReleases(items);
  const timeline = roadmap?.platform_timeline?.length ? roadmap.platform_timeline : fallbackTimeline(items);
  const metrics = roadmap?.platform_metrics?.length ? roadmap.platform_metrics : fallbackMetrics(items);
  const health = roadmap?.executive_health ?? [];
  const coverage = roadmap?.coverage ?? [];
  const dependencyEdges = roadmap?.dependency_edges ?? [];
  const impactEdges = roadmap?.impact_edges ?? [];
  const sprints = roadmap?.sprints ?? [];
  const statistics = roadmap?.statistics ?? [];

  const selectedRelease = releases.find((release) => release.id === (selectedReleaseId ?? releases[0]?.id)) ?? releases[0];
  const selectedStep = timeline.find((step) => step.id === (selectedStepId ?? timeline[0]?.id)) ?? timeline[0];
  const selectedItem = items.find((item) => item.id === (selectedItemId ?? selectedStep?.id)) ?? items.find((item) => item.id === selectedStep?.id) ?? items[0];

  const releaseItems = useMemo(() => {
    if (!selectedRelease) return [];
    const ids = new Set(selectedRelease.features ?? []);
    return items.filter((item) => ids.has(item.id) || item.release === selectedRelease.id);
  }, [items, selectedRelease]);

  const filteredItems = useMemo(() => {
    const term = normalize(query);
    return items.filter((item) => {
      const tags = item.tags ?? [];
      const matchesFilter = activeFilter === 'all' || item.category === activeFilter || tags.includes(activeFilter);
      const haystack = normalize([item.title, item.summary, item.category, item.status, item.release, item.owner, ...tags, ...(item.dependencies ?? [])].join(' '));
      return matchesFilter && (!term || haystack.includes(term));
    });
  }, [activeFilter, items, query]);

  const grouped = useMemo(() => {
    const buckets = new Map<SectionKey, RoadmapItem[]>();
    for (const config of sectionConfig) buckets.set(config.key, []);
    for (const item of filteredItems) {
      if (item.status === 'ARCHIVED') buckets.get('archived')?.push(item);
      else if (item.status === 'IMPLEMENTED') buckets.get('implemented')?.push(item);
      else if (item.status === 'IN_PROGRESS') buckets.get('development')?.push(item);
      else if (item.release === 'v2.5') buckets.get('current')?.push(item);
      else if (item.release === 'v3') buckets.get('next')?.push(item);
      else if (item.status === 'FUTURE') buckets.get('backlog')?.push(item);
      else buckets.get('research')?.push(item);
    }
    return buckets;
  }, [filteredItems]);

  function toggleSection(section: SectionKey) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  const visualColumns = useMemo(() => {
    return [
      { label: 'Planejado', items: filteredItems.filter((item) => item.status === 'PLANNED' || item.status === 'FUTURE') },
      { label: 'Em andamento', items: filteredItems.filter((item) => item.status === 'IN_PROGRESS') },
      { label: 'Review', items: filteredItems.filter((item) => item.risk === 'HIGH' || item.risk === 'CRITICAL') },
      { label: 'Concluido', items: filteredItems.filter((item) => item.status === 'IMPLEMENTED') },
    ];
  }, [filteredItems]);

  useEffect(() => {
    setPresenceState(roadmapQuery.isError ? 'warning' : 'observing');
    setContext({
      route: '/roadmap',
      page_title: t('roadmap.context.pageTitle'),
      current_phase: 'Roadmap Center',
      pipeline: {
        route: '/roadmap',
        phase: 'Roadmap Center',
        status: roadmapQuery.isError ? 'degraded' : 'ready',
        readiness_label: roadmap ? `${roadmap.items.length} itens governados` : t('roadmap.context.loading'),
        detail: 'Centro executivo de releases, dependencias, impacto e maturidade da plataforma.',
      },
      status: roadmapQuery.isError ? 'warning' : 'observing',
      summary: 'Roadmap executivo baseado no endpoint real /api/roadmap.',
      suggestions: [],
    });
  }, [roadmap, roadmapQuery.isError, setContext, setPresenceState, t]);

  if (roadmapQuery.isLoading) {
    return <CardLoading />;
  }

  if (roadmapQuery.isError) {
    return (
      <PageError
        title={t('roadmap.error.title')}
        description={getApiErrorMessage(roadmapQuery.error, t('roadmap.error.description'))}
        onRetry={() => void roadmapQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[32px] border border-[color:var(--border)] bg-[radial-gradient(circle_at_12%_18%,color-mix(in_srgb,var(--accent)_24%,transparent),transparent_34%),linear-gradient(135deg,color-mix(in_srgb,var(--surface-1)_96%,black),color-mix(in_srgb,var(--surface-2)_92%,black))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.24)] lg:p-8">
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)]" />
        <div className="relative grid gap-8 xl:grid-cols-[1.1fr_1fr]">
          <div className="space-y-6">
            <Badge tone="accent">{t('roadmap.hero.eyebrow')}</Badge>
            <div>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.02em] text-[color:var(--text)] md:text-6xl">{t('roadmap.hero.title')}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[color:var(--muted)] md:text-lg">{t('roadmap.hero.description')}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="primary" onClick={() => document.getElementById('roadmap-executivo')?.scrollIntoView({ behavior: 'smooth' })}>{t('roadmap.hero.open')}</Button>
              <Button type="button" variant="secondary" onClick={() => document.getElementById('dependency-map')?.scrollIntoView({ behavior: 'smooth' })}>{t('roadmap.hero.viewDeps')}</Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map((metric) => (
              <div key={metric.id} className="rounded-[var(--radius-lg)] border border-white/10 bg-white/[0.045] p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-2)]">{metric.label}</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--text)]">{metric.value}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">{metric.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.releases.eyebrow')}</p>
              <h2 className="text-xl font-semibold text-[color:var(--text)]">{t('roadmap.releases.title')}</h2>
            </div>
            <Badge>{t('roadmap.releases.count', { count: releases.length })}</Badge>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max items-center gap-3">
              {releases.map((release, index) => {
                const active = release.id === selectedRelease?.id;
                const done = release.status === 'DELIVERED';
                return (
                  <button key={release.id} type="button" data-testid={`release-${release.id}`} onClick={() => setSelectedReleaseId(release.id)} className="focus-ring group grid min-w-36 gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/5 p-3 text-left data-[active=true]:border-[color:var(--accent)] data-[active=true]:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" data-active={active}>
                    <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
                      {done ? <CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" /> : release.status === 'ACTIVE' ? <Circle className="h-4 w-4 fill-[color:var(--accent)] text-[color:var(--accent)]" /> : <Circle className="h-4 w-4 text-[color:var(--muted)]" />}
                      {release.id}
                    </span>
                    <span className="text-xs text-[color:var(--muted)]">{release.title}</span>
                    <ProgressBar value={release.progress} />
                    {index < releases.length - 1 ? <span className="sr-only">{t('roadmap.releases.next')}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
          {selectedRelease ? (
            <div className="grid gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/5 p-4 md:grid-cols-[0.7fr_1.3fr]">
              <div className="space-y-2">
                <Badge tone={releaseTone(selectedRelease.status)}>{formatLabel(selectedRelease.status)}</Badge>
                <h3 className="text-lg font-semibold text-[color:var(--text)]">{selectedRelease.title}</h3>
                <p className="text-sm text-[color:var(--muted)]">{t('roadmap.releases.date')} {selectedRelease.date}</p>
                <ProgressBar value={selectedRelease.progress} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted-2)]">{t('roadmap.releases.features')}</p><p className="mt-2 text-sm text-[color:var(--text)]">{releaseItems.map((item) => item.title).join(', ') || 'Nao informado'}</p></div>
                <div><p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted-2)]">{t('roadmap.releases.deps')}</p><p className="mt-2 text-sm text-[color:var(--text)]">{(selectedRelease.dependencies ?? []).join(', ') || 'Sem dependencias registradas'}</p></div>
                <div className="sm:col-span-2"><p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted-2)]">{t('roadmap.releases.risks')}</p><p className="mt-2 text-sm text-[color:var(--text)]">{(selectedRelease.risks ?? []).join(' ') || 'Sem risco registrado pelo backend.'}</p></div>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.sprints.eyebrow')}</p>
              <h2 className="text-xl font-semibold text-[color:var(--text)]">{t('roadmap.sprints.title')}</h2>
            </div>
          </div>
          {sprints.length ? sprints.map((sprint) => (
            <div key={sprint.id} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-[color:var(--text)]">{sprint.title}</h3>
                <Badge tone={sprint.status === 'ACTIVE' ? 'accent' : 'neutral'}>{formatLabel(sprint.status)}</Badge>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="text-3xl font-semibold text-[color:var(--text)]">{sprint.progress}%</span>
                <span className="text-sm text-[color:var(--muted)]">{t('roadmap.sprints.progress', { completed: sprint.completed, inProgress: sprint.in_progress })}</span>
              </div>
              <ProgressBar value={sprint.progress} className="mt-3" />
              <p className="mt-2 text-xs text-[color:var(--muted)]">{t('roadmap.sprints.tasks', { count: sprint.tasks })}</p>
            </div>
          )) : <p className="text-sm text-[color:var(--muted)]">{t('roadmap.sprints.empty')}</p>}
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.timeline.eyebrow')}</p>
              <h2 className="text-xl font-semibold text-[color:var(--text)]">{t('roadmap.timeline.title')}</h2>
            </div>
            <Badge>{t('roadmap.timeline.steps', { count: timeline.length })}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {timeline.map((step, index) => {
              const active = step.id === selectedStep?.id;
              return (
                <button key={step.id} type="button" onClick={() => { setSelectedStepId(step.id); setSelectedItemId(step.id); }} className="focus-ring group grid grid-cols-[auto_1fr] gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition data-[active=true]:border-[color:var(--accent)] data-[active=true]:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] data-[active=false]:border-[color:var(--border)] data-[active=false]:bg-white/5" data-active={active}>
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-3)] font-mono text-xs text-[color:var(--text)]">{index + 1}</span>
                  <span className="min-w-0">
                    <span className="flex items-center justify-between gap-3">
                      <strong className="truncate text-sm text-[color:var(--text)]">{step.title}</strong>
                      <Badge tone={statusTone(step.status)}>{statusLabel[step.status] ?? step.status}</Badge>
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">{step.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
        <DetailPanel item={selectedItem} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <Gauge className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.health.eyebrow')}</p>
              <h2 className="text-xl font-semibold text-[color:var(--text)]">{t('roadmap.health.title')}</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {health.length ? health.map((gauge) => <GaugeCard key={gauge.id} gauge={gauge} />) : <p className="text-sm text-[color:var(--muted)]">{t('roadmap.health.empty')}</p>}
          </div>
        </Card>
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.coverage.eyebrow')}</p>
              <h2 className="text-xl font-semibold text-[color:var(--text)]">{t('roadmap.coverage.title')}</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {coverage.length ? coverage.map((gauge) => <GaugeCard key={gauge.id} gauge={gauge} />) : <p className="text-sm text-[color:var(--muted)]">{t('roadmap.coverage.empty')}</p>}
          </div>
        </Card>
      </section>

      <section id="roadmap-executivo" className="space-y-5">
        <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_78%,transparent)] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.exec.eyebrow')}</p>
            <h2 className="text-2xl font-semibold text-[color:var(--text)]">{t('roadmap.exec.title')}</h2>
            <p className="mt-1 text-sm text-[color:var(--muted)]">{t('roadmap.exec.hint')}</p>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[420px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" aria-hidden />
              <Input aria-label={t('roadmap.exec.searchAria')} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('roadmap.exec.searchPlaceholder')} className="pl-10" />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {filters.map((filter) => (
                <button key={filter.id} type="button" onClick={() => setActiveFilter(filter.id)} className="focus-ring shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition data-[active=true]:border-[color:var(--accent)] data-[active=true]:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] data-[active=true]:text-[color:var(--text)] data-[active=false]:border-[color:var(--border)] data-[active=false]:text-[color:var(--muted)]" data-active={activeFilter === filter.id}>{filter.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {sectionConfig.map((section) => {
            const sectionItems = grouped.get(section.key) ?? [];
            const isOpen = openSections.has(section.key);
            return (
              <div key={section.key} className="rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_72%,transparent)] p-4">
                <button type="button" data-testid={`roadmap-section-${section.key}`} aria-expanded={isOpen} onClick={() => toggleSection(section.key)} className="focus-ring flex w-full items-center justify-between gap-4 rounded-[var(--radius-md)] p-2 text-left">
                  <span>
                    <span className="block text-lg font-semibold text-[color:var(--text)]">{section.label}</span>
                    <span className="text-sm text-[color:var(--muted)]">{section.detail}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge>{t('roadmap.exec.items', { count: sectionItems.length })}</Badge>
                    <span className={cn('text-sm text-[color:var(--muted)] transition', isOpen && 'rotate-90')}>›</span>
                  </span>
                </button>
                {isOpen ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    {sectionItems.length ? sectionItems.map((item) => <ModuleCard key={item.id} item={item} onOpen={(next) => setSelectedItemId(next.id)} />) : <p className="p-3 text-sm text-[color:var(--muted)]">{t('roadmap.exec.emptyFilter')}</p>}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section id="dependency-map" className="grid gap-5 xl:grid-cols-2">
        <EdgeMap title={t('roadmap.maps.dependencies')} edges={dependencyEdges} items={items} selectedId={selectedItem?.id} onSelect={setSelectedItemId} />
        <EdgeMap title={t('roadmap.maps.impact')} edges={impactEdges} items={items} selectedId={selectedItem?.id} onSelect={setSelectedItemId} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.visual.eyebrow')}</p>
              <h2 className="text-xl font-semibold text-[color:var(--text)]">{t('roadmap.visual.title')}</h2>
            </div>
            <Badge>{t('roadmap.visual.filtered', { count: filteredItems.length })}</Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            {visualColumns.map((column) => (
              <div key={column.label} className="min-h-64 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/5 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[color:var(--text)]">{column.label}</h3>
                  <Badge>{column.items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {column.items.slice(0, 8).map((item) => (
                    <button key={`${column.label}-${item.id}`} type="button" onClick={() => setSelectedItemId(item.id)} className="focus-ring w-full rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_55%,transparent)] p-3 text-left hover:border-[color:var(--border-strong)]">
                      <span className="block truncate text-sm font-medium text-[color:var(--text)]">{item.title}</span>
                      <span className="mt-1 flex items-center justify-between gap-2 text-xs text-[color:var(--muted)]"><span>{item.release}</span><span>{percent(item.progress)}</span></span>
                    </button>
                  ))}
                  {column.items.length > 8 ? <p className="text-xs text-[color:var(--muted)]">{t('roadmap.visual.hidden', { count: column.items.length - 8 })}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.stats.eyebrow')}</p>
              <h2 className="text-xl font-semibold text-[color:var(--text)]">{t('roadmap.stats.title')}</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {statistics.length ? statistics.map((metric) => (
              <div key={metric.id} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 p-3">
                <p className="text-xs text-[color:var(--muted)]">{metric.label}</p>
                <p className="mt-1 text-2xl font-semibold text-[color:var(--text)]">{metric.value}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">{metric.detail}</p>
              </div>
            )) : <p className="text-sm text-[color:var(--muted)]">{t('roadmap.stats.empty')}</p>}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-[color:var(--warning)]" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.risks.eyebrow')}</p>
              <h2 className="text-xl font-semibold text-[color:var(--text)]">{t('roadmap.risks.title')}</h2>
            </div>
          </div>
          <div className="space-y-3">
            {items.filter((item) => item.risk === 'HIGH' || item.risk === 'CRITICAL' || item.priority === 'CRITICAL').slice(0, 8).map((item) => (
              <button key={`risk-${item.id}`} type="button" onClick={() => setSelectedItemId(item.id)} className="focus-ring flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 p-3 text-left">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[color:var(--text)]">{item.title}</span>
                  <span className="text-xs text-[color:var(--muted)]">{formatLabel(item.priority)} {t('roadmap.risks.riskInfix')} {formatLabel(item.risk)}</span>
                </span>
                <Badge tone={riskTone[item.risk] ?? 'neutral'}>{percent(item.progress)}</Badge>
              </button>
            ))}
          </div>
        </Card>

        <Card className="space-y-5 p-5">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-2)]">{t('roadmap.history.eyebrow')}</p>
              <h2 className="text-xl font-semibold text-[color:var(--text)]">{t('roadmap.history.title')}</h2>
            </div>
          </div>
          <div className="space-y-3">
            {[...items]
              .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
              .slice(0, 10)
              .map((item) => (
                <button key={`history-${item.id}`} type="button" onClick={() => setSelectedItemId(item.id)} className="focus-ring grid w-full grid-cols-[9rem_1fr_auto] items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 p-3 text-left">
                  <span className="font-mono text-xs text-[color:var(--muted)]">{item.updated_at || 'nao informado'}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[color:var(--text)]">{item.title}</span>
                    <span className="text-xs text-[color:var(--muted)]">{item.owner}</span>
                  </span>
                  <Badge tone={statusTone(item.status)}>{statusLabel[item.status] ?? item.status}</Badge>
                </button>
              ))}
          </div>
        </Card>
      </section>
    </div>
  );
}




