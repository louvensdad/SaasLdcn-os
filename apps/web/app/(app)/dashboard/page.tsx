'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderKanban, Send } from 'lucide-react';

import { ActionLink } from '@/components/ui/action-link';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { AnimatedCounter } from '@/components/motion/animated-counter';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { ComplexityRadar } from '@/components/visual/engineering-surface';
import { useHealth } from '@/hooks/use-health';
import { useProjects } from '@/hooks/use-projects';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';
import { getApiErrorMessage } from '@/lib/api/errors';
import type { Project } from '@/lib/api/types';

type MetricTone = 'accent' | 'success' | 'warning';
type StageState = 'done' | 'active' | 'idle';

const TONE_COLOR: Record<MetricTone, string> = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
};

const STAGE_KEYS = ['idea', 'spec', 'contract', 'build', 'verify', 'ship'] as const;

function readinessTone(status: string): BadgeTone {
  if (status === 'ready' || status === 'generated') return 'success';
  if (status === 'ready_with_warnings') return 'warning';
  if (status === 'blocked') return 'danger';
  return 'accent';
}

// Cumulative count of matching projects across the portfolio — a real, monotonic
// series for the card sparkline (no fabricated trend data).
function cumulativeSeries(projects: Project[], predicate: (p: Project) => boolean): number[] {
  let running = 0;
  const series = projects.map((p) => (running += predicate(p) ? 1 : 0));
  return series.length ? series : [0];
}

