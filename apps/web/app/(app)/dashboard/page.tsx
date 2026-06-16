'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FolderKanban, Send, Users } from 'lucide-react';

import { ActionLink } from '@/components/ui/action-link';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { SectionHeader } from '@/components/shell/section-header';
import { AnimatedCounter } from '@/components/motion/animated-counter';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { ComplexityRadar, ReadinessRing } from '@/components/visual/engineering-surface';
import { useHealth } from '@/hooks/use-health';
import { useProjects } from '@/hooks/use-projects';
import { useLocale } from '@/hooks/use-locale';
import { getApiErrorMessage } from '@/lib/api/errors';

type MetricTone = 'accent' | 'success' | 'warning';

const TONE_COLOR: Record<MetricTone, string> = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
};

function readinessTone(status: string): BadgeTone {
  if (status === 'ready' || status === 'generated') return 'success';
  if (status === 'ready_with_warnings') return 'warning';
  if (status === 'blocked') return 'danger';
  return 'accent';
}

export default function DashboardPage() {
  const { t } = useLocale();
  const healthQuery = useHealth();
  const projectsQuery = useProjects();
  const projects = projectsQuery.data ?? [];

  const metrics = useMemo(() => {
    const ready = projects.filter((project) => ['ready', 'ready_with_warnings', 'generated'].includes(project.readiness_status)).length;
    const risks = projects.filter((project) => project.readiness_status === 'blocked' || project.status === 'generation_blocked').length;
    const generated = projects.filter((project) => project.status === 'generated').length;
    const complexity = projects.length ? Math.min(100, 28 + projects.length * 9 + risks * 12) : 18;
    return { ready, risks, generated, complexity, team: Math.max(2, Math.ceil(complexity / 18)), weeks: Math.max(2, Math.ceil(complexity / 12)) };
  }, [projects]);

  const loading = healthQuery.isLoading || projectsQuery.isLoading;
  const error = healthQuery.error ?? projectsQuery.error;
  const readinessPct = projects.length ? Math.round((metrics.ready / projects.length) * 100) : 0;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <SectionHeader title={t('dashboard.title')} description={t('dashboard.description')} />
        <ActionLink href="/wizard" variant="primary">{t('dashboard.newProject')}</ActionLink>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><CardLoading /><CardLoading /><CardLoading /><CardLoading /></div>
      ) : error ? (
        <PageError title={t('dashboard.error.title')} description={getApiErrorMessage(error, t('dashboard.error.description'))} onRetry={() => { void healthQuery.refetch(); void projectsQuery.refetch(); }} />
      ) : (
        <>
          <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('dashboard.metrics')}>
            <ExecutiveMetric icon={FolderKanban} label={t('dashboard.activeProjects')} value={projects.length} detail={t('dashboard.activeProjects.detail')} />
            <ExecutiveMetric icon={CheckCircle2} label={t('dashboard.readyProjects')} value={metrics.ready} detail={t('dashboard.readyProjects.detail')} tone="success" />
            <ExecutiveMetric icon={AlertTriangle} label={t('dashboard.risks')} value={metrics.risks} detail={t('dashboard.risks.detail')} tone={metrics.risks ? 'warning' : 'success'} />
            <ExecutiveMetric icon={Send} label={t('dashboard.exports')} value={metrics.generated} detail={t('dashboard.exports.detail')} />
          </Stagger>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="relative overflow-hidden p-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_38%)]" />
              <div className="relative space-y-6">
                <div><p className="type-label text-[color:var(--muted)]">{t('dashboard.portfolio.eyebrow')}</p><h2 className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{t('dashboard.portfolio.title')}</h2><p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('dashboard.portfolio.description')}</p></div>
                <Stagger className="grid gap-3 sm:grid-cols-3">
                  <CompactMetric icon={Users} label={t('dashboard.team')} value={`${metrics.team}`} />
                  <CompactMetric icon={Clock3} label={t('dashboard.time')} value={`${metrics.weeks} ${t('dashboard.weeks')}`} />
                  <CompactMetric icon={CheckCircle2} label={t('dashboard.readiness')} value={`${readinessPct}%`} />
                </Stagger>
                <Stagger className="space-y-3">
                  {projects.slice(0, 4).map((project) => (
                    <StaggerItem key={project.project_id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-[color-mix(in_srgb,var(--accent)_32%,var(--border))] hover:bg-white/[0.06]">
                      <div><p className="text-sm font-semibold text-[color:var(--text)]">{project.project_name}</p><p className="mt-1 text-xs text-[color:var(--muted)]">{project.technology_graph.framework.name} · {project.technology_graph.architecture.name}</p></div>
                      <Badge tone={readinessTone(project.readiness_status)}>{project.readiness_status.replaceAll('_', ' ')}</Badge>
                    </StaggerItem>
                  ))}
                  {!projects.length ? <p className="text-sm text-[color:var(--muted)]">{t('dashboard.empty')}</p> : null}
                </Stagger>
              </div>
            </Card>

            <div className="grid gap-5">
              <ReadinessRing title={t('dashboard.readiness')} value={readinessPct} label={metrics.risks ? t('dashboard.attention') : t('dashboard.healthy')} caption={t('dashboard.readiness.detail')} tone={metrics.risks ? 'warning' : 'success'} />
              <ComplexityRadar title={t('dashboard.complexity')} score={metrics.complexity} axes={[
                { label: t('dashboard.axis.scope'), value: metrics.complexity },
                { label: t('dashboard.axis.risk'), value: Math.min(100, metrics.risks * 28 + 12) },
                { label: t('dashboard.axis.team'), value: metrics.team * 14 },
                { label: t('dashboard.axis.time'), value: metrics.weeks * 10 },
              ]} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ExecutiveMetric({ icon: Icon, label, value, detail, tone = 'accent' }: { readonly icon: typeof FolderKanban; readonly label: string; readonly value: number; readonly detail: string; readonly tone?: MetricTone }) {
  return (
    <StaggerItem className="h-full">
      <Card interactive className="h-full p-5">
        <div className="flex items-center justify-between gap-3">
          <Icon className="h-5 w-5" style={{ color: TONE_COLOR[tone] }} />
          <span className="h-2 w-2 rounded-full" style={{ background: TONE_COLOR[tone], boxShadow: '0 0 12px var(--glow)' }} />
        </div>
        <AnimatedCounter value={value} className="mt-6 block text-4xl font-semibold text-[color:var(--text)]" />
        <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{detail}</p>
      </Card>
    </StaggerItem>
  );
}

function CompactMetric({ icon: Icon, label, value }: { readonly icon: typeof Users; readonly label: string; readonly value: string }) {
  return (
    <StaggerItem className="rounded-[var(--radius-xl)] border border-white/10 bg-black/15 p-4">
      <Icon className="h-4 w-4 text-[color:var(--accent)]" />
      <p className="mt-3 text-xs text-[color:var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[color:var(--text)]">{value}</p>
    </StaggerItem>
  );
}
