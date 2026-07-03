'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  CircleDashed,
  Factory,
  Gauge,
  RefreshCw,
  Rocket,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { useProjects } from '@/hooks/use-projects';
import { useSystemStatus } from '@/hooks/use-system-status';
import { cn } from '@/lib/cn';
import { NAVIGATION_ITEMS } from '@/lib/navigation';

interface PlatformModule {
  readonly href: string;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly icon: LucideIcon;
}

const META_FACTORY: PlatformModule = {
  href: '/meta-factory',
  labelKey: 'platform.node.metaFactory',
  descriptionKey: 'platform.node.metaFactory.desc',
  icon: Factory,
};

const NAVIGATION_BY_HREF = new Map(NAVIGATION_ITEMS.map((item) => [item.href, item] as const));

function moduleFor(href: string): PlatformModule {
  if (href === META_FACTORY.href) return META_FACTORY;
  const item = NAVIGATION_BY_HREF.get(href);
  if (!item) throw new Error(`Unknown platform route: ${href}`);
  return { href: item.href, labelKey: item.labelKey, descriptionKey: item.descriptionKey, icon: item.icon };
}

const FLOW = [
  { href: '/project-rooms', key: 'intake' },
  { href: '/architect', key: 'architecture' },
  { href: '/engineering-review', key: 'review' },
  { href: '/meta-factory', key: 'generation' },
  { href: '/dashboard', key: 'operation' },
] as const;

const JOURNEYS = [
  { key: 'newProduct', routes: ['/project-rooms', '/architect', '/engineering-review', '/meta-factory'] },
  { key: 'modernize', routes: ['/modernize', '/engineering-laboratory', '/auto-fix', '/architecture'] },
  { key: 'govern', routes: ['/dashboard', '/analytics', '/system-status', '/roadmap'] },
  { key: 'knowledge', routes: ['/projects', '/templates', '/skills', '/documentation'] },
] as const;

const MODULE_GROUPS = [
  { key: 'create', routes: ['/project-rooms', '/wizard', '/architect', '/engineering-review', '/meta-factory', '/projects'] },
  { key: 'improve', routes: ['/modernize', '/engineering-laboratory', '/auto-fix', '/architecture'] },
  { key: 'operate', routes: ['/dashboard', '/analytics', '/system-status', '/roadmap'] },
  { key: 'knowledge', routes: ['/templates', '/skills', '/documentation', '/settings'] },
] as const;

function SignalDot({ status }: { readonly status: 'healthy' | 'warning' | 'blocked' }) {
  return (
    <span
      className={cn(
        'h-2 w-2 shrink-0 rounded-full',
        status === 'healthy' && 'bg-[color:var(--success)]',
        status === 'warning' && 'bg-[color:var(--warning)]',
        status === 'blocked' && 'bg-[color:var(--danger)]',
      )}
      aria-hidden
    />
  );
}