export default function DashboardPage() {
  const { t } = useLocale();
  const healthQuery = useHealth();
  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];
  const healthOk = healthQuery.data?.status === 'ok';

  const metrics = useMemo(() => {
    const ready = projects.filter((p) => ['ready', 'ready_with_warnings', 'generated'].includes(p.readiness_status)).length;
    const risks = projects.filter((p) => p.readiness_status === 'blocked' || p.status === 'generation_blocked').length;
    const generated = projects.filter((p) => p.status === 'generated').length;
    const complexity = projects.length ? Math.min(100, 28 + projects.length * 9 + risks * 12) : 18;
    return { ready, risks, generated, complexity };
  }, [projects]);

  const reached = useMemo(() => {
    const milestones = [healthOk, projects.length > 0, projects.length > 0, metrics.generated > 0, metrics.ready > 0, metrics.generated > 0];
    let count = 0;
    for (const done of milestones) { if (!done) break; count += 1; }
    return count;
  }, [healthOk, metrics.generated, metrics.ready, projects.length]);

  const loading = healthQuery.isLoading || projectsQuery.isLoading;
  const error = healthQuery.error ?? projectsQuery.error;
  const readinessPct = projects.length ? Math.round((metrics.ready / projects.length) * 100) : 0;

  return (
    <div className="space-y-6 pb-12">
      <ScrollProgress />

      {/* Hero header */}
      <header className="glass noise relative flex flex-wrap items-center justify-between gap-5 overflow-hidden p-6">
        <div className="pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_70%)] blur-2xl" />
        <div className="relative min-w-0">
          <p className="t-overline">{t('dashboard.title')}</p>
          <h1 className="mt-2 t-h1 text-[color:var(--text)]">{t('dashboard.description')}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={healthOk ? 'success' : 'danger'}>
              <span className="live-dot mr-1.5" style={healthOk ? undefined : { background: 'var(--danger)' }} aria-hidden />
              {healthOk ? t('dashboard.line.live') : t('dashboard.line.offline')}
            </Badge>
            <Badge>{t('dashboard.activeProjects')}: {projects.length}</Badge>
            <Badge tone={metrics.risks ? 'warning' : 'success'}>{t('dashboard.risks')}: {metrics.risks}</Badge>
          </div>
        </div>
        <ActionLink href="/wizard" variant="primary">{t('dashboard.newProject')}</ActionLink>
      </header>

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><CardLoading /><CardLoading /><CardLoading /><CardLoading /></div>
          <CardLoading className="h-72" />
        </div>
      ) : error ? (
        <PageError title={t('dashboard.error.title')} description={getApiErrorMessage(error, t('dashboard.error.description'))} onRetry={() => { void healthQuery.refetch(); void projectsQuery.refetch(); }} />
      ) : (
        <>
          {/* KPI row */}
          <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('dashboard.metrics')}>
            <KpiCard icon={FolderKanban} label={t('dashboard.activeProjects')} value={projects.length} detail={t('dashboard.activeProjects.detail')} series={cumulativeSeries(projects, () => true)} />
            <KpiCard icon={CheckCircle2} label={t('dashboard.readyProjects')} value={metrics.ready} detail={t('dashboard.readyProjects.detail')} tone="success" series={cumulativeSeries(projects, (p) => ['ready', 'ready_with_warnings', 'generated'].includes(p.readiness_status))} />
            <KpiCard icon={AlertTriangle} label={t('dashboard.risks')} value={metrics.risks} detail={t('dashboard.risks.detail')} tone={metrics.risks ? 'warning' : 'success'} series={cumulativeSeries(projects, (p) => p.readiness_status === 'blocked' || p.status === 'generation_blocked')} />
            <KpiCard icon={Send} label={t('dashboard.exports')} value={metrics.generated} detail={t('dashboard.exports.detail')} series={cumulativeSeries(projects, (p) => p.status === 'generated')} />
          </Stagger>

          {/* Main: gauge + load */}
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="glass noise relative flex flex-col items-center justify-center gap-4 overflow-hidden p-7">
              <p className="t-overline self-start">{t('dashboard.readiness')}</p>
              <RuntimeGauge value={readinessPct} />
              <p className="t-caption text-center">{t('dashboard.readiness.detail')}</p>
              <Badge tone={metrics.risks ? 'warning' : 'success'}>{metrics.risks ? t('dashboard.attention') : t('dashboard.healthy')}</Badge>
            </div>

            <div className="glass noise relative overflow-hidden p-6">
              <p className="t-overline">{t('dashboard.line.eyebrow')}</p>
              <h2 className="mt-2 t-h2 text-[color:var(--text)]">{t('dashboard.line.title')}</h2>
              <p className="mt-2 t-caption max-w-lg">{t('dashboard.line.caption')}</p>
              <PipelineRail reached={reached} t={t} />
            </div>
          </div>

          {/* Portfolio + complexity */}
          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="glass relative overflow-hidden p-6">
              <p className="t-overline">{t('dashboard.portfolio.eyebrow')}</p>
              <h2 className="mt-2 t-h2 text-[color:var(--text)]">{t('dashboard.portfolio.title')}</h2>
              <Stagger className="mt-4 space-y-2.5">
                {projects.slice(0, 5).map((project) => (
                  <StaggerItem key={project.project_id} className="lift flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_60%,transparent)] px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="live-dot" style={{ background: TONE_COLOR[readinessTone(project.readiness_status) === 'danger' ? 'warning' : 'success'] }} aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[color:var(--text)]">{project.project_name}</p>
                        <p className="mt-0.5 t-mono text-xs text-[color:var(--muted-2)]">{project.technology_graph.framework.name} · {project.technology_graph.architecture.name}</p>
                      </div>
                    </div>
                    <Badge tone={readinessTone(project.readiness_status)}>{project.readiness_status.replaceAll('_', ' ')}</Badge>
                  </StaggerItem>
                ))}
                {!projects.length ? <p className="t-caption">{t('dashboard.empty')}</p> : null}
              </Stagger>
            </div>

            <div className="glass noise relative overflow-hidden p-6">
              <ComplexityRadar title={t('dashboard.complexity')} score={metrics.complexity} axes={[
                { label: t('dashboard.axis.scope'), value: metrics.complexity },
                { label: t('dashboard.axis.risk'), value: Math.min(100, metrics.risks * 28 + 12) },
                { label: t('dashboard.axis.team'), value: Math.min(100, 30 + projects.length * 4) },
                { label: t('dashboard.axis.time'), value: Math.min(100, 24 + projects.length * 5) },
              ]} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div className="scroll-progress" style={{ ['--progress' as string]: progress }} aria-hidden />;
}

