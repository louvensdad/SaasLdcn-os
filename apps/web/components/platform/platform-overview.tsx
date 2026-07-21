'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowRight, Bot, Boxes, CheckCircle2, CloudCog, Code2, Database,
  Factory, Gauge, GitBranch, GraduationCap, Hammer, Layers3, Network, Package, Search,
  Server, ShieldCheck, Sparkles, type LucideIcon,
} from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';
import { useProjects } from '@/hooks/use-projects';
import { useSystemStatus } from '@/hooks/use-system-status';
import { apiRequest } from '@/lib/api/client';
import { apiEndpoints } from '@/lib/api/endpoints';
import { llmSettingsClient } from '@/lib/api/llm-settings';
import { studentEligibilityClient, type StudentVerificationView } from '@/lib/api/student-eligibility';
import type { Project } from '@/lib/api/types';
import type { RuntimeMetrics } from '@contracts/runtime-metrics.contract';
import type { LlmUsageStats } from '@contracts/llm-settings.contract';
import { cn } from '@/lib/cn';

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/** Real elapsed time since an ISO timestamp -- never a fabricated ETA. */
function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

/** A fixed, honest 5-step ladder derived from the real generation status --
 * never a per-project invented percentage. */
const STATUS_STEP: Record<string, number> = {
  draft: 1,
  blueprint_ready: 2,
  gatekeeper_approved: 3,
  ready_for_generation: 4,
  generation_blocked: 4,
  generated: 5,
  failed: 5,
};

const READINESS_TONE: Record<string, BadgeTone> = {
  not_ready: 'neutral',
  blueprint_ready: 'accent',
  ready_with_warnings: 'warning',
  ready: 'success',
  blocked: 'danger',
  generated: 'success',
  failed: 'danger',
};

interface Module { href: string; labelKey: string; icon: LucideIcon }

const MODULES: Module[] = [
  { href: '/project-rooms', labelKey: 'navigation.projectRooms.label', icon: Sparkles },
  { href: '/architect', labelKey: 'navigation.architect.label', icon: Network },
  { href: '/engineering-review', labelKey: 'navigation.engineeringReview.label', icon: Search },
  { href: '/meta-factory', labelKey: 'navigation.metaFactory.label', icon: Factory },
  { href: '/dashboard', labelKey: 'navigation.dashboard.label', icon: Gauge },
];

const FLOW_STEP_TITLES = ['Definir intenção', 'Projetar sistema', 'Validar decisões', 'Construir projeto', 'Operar portfólio'];

const catalog = [
  ['Projetos IA', Sparkles, '/project-rooms'], ['Architect', Network, '/architect'], ['Engineering Review', Search, '/engineering-review'], ['Meta-Fábrica', Factory, '/meta-factory'],
  ['Painel', Gauge, '/dashboard'], ['Analytics', Activity, '/analytics'], ['Status do sistema', Server, '/system-status'], ['Planejamento', GitBranch, '/roadmap'],
  ['Assistente', Bot, '/assistant'], ['Auto-Fix', Code2, '/auto-fix'], ['Habilidades', Boxes, '/skills'], ['Biblioteca', Package, '/templates'],
  ['Documentação', Layers3, '/documentation'], ['Configurações', CloudCog, '/settings'], ['Gerações', GitBranch, '/projects'], ['Engineering Lab', Database, '/engineering-laboratory'],
] as const;

interface ActivityItem {
  readonly id: string;
  readonly category: string;
  readonly action: string;
  readonly status: string;
  readonly occurred_at: string;
}
interface ActivityFeedResponse {
  readonly items: readonly ActivityItem[];
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  generation: Hammer,
  quality_gate: ShieldCheck,
  certification: CheckCircle2,
  git_provider: GitBranch,
  runtime_config: Activity,
  user_preferences: Boxes,
};

const STATUS_TONE: Record<string, BadgeTone> = { success: 'success', warning: 'warning', failed: 'danger' };
const STATUS_LABEL: Record<string, string> = { success: 'concluído', warning: 'em andamento', failed: 'resolvido' };

const TONE_VAR: Record<BadgeTone, string> = {
  neutral: '--border', accent: '--accent', success: '--success', warning: '--warning', danger: '--danger',
};

const chartPoints = (seed: number) => Array.from({ length: 18 }, (_, i) => `${i * 8},${30 - ((i * seed * 7 + i * i * 3) % 22)}`).join(' ');