function PlatformFlow() {
  const { t } = useLocale();
  return (
    <section aria-labelledby="platform-flow-title">
      <div className="mb-4 max-w-2xl">
        <p className="type-data text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]">{t('platform.overview.flow.eyebrow')}</p>
        <h2 id="platform-flow-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[color:var(--text)]">{t('platform.overview.flow.title')}</h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('platform.overview.flow.description')}</p>
      </div>
      <ol className="grid gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--border)] md:grid-cols-5">
        {FLOW.map((stage, index) => {
          const item = moduleFor(stage.href);
          const Icon = item.icon;
          return (
            <li key={stage.key} className="bg-[color:var(--surface)]">
              <Link href={stage.href} className="focus-ring group flex min-h-32 flex-col justify-between gap-5 p-4 transition-colors hover:bg-[color:var(--surface-2)]">
                <span className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-[color:var(--accent)]">{String(index + 1).padStart(2, '0')}</span>
                  <Icon className="h-4 w-4 text-[color:var(--muted)] group-hover:text-[color:var(--accent)]" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[color:var(--text)]">{t(`platform.overview.flow.${stage.key}`)}</span>
                  <span className="mt-1 block text-xs leading-5 text-[color:var(--muted)]">{t(item.labelKey)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function JourneyCard({ journey }: { readonly journey: (typeof JOURNEYS)[number] }) {
  const { t } = useLocale();
  return (
    <article className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <div className="border-b border-[color:var(--border)] pb-4">
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[color:var(--text)]">{t(`platform.overview.journey.${journey.key}.title`)}</h3>
        <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t(`platform.overview.journey.${journey.key}.description`)}</p>
      </div>
      <ol className="mt-3">
        {journey.routes.map((href, index) => {
          const item = moduleFor(href);
          const Icon = item.icon;
          return (
            <li key={href}>
              <Link href={href} className="focus-ring group flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 hover:bg-[color:var(--surface-2)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-3)]">
                  <Icon className="h-4 w-4 text-[color:var(--accent)]" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[color:var(--text)]">{t(item.labelKey)}</span>
                  <span className="mt-0.5 block truncate text-xs text-[color:var(--muted)]">{t(item.descriptionKey)}</span>
                </span>
                <span className="font-mono text-xs text-[color:var(--muted)]">{String(index + 1).padStart(2, '0')}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function ModuleCatalog() {
  const { t } = useLocale();
  return (
    <section aria-labelledby="platform-catalog-title">
      <div className="mb-4">
        <p className="type-data text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]">{t('platform.overview.catalog.eyebrow')}</p>
        <h2 id="platform-catalog-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[color:var(--text)]">{t('platform.overview.catalog.title')}</h2>
        <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('platform.overview.catalog.description')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {MODULE_GROUPS.map((group) => (
          <article key={group.key} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-3">
              <Boxes className="h-4 w-4 text-[color:var(--accent)]" />
              <h3 className="text-sm font-semibold text-[color:var(--text)]">{t(`platform.overview.group.${group.key}`)}</h3>
              <span className="ml-auto font-mono text-xs text-[color:var(--muted)]">{group.routes.length}</span>
            </div>
            <div className="mt-2">
              {group.routes.map((href) => {
                const item = moduleFor(href);
                const Icon = item.icon;
                return (
                  <Link key={href} href={href} className="focus-ring group flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] px-2 hover:bg-[color:var(--surface-2)]">
                    <Icon className="h-4 w-4 shrink-0 text-[color:var(--muted)] group-hover:text-[color:var(--accent)]" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--text)]">{t(item.labelKey)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[color:var(--muted)]" />
                  </Link>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PlatformOverview() {
  const { locale, t } = useLocale();
  const systemStatus = useSystemStatus();
  const projects = useProjects();
  const status = systemStatus.data;
  const recentProjects = (projects.data ?? []).slice(0, 3);
  const healthSignals = status ? [status.backend_status, status.frontend_status, status.api_status, status.build_status] : [];
  const healthySignals = healthSignals.filter((signal) => signal.status === 'healthy').length;
  const platformState = systemStatus.isError ? 'unavailable' : systemStatus.isLoading ? 'checking' : healthySignals === healthSignals.length ? 'healthy' : 'degraded';

  return (
    <div className="space-y-10" data-testid="platform-overview">
      <header className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-2)]">
        <div className="grid xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="p-6 sm:p-8 xl:p-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="type-data inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[color:var(--accent)]">
                <Rocket className="h-3.5 w-3.5" /> {t('platform.overview.eyebrow')}
              </span>
              <span className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-2 py-1 text-xs text-[color:var(--muted)]" aria-live="polite">
                {platformState === 'checking' ? <CircleDashed className="h-3 w-3 animate-spin" /> : <span className={cn('h-1.5 w-1.5 rounded-full', platformState === 'healthy' ? 'bg-[color:var(--success)]' : platformState === 'degraded' ? 'bg-[color:var(--warning)]' : 'bg-[color:var(--danger)]')} />}
                {t(`platform.overview.status.${platformState}`)}
              </span>
            </div>
            <h1 className="mt-5 max-w-4xl font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.04em] text-[color:var(--text)] sm:text-5xl">{t('platform.overview.title')}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[color:var(--muted)]">{t('platform.overview.description')}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/project-rooms/new" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-[color:var(--accent)] px-5 text-sm font-semibold text-[color:var(--control-selected-text)]">
                {t('platform.overview.primaryAction')} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/architecture" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-3)] px-5 text-sm font-semibold text-[color:var(--text)] hover:border-[color:var(--border-strong)]">
                {t('platform.overview.secondaryAction')}
              </Link>
            </div>
          </div>
          <div className="border-t border-[color:var(--border)] bg-[color:var(--surface)] p-6 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="type-data text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('platform.overview.inventory')}</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--text)]">{t('platform.overview.inventoryDetail')}</p>
              </div>
              <Gauge className="h-5 w-5 text-[color:var(--accent)]" />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--border)]">
              {[
                [t('platform.overview.metric.engines'), status?.active_engines.length ?? '—'],
                [t('platform.overview.metric.skills'), status?.active_skills.length ?? '—'],
                [t('platform.overview.metric.templates'), status?.active_templates.length ?? '—'],
                [t('platform.overview.metric.projects'), projects.data?.length ?? '—'],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-[color:var(--surface-2)] p-4">
                  <dt className="text-xs text-[color:var(--muted)]">{label}</dt>
                  <dd className="mt-2 font-mono text-2xl font-semibold text-[color:var(--text)]">{value}</dd>
                </div>
              ))}
            </dl>
            <Link href="/system-status" className="focus-ring mt-4 inline-flex min-h-11 w-full items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]">
              {t('platform.overview.openStatus')} <ArrowRight className="h-4 w-4 text-[color:var(--accent)]" />
            </Link>
          </div>
        </div>
      </header>

      <PlatformFlow />

      <section aria-labelledby="platform-journeys-title">
        <div className="mb-4 max-w-2xl">
          <p className="type-data text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]">{t('platform.overview.journeys.eyebrow')}</p>
          <h2 id="platform-journeys-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[color:var(--text)]">{t('platform.overview.journeys.title')}</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('platform.overview.journeys.description')}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {JOURNEYS.map((journey) => <JourneyCard key={journey.key} journey={journey} />)}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <ModuleCatalog />
        <aside className="space-y-4" aria-labelledby="platform-health-title">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border)] pb-4">
              <div>
                <p className="type-data text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]">{t('platform.overview.health.eyebrow')}</p>
                <h2 id="platform-health-title" className="mt-2 text-lg font-semibold text-[color:var(--text)]">{t('platform.overview.health.title')}</h2>
              </div>
              <ShieldCheck className="h-5 w-5 text-[color:var(--accent)]" />
            </div>
            {systemStatus.isError ? (
              <div className="py-5">
                <p className="text-sm leading-6 text-[color:var(--danger)]">{t('platform.overview.health.error')}</p>
                <Button variant="secondary" className="mt-3" onClick={() => void systemStatus.refetch()} loading={systemStatus.isFetching}>
                  <RefreshCw className="h-4 w-4" /> {t('platform.overview.retry')}
                </Button>
              </div>
            ) : (
              <div className="mt-3 space-y-1">
                {healthSignals.map((signal) => (
                  <div key={signal.id} className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] px-2">
                    <SignalDot status={signal.status} />
                    <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--text)]">{signal.label}</span>
                    <span className="text-xs text-[color:var(--muted)]">{t(`platform.overview.signal.${signal.status}`)}</span>
                  </div>
                ))}
                {systemStatus.isLoading ? <p className="py-5 text-sm text-[color:var(--muted)]">{t('platform.overview.status.checking')}</p> : null}
              </div>
            )}
            {status ? (
              <div className="mt-4 border-t border-[color:var(--border)] pt-4 text-xs leading-5 text-[color:var(--muted)]">
                <p>{t('platform.overview.health.lastValidation')}: {new Date(status.last_validation).toLocaleString(locale)}</p>
                <p className="mt-1">{t('platform.overview.health.tests')}: {status.test_coverage}</p>
              </div>
            ) : null}
          </Card>

          <Card className="p-5">
            <p className="type-data text-xs uppercase tracking-[0.18em] text-[color:var(--accent)]">{t('platform.overview.recent.eyebrow')}</p>
            <h2 className="mt-2 text-lg font-semibold text-[color:var(--text)]">{t('platform.overview.recent.title')}</h2>
            <div className="mt-3">
              {projects.isLoading ? <p className="py-4 text-sm text-[color:var(--muted)]">{t('platform.overview.status.checking')}</p> : null}
              {!projects.isLoading && recentProjects.length === 0 ? <p className="py-4 text-sm leading-6 text-[color:var(--muted)]">{t('platform.overview.recent.empty')}</p> : null}
              {recentProjects.map((project) => (
                <Link key={project.project_id} href={`/projects/${project.project_id}`} className="focus-ring group flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] px-2 hover:bg-[color:var(--surface-2)]">
                  <span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[color:var(--text)]">{project.project_name}</span>
                    <span className="mt-0.5 block text-xs text-[color:var(--muted)]">{t(`status.${project.readiness_status}`)}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-[color:var(--muted)] group-hover:text-[color:var(--accent)]" />
                </Link>
              ))}
            </div>
            <Link href="/projects" className="focus-ring mt-3 inline-flex min-h-11 w-full items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--surface-2)]">
              {t('platform.overview.recent.open')} <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