function RuntimeGauge({ value }: { readonly value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="relative grid h-44 w-44 place-items-center">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" stroke="color-mix(in srgb, var(--border-strong) 90%, transparent)" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke="url(#gaugeGrad)" strokeWidth="8" strokeLinecap="round"
          className="ring-draw"
          style={{ strokeDasharray: c, strokeDashoffset: offset, ['--dash' as string]: c, ['--dash-offset' as string]: offset }}
        />
      </svg>
      <div className="absolute grid place-items-center text-center">
        <AnimatedCounter value={value} className="t-mono text-4xl font-bold text-[color:var(--text)]" />
        <span className="t-overline mt-1">%</span>
      </div>
    </div>
  );
}

function PipelineRail({ reached, t }: { readonly reached: number; readonly t: (k: string) => string }) {
  const stages = STAGE_KEYS.map((key, i): { key: string; state: StageState } => ({
    key,
    state: i < reached ? 'done' : i === reached ? 'active' : 'idle',
  }));
  return (
    <ol className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
      {stages.map((stage, i) => (
        <Fragment key={stage.key}>
          <li className="flex-1">
            <div className={cn(
              'rounded-[var(--radius-lg)] border p-3 transition',
              stage.state === 'idle'
                ? 'border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)]'
                : 'border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]',
            )}>
              <div className="flex items-center justify-between">
                <span className={cn('live-dot', stage.state === 'idle' && 'opacity-40')} style={{ background: stage.state === 'idle' ? 'var(--muted-2)' : 'var(--accent)' }} aria-hidden />
                <span className="t-mono text-[0.625rem] text-[color:var(--muted-2)]">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <p className="mt-2 t-mono text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text)]">{t(`dashboard.stage.${stage.key}`)}</p>
            </div>
          </li>
          {i < stages.length - 1 ? (
            <li aria-hidden className="hidden self-center md:block md:w-6 lg:w-10">
              <span className="flow-line block h-0.5 rounded-full" data-active={stage.state === 'done'} />
            </li>
          ) : null}
        </Fragment>
      ))}
    </ol>
  );
}

function Sparkline({ series, color }: { readonly series: number[]; readonly color: string }) {
  const max = Math.max(1, ...series);
  const pts = series.length > 1 ? series : [0, ...series];
  const step = 100 / (pts.length - 1 || 1);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${(28 - (v / max) * 24).toFixed(2)}`).join(' ');
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="sparkline h-7 w-full" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

function KpiCard({ icon: Icon, label, value, detail, tone = 'accent', series }: { readonly icon: typeof FolderKanban; readonly label: string; readonly value: number; readonly detail: string; readonly tone?: MetricTone; readonly series: number[] }) {
  return (
    <StaggerItem className="h-full">
      <div className="glass lift noise relative h-full overflow-hidden p-5">
        <div className="flex items-center justify-between gap-3">
          <Icon className="h-5 w-5" style={{ color: TONE_COLOR[tone] }} />
          <span className="live-dot" style={{ background: TONE_COLOR[tone] }} aria-hidden />
        </div>
        <AnimatedCounter value={value} className="mt-5 block t-mono text-4xl font-bold text-[color:var(--text)]" />
        <p className="mt-1.5 text-sm font-semibold text-[color:var(--text)]">{label}</p>
        <p className="mt-1 t-caption">{detail}</p>
        <div className="mt-3 -mx-1 opacity-70">
          <Sparkline series={series} color={TONE_COLOR[tone]} />
        </div>
      </div>
    </StaggerItem>
  );
}