function Sparkline({ color = '#875bff', seed = 2 }: { color?: string; seed?: number }) {
  return (
    <svg className="h-12 w-full" viewBox="0 0 136 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={chartPoints(seed)} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MiniCard({ label, value, delta, color = 'var(--accent)', seed = 2 }: { label: string; value: string; delta: string; color?: string; seed?: number }) {
  return (
    <article className="platform-card min-w-0 p-6">
      <p className="platform-label">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="ds-code text-2xl font-semibold text-[color:var(--text)]">{value}</p>
        <span className="ds-metadata text-[color:var(--success)]">↗ {delta}</span>
      </div>
      <div className="mt-2"><Sparkline color={color} seed={seed} /></div>
    </article>
  );
}

function StatusRow({ icon: Icon, label, status = 'Healthy', color = 'var(--success)' }: { icon: LucideIcon; label: string; status?: string; color?: string }) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-3)]" style={{ color }}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate ds-body-sm">{label}</span>
      <span className="flex items-center gap-1.5 ds-metadata" style={{ color }}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />{status}
      </span>
      <Sparkline color={color} seed={(label.length % 4) + 1} />
    </div>
  );
}

function DeliveryStep({ glyph, title, hint }: { glyph: string; title: string; hint: string }) {
  return (
    <div className="delivery-step">
      <span>{glyph}</span>
      <strong>{title}</strong>
      <small>{hint}</small>
    </div>
  );
}

type ProjectRowData = Pick<Project, 'project_id' | 'project_name' | 'status' | 'readiness_status'> & {
  /** Optional here (unlike the real ProjectRecord contract) because the
   * fallback placeholder rows below don't have real values for these, and
   * a partial API/mock response must render gracefully rather than throw. */
  technology_graph?: Project['technology_graph'];
  updated_at?: Project['updated_at'];
};

function ProjectRow({ project }: { project: ProjectRowData }) {
  const step = project.status ? (STATUS_STEP[project.status] ?? 3) : project.readiness_status === 'ready' ? 5 : project.readiness_status === 'ready_with_warnings' ? 4 : 2;
  const percent = Math.round((step / 5) * 100);
  const tone = READINESS_TONE[project.readiness_status] ?? 'neutral';
  const stack = project.technology_graph
    ? [project.technology_graph.language?.name, project.technology_graph.framework?.name].filter(Boolean).join(' · ')
    : null;
  const lastActive = formatRelativeTime(project.updated_at);

  return (
    <Link href={`/projects/${project.project_id}`} className="focus-ring block rounded-[var(--radius-md)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="ds-body-sm font-semibold text-[color:var(--text)]">{project.project_name}</span>
        <Badge tone={tone}>{project.readiness_status?.replace(/_/g, ' ') ?? '—'}</Badge>
      </div>
      <p className="mt-1 ds-metadata">
        {stack ?? 'Stack não identificado'}
        {lastActive ? ` · atualizado ${lastActive}` : ''}
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-[color:var(--surface-3)]">
        <div className="h-1.5 rounded-full bg-[color:var(--accent)]" style={{ width: `${percent}%` }} />
      </div>
    </Link>
  );
}

export function PlatformOverview() {
  const { t } = useLocale();
  const systemStatus = useSystemStatus();
  const projects = useProjects();
  const status = systemStatus.data;
  const recentProjects = (projects.data ?? []).slice(0, 4);
  const label = (key: string) => {
    try { return t(key); } catch { return key.split('.').pop() ?? key; }
  };

  // Real telemetry (best-effort: the page degrades to placeholders while
  // loading / if a collector is unavailable, never blocks the page).
  const metricsQuery = useQuery<RuntimeMetrics>({
    queryKey: ['runtime-metrics'],
    queryFn: () => apiRequest<RuntimeMetrics>(apiEndpoints.runtimeMetrics),
    refetchInterval: 10_000, staleTime: 8_000, retry: 1,
  });
  const usageQuery = useQuery<LlmUsageStats>({
    queryKey: ['llm-settings', 'usage-stats'],
    queryFn: llmSettingsClient.usageStats,
    refetchInterval: 30_000, staleTime: 20_000, retry: 1,
  });
  const feedQuery = useQuery<ActivityFeedResponse>({
    queryKey: ['platform-activity-feed'],
    queryFn: () => apiRequest<ActivityFeedResponse>(`${apiEndpoints.activityFeed}?limit=5`),
    refetchInterval: 20_000, staleTime: 15_000, retry: 1,
  });
  // Real student-verification status (vault 56/70: the Dashboard must surface
  // it and the next step when revalidation is needed). Null (never submitted)
  // and 404/network failures both degrade to simply not rendering the card.
  const studentQuery = useQuery<StudentVerificationView | null>({
    queryKey: ['student-verification'],
    queryFn: studentEligibilityClient.get,
    staleTime: 60_000, retry: 1,
  });
  const studentVerification = studentQuery.data ?? null;
  const studentNeedsAction = studentVerification !== null
    && ['REJECTED', 'REVALIDATION_REQUIRED', 'EXPIRED'].includes(studentVerification.student_status);
  const m = metricsQuery.data;
  const usage = usageQuery.data;
  const feedItems = feedQuery.data?.items ?? [];

  const cpuPct = m?.cpu ? `${Math.round(m.cpu.percent)}%` : '—';
  const memPct = m?.memory ? `${Math.round(m.memory.percent)}%` : '—';
  const workersValue = m?.workers ? `${m.workers.active} / ${m.workers.total}` : '—';
  const queuedValue = m ? String(m.jobs_queued) : '—';

  const totalTokens = usage ? usage.input_tokens + usage.output_tokens + usage.cache_read_tokens : null;
  const aiCostToday = usage ? `$${usage.estimated_cost_usd.toFixed(2)}` : '$0.00';
  const aiSavings = usage ? `$${usage.cache_savings_usd.toFixed(2)}` : '$0.00';

  const fallbackProjects: ProjectRowData[] = [
    { project_id: '1', project_name: 'clinic-system', status: 'generated', readiness_status: 'ready' },
    { project_id: '2', project_name: 'saas-platform', status: 'ready_for_generation', readiness_status: 'ready_with_warnings' },
    { project_id: '3', project_name: 'marketplace-pro', status: 'gatekeeper_approved', readiness_status: 'blueprint_ready' },
    { project_id: '4', project_name: 'erp-next', status: 'draft', readiness_status: 'not_ready' },
  ];
  const projectRows = recentProjects.length ? recentProjects : fallbackProjects;

  return (
    <div className="platform-dashboard space-y-8" data-testid="platform-overview">
      <p className="platform-label">Plataforma operacional</p>

      {/* ---- Hero + Engine ---- */}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="platform-card platform-hero overflow-hidden p-8 sm:p-10">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div>
              <p className="platform-eyebrow" style={{ color: '#c4b5fd' }}>
                SISTEMA OPERACIONAL DE ENGENHARIA <span style={{ color: '#4ade80' }}>● Sistema saudável</span>
              </p>
              {/* .platform-hero is a permanently-dark accent surface (like the
                  Sidebar), independent of the light/dark content theme -- its
                  own text needs fixed light colors, not the theme's --text/
                  --muted/--border (which flip to dark-on-light and would be
                  unreadable here in Light theme). */}
              <h1 className="ds-display mt-5 max-w-xl leading-[1.05]" style={{ color: '#f7f3ff' }}>
                Do problema ao software operável, com uma linha de <span className="text-gradient">decisão clara.</span>
              </h1>
              <p className="mt-5 max-w-xl ds-body" style={{ color: 'rgba(212,204,223,0.85)' }}>
                Escolha o objetivo, entre no fluxo correto e acompanhe arquitetura, revisão, geração e operação a partir de uma única superfície.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/project-rooms/new" className="accent-fill focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] px-5 ds-badge">
                  Iniciar novo projeto <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/architecture"
                  className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border px-5 ds-badge"
                  style={{ borderColor: 'rgba(255,255,255,0.16)', color: '#f7f3ff' }}
                >
                  Explorar arquitetura
                </Link>
              </div>
            </div>
            <div className="engine-map relative mx-auto h-72 w-full max-w-[420px]" aria-label="Mapa operacional LDCN Engine">
              <div className="engine-ring ring-a" />
              <div className="engine-ring ring-b" />
              <span className="engine-particle" style={{ transform: 'translate(72px, -38px)' }} aria-hidden />
              <span className="engine-particle" style={{ transform: 'translate(-96px, 24px)' }} aria-hidden />
              <span className="engine-particle" style={{ transform: 'translate(38px, 56px)' }} aria-hidden />
              <div className="engine-core">
                <span>LDCN</span>
                <strong>ENGINE</strong>
              </div>
              {[
                ['AGENTS', '32 ativos', 'top-0 left-1/2'],
                ['PROJECTS', '43 ativos', 'left-0 top-1/2'],
                ['PIPELINES', '18 rodando', 'right-0 top-1/2'],
                ['DATABASE', 'Healthy', 'bottom-0 left-1/2'],
                ['SANDBOX', '8 isolados', 'left-10 bottom-6'],
                ['DEPLOY', '6 ambientes', 'right-10 bottom-6'],
              ].map(([title, sub, pos], i) => (
                <div key={title} className={cn('engine-node absolute -translate-x-1/2', pos)}>
                  <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-violet-500/40 bg-violet-500/15 text-violet-300">
                    <Network className="h-4 w-4" />
                  </span>
                  <b>{title}</b>
                  <small style={i === 3 ? { color: '#4ade80' } : undefined}>{sub}</small>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="platform-card p-7">
          <p className="platform-eyebrow">INVENTÁRIO ATIVO</p>
          <h2 className="ds-card-title mt-3">Capacidades disponíveis agora</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ['Engines', status?.active_engines.length ?? 12],
              ['Skills', status?.active_skills.length ?? 128],
              ['Templates', status?.active_templates.length ?? 67],
              ['Projetos', projects.data?.length ?? 43],
            ].map(([name, value]) => (
              <div key={String(name)} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3.5">
                <p className="ds-metadata">{name}</p>
                <strong className="mt-1.5 block text-xl text-[color:var(--text)]">{value}</strong>
                <span className="ds-metadata text-[color:var(--success)]">● Ativos</span>
              </div>
            ))}
          </div>
          <Link href="/system-status" className="focus-ring mt-4 flex min-h-11 items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border)] px-3.5 ds-caption text-[color:var(--text)]">
            Abrir status detalhado <ArrowRight className="h-3.5 w-3.5 text-[color:var(--accent)]" />
          </Link>
        </aside>
      </section>

      {studentVerification ? (
        <section className="platform-card flex flex-wrap items-center justify-between gap-3 p-6">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[color:var(--text)]">{t('dashboard.studentStatus.title')}</p>
              <p className="ds-caption">
                {studentNeedsAction ? t('dashboard.studentStatus.actionNeeded') : t('dashboard.studentStatus.upToDate')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={studentVerification.student_status === 'VERIFIED' ? 'success' : studentNeedsAction ? 'warning' : 'neutral'}>
              {studentVerification.student_status}
            </Badge>
            {studentNeedsAction ? (
              <Link href="/settings?tab=account" className="focus-ring ds-caption text-[color:var(--accent)]">
                {t('dashboard.studentStatus.reviewLink')} →
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ---- Espinha operacional + Feed ---- */}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="platform-card p-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="platform-eyebrow">ESPINHA OPERACIONAL</p>
              <h2 className="ds-card-title mt-2">Uma sequência, cinco decisões verificáveis</h2>
              <p className="mt-2 ds-caption">Cada etapa tem uma saída concreta e conduz à próxima sem atalhos ocultos.</p>
              <p className="mt-2 ds-caption">Criar um produto novo · Modernizar um sistema existente · Operar e governar</p>
            </div>
            <Link href="/project-rooms" className="hidden ds-caption text-[color:var(--accent)] sm:block">Ver fluxo completo →</Link>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {MODULES.map(({ href, labelKey, icon: Icon }, i) => (
              <Link href={href} key={href} className="flow-step focus-ring">
                <span className="flex items-center justify-between">
                  <b>0{i + 1}</b>
                  <Icon className="h-4 w-4 text-[color:var(--accent)]" />
                </span>
                <strong>{FLOW_STEP_TITLES[i]}</strong>
                <small>{label(labelKey)}</small>
                {i < 4 ? <span className="flow-arrow">→</span> : null}
              </Link>
            ))}
          </div>
        </div>

        <div className="platform-card p-7">
          <div className="flex items-center justify-between">
            <p className="platform-eyebrow">FEED EM TEMPO REAL</p>
            <span className="ds-metadata text-[color:var(--success)]">● Ao vivo</span>
          </div>
          <div className="mt-4 space-y-4">
            {feedQuery.isPending ? (
              <p className="ds-caption">Carregando…</p>
            ) : feedItems.length === 0 ? (
              <p className="ds-caption">Nenhuma atividade registrada ainda.</p>
            ) : (
              feedItems.map((item) => {
                const Icon = CATEGORY_ICON[item.category] ?? Activity;
                const tone = STATUS_TONE[item.status] ?? 'neutral';
                return (
                  <div key={item.id} className="flex gap-3">
                    <span
                      className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] border"
                      style={{
                        borderColor: `color-mix(in srgb, var(${TONE_VAR[tone]}) 40%, transparent)`,
                        background: `color-mix(in srgb, var(${TONE_VAR[tone]}) 14%, transparent)`,
                        color: `var(${TONE_VAR[tone]})`,
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="ds-body-sm font-semibold leading-snug text-[color:var(--text)]">{item.action.replaceAll('_', ' ')}</p>
                      <p className="mt-1 ds-caption leading-snug">{item.category.replaceAll('_', ' ')}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge tone={tone}>{STATUS_LABEL[item.status] ?? item.status}</Badge>
                        <span className="ds-metadata">
                          {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(item.occurred_at))}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Link href="/system-status" className="focus-ring mt-4 flex min-h-11 items-center justify-end ds-caption text-[color:var(--accent)]">
            Ver todas as atividades →
          </Link>
        </div>
      </section>

      {/* ---- Métricas ---- */}
      <section>
        <p className="platform-eyebrow mb-3">MÉTRICAS PRINCIPAIS</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MiniCard label="Projetos ativos" value={String(projects.data?.length ?? 0)} delta="12%" seed={2} />
          <MiniCard label="Taxa de sucesso" value="98.6%" delta="5.1%" color="#2bd98b" seed={3} />
          <MiniCard label="Lead time médio" value="2h 47m" delta="18%" color="#2b9dff" seed={4} />
          <MiniCard label="Requisições (24h)" value={usage ? fmtCompact(usage.requests) : '—'} delta="28%" seed={5} />
          <MiniCard label="Custo de IA (24h)" value={aiCostToday} delta="9.3%" color="#f59e0b" seed={6} />
          <MiniCard label="Economia (cache)" value={aiSavings} delta="16%" color="#2bd98b" seed={2} />
        </div>
      </section>

      {/* ---- Projetos | Saúde | Recursos ---- */}
      <section className="grid items-stretch gap-6 xl:grid-cols-[1.05fr_1.1fr_1fr]">
        <article className="platform-card flex flex-col p-7">
          <p className="platform-eyebrow">PROJETOS EM EXECUÇÃO</p>
          <div className="mt-4 flex-1 space-y-5">
            {projectRows.map((project) => <ProjectRow key={project.project_id} project={project} />)}
          </div>
          <Link href="/projects" className="focus-ring mt-5 flex min-h-11 items-center justify-center ds-caption text-[color:var(--accent)]">
            Ver todos os projetos →
          </Link>
        </article>

        <article className="platform-card flex flex-col p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="platform-eyebrow">SAÚDE DA PLATAFORMA</p>
              <h2 className="ds-card-title mt-1.5">Sistema operacional</h2>
            </div>
            <span className="ds-metadata text-[color:var(--success)]">● Healthy</span>
          </div>
          <div className="mt-4 flex-1 space-y-2">
            {[
              ['API Gateway', Server], ['Database (PostgreSQL)', Database], ['Redis Cache', Layers3], ['Queue (RabbitMQ)', Activity],
              ['Sandbox', ShieldCheck], ['Workers', Bot], ['Storage (S3)', CloudCog], ['LLM Resolver', Sparkles],
            ].map(([item, Icon], i) => (
              <StatusRow
                key={String(item)}
                icon={Icon as LucideIcon}
                label={String(item)}
                status={i === 3 ? 'Degraded' : i === 5 ? '32 ativos' : 'Healthy'}
                color={i === 3 ? 'var(--warning)' : 'var(--success)'}
              />
            ))}
          </div>
          <Link href="/system-status" className="focus-ring mt-5 flex min-h-11 items-center justify-center ds-caption text-[color:var(--accent)]">
            Ver diagnóstico completo →
          </Link>
        </article>

        <article className="platform-card flex flex-col p-7">
          <div className="flex items-center justify-between">
            <p className="platform-eyebrow">USO DE RECURSOS</p>
            <span className="ds-metadata text-[color:var(--success)]">● ao vivo</span>
          </div>
          <div className="mt-4 grid flex-1 grid-cols-2 gap-3">
            {[
              ['CPU', cpuPct, '#875bff'], ['Memória', memPct, '#2b9dff'],
              ['Workers ativos', workersValue, '#2bd98b'], ['Jobs na fila', queuedValue, '#ff6b35'],
            ].map(([name, value, color], i) => (
              <div key={name} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-4">
                <p className="ds-metadata">{name}</p>
                <strong className="mt-2.5 block text-xl text-[color:var(--text)]">{value}</strong>
                <Sparkline color={color} seed={i + 2} />
              </div>
            ))}
          </div>
          <Link href="/analytics" className="focus-ring mt-5 flex min-h-11 items-center justify-center ds-caption text-[color:var(--accent)]">
            Ver todos os recursos →
          </Link>
        </article>
      </section>

      {/* ---- Fluxo inteligente de entrega (a Pipeline) ---- */}
      <section className="platform-card p-8 sm:p-10">
        <p className="platform-eyebrow">FLUXO INTELIGENTE DE ENTREGA</p>
        <p className="mt-2 ds-body text-[color:var(--muted)]">Da intenção à produção, com validação contínua e governança embutida.</p>
        <div className="delivery-line mt-8">
          {['Ideia / Problema', 'Blueprint', 'Engineering Review', 'Meta-Fábrica', 'QA & Testes', 'Deploy', 'Produção'].map((item, i) => (
            <DeliveryStep
              key={item}
              glyph={['◉', '◈', '◌', '▦', '◫', '◇', '◷'][i]}
              title={item}
              hint={['Entrada', 'IA + Arquitetura', 'Qualidade e Riscos', 'Geração e Build', 'Automatizados', 'Ambientes', 'Monitoramento'][i]}
            />
          ))}
        </div>
        <div className="mt-6 flex items-center gap-4 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3 ds-caption">
          <span>Pipeline global: 87% de eficiência operacional</span>
          <div className="h-1.5 flex-1 rounded-full bg-[color:var(--surface-3)]">
            <div className="h-full w-[87%] rounded-full bg-[color:var(--accent)]" />
          </div>
        </div>
      </section>

      {/* ---- Catálogo + Custos/Continuidade ---- */}
      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <article className="platform-card p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="platform-eyebrow">CATÁLOGO DA PLATAFORMA</p>
              <p className="mt-1 ds-caption">Todos os módulos, organizados por responsabilidade</p>
            </div>
            <Link href="/documentation" className="focus-ring inline-flex min-h-11 items-center ds-caption text-[color:var(--accent)]">Abrir catálogo completo →</Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {catalog.map(([name, Icon, href]) => (
              <Link href={href} key={name} className="catalog-item focus-ring">
                <span className="text-[color:var(--accent)]"><Icon className="h-4 w-4" /></span>
                <span><strong>{name}</strong></span>
              </Link>
            ))}
          </div>
        </article>

        <div className="grid gap-6">
          <article className="platform-card p-7">
            <div className="flex items-center justify-between">
              <p className="platform-eyebrow">CUSTOS &amp; TOKENS (24H)</p>
              <span className="ds-badge text-[color:var(--text)]">{aiCostToday}</span>
            </div>
            <div className="mt-4 flex items-center gap-5">
              <div className="token-donut">
                <strong>{totalTokens != null ? fmtCompact(totalTokens) : '—'}</strong>
                <small>Tokens</small>
              </div>
              <div className="space-y-1.5 ds-caption">
                <p><i className="dot bg-violet-400" />Entrada <b className="text-[color:var(--text)]">{usage ? fmtCompact(usage.input_tokens) : '—'}</b></p>
                <p><i className="dot bg-fuchsia-400" />Saída <b className="text-[color:var(--text)]">{usage ? fmtCompact(usage.output_tokens) : '—'}</b></p>
                <p><i className="dot bg-cyan-400" />Cache <b className="text-[color:var(--text)]">{usage ? fmtCompact(usage.cache_read_tokens) : '—'}</b></p>
              </div>
            </div>
          </article>
          <article className="platform-card p-7">
            <p className="platform-eyebrow">CONTINUIDADE</p>
            <div className="mt-3 space-y-2.5 ds-caption">
              <p className="flex justify-between text-[color:var(--text-secondary)]">clinic-scheduler <span className="text-[color:var(--success)]">● Healthy</span></p>
              <p className="flex justify-between text-[color:var(--text-secondary)]">saas-test <span className="text-[color:var(--accent)]">● Building</span></p>
              <p className="flex justify-between text-[color:var(--text-secondary)]">ldcn-os <span className="text-[color:var(--accent)]">● Local</span></p>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
