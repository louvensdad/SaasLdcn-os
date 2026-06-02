'use client';

import { useEffect } from 'react';
import { Activity, Database, Gauge, Radio, ServerCrash, Sparkles } from 'lucide-react';

import { LDCNPresenceCore } from '@/components/ldcn/ldcn-presence-core';
import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { SectionHeader } from '@/components/shell/section-header';
import {
  ArchitectureGraphSurface,
  ComplexityRadar,
  DeploymentPathSurface,
  OperationalRail,
  ReadinessRing,
  StackEcosystemMap,
  SurfaceDivider,
  SurfaceLabel,
  SurfaceIcon,
} from '@/components/visual/engineering-surface';
import { useHealth } from '@/hooks/use-health';
import { useProjects } from '@/hooks/use-projects';
import { useStacks } from '@/hooks/use-stacks';
import { getApiErrorMessage, isApiOffline } from '@/lib/api/errors';
import { useLDCNStore } from '@/stores/use-ldcn-store';

const activitySignals = [
  'Health endpoint observed',
  'Stacks registry synchronized',
  'Projects persistence local-first',
  'Frontend retry path ready',
] as const;

export default function DashboardPage() {
  const healthQuery = useHealth();
  const stacksQuery = useStacks();
  const projectsQuery = useProjects();
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);
  const backendOffline = healthQuery.isError && isApiOffline(healthQuery.error);

  const projectCount = projectsQuery.data?.length ?? 0;
  const stackCount = stacksQuery.data?.length ?? 0;
  const readinessScore = backendOffline ? 28 : healthQuery.data?.status === 'degraded' ? 72 : 94;
  const healthLabel = backendOffline
    ? 'Offline'
    : healthQuery.data?.status === 'degraded'
      ? 'Degraded'
      : 'Connected';

  useEffect(() => {
    setPresenceState(backendOffline ? 'warning' : 'observing');
    setContext({
      route: '/dashboard',
      page_title: 'Engineering Runtime Command Center',
      current_phase: 'Command center',
      pipeline: {
        route: '/dashboard',
        phase: 'Command center',
        status: backendOffline ? 'blocked' : 'previewing',
        readiness_label: backendOffline ? 'Runtime recovery required' : 'Observing runtime surfaces',
        detail: backendOffline
          ? 'Backend is offline or degraded.'
          : 'Dashboard surfaces are synchronized with the foundation runtime.',
      },
      status: backendOffline ? 'warning' : 'observing',
      summary: 'Reserved presence layer watching the engineering shell without executing generation or voice.',
      suggestions: [
        {
          id: 'ldcn-dashboard-explain',
          action: 'explain_current_page',
          label: 'Explain current page',
          summary: 'Reserved for contextual explanation of the runtime command center.',
          reserved: true,
        },
        {
          id: 'ldcn-dashboard-palette',
          action: 'open_command_palette',
          label: 'Open command palette',
          summary: 'Reserved for future command palette integration.',
          reserved: true,
        },
      ],
    });
  }, [backendOffline, setContext, setPresenceState]);

  return (
    <div className="space-y-8 pb-10">
      <section className="cinematic-surface relative overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 md:p-6">
        <div className="ambient-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="cinematic-gradient-motion pointer-events-none absolute inset-0" />

        <div className="relative grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
          <div className="grid gap-5">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <ArchitectureGraphSurface
                title="Runtime topology surface"
                subtitle="Live backend presence, stack catalog, and persisted project registry are exposed as an architectural graph instead of a flat status panel."
                hint="Engineering runtime command center"
                nodes={[
                  {
                    label: 'Backend',
                    value: healthQuery.data?.service ?? 'Foundation API',
                    detail: backendOffline ? 'Offline state detected' : `v${healthQuery.data?.version ?? 'pending'}`,
                    tone: backendOffline ? 'danger' : 'accent',
                  },
                  {
                    label: 'Stacks',
                    value: String(stackCount),
                    detail: 'Live registry connections',
                    tone: stackCount > 0 ? 'success' : 'muted',
                  },
                  {
                    label: 'Projects',
                    value: String(projectCount),
                    detail: 'Persisted project records',
                    tone: projectCount > 0 ? 'accent2' : 'muted',
                  },
                  {
                    label: 'Contracts',
                    value: 'Synced',
                    detail: 'Typed foundation contracts',
                    tone: 'success',
                  },
                ]}
              />

              <ReadinessRing
                title="Foundation readiness"
                value={readinessScore}
                label={healthLabel}
                caption="Operational pulse derived from the real backend health state."
                tone={backendOffline ? 'danger' : healthQuery.data?.status === 'degraded' ? 'warning' : 'success'}
              />
            </div>

            <OperationalRail
              title="Operational intelligence rail"
              items={[
                {
                  label: 'API health',
                  value: healthQuery.isLoading ? 'Syncing' : healthQuery.data?.status ?? 'pending',
                  detail: healthQuery.data ? `${healthQuery.data.service} v${healthQuery.data.version}` : 'Waiting for backend response',
                  tone: backendOffline ? 'danger' : healthQuery.data?.status === 'degraded' ? 'warning' : 'success',
                },
                {
                  label: 'Registry sync',
                  value: `${projectCount} records`,
                  detail: 'Persisted projects pulled from SQLite local-first storage',
                  tone: projectCount > 0 ? 'success' : 'muted',
                },
                {
                  label: 'Stack surface',
                  value: `${stackCount} stacks`,
                  detail: 'Live stack catalog from the foundation API',
                  tone: stackCount > 0 ? 'accent2' : 'muted',
                },
                {
                  label: 'Offline guard',
                  value: backendOffline ? 'Enabled' : 'Clear',
                  detail: backendOffline ? 'Explicit offline recovery paths are active' : 'Connected runtime can be retried at any time',
                  tone: backendOffline ? 'warning' : 'success',
                },
              ]}
            />
          </div>

          <div className="grid gap-5">
            <StackEcosystemMap
              title="Stack ecosystem map"
              nodes={[
                {
                  label: 'Service',
                  value: healthQuery.data?.service ?? 'Foundation API',
                  detail: 'Backend runtime surface',
                  tone: 'accent',
                },
                {
                  label: 'Projects',
                  value: `${projectCount} persisted`,
                  detail: 'Project registry memory',
                  tone: 'success',
                },
                {
                  label: 'Stacks',
                  value: `${stackCount} active`,
                  detail: 'Technology catalog visibility',
                  tone: 'accent2',
                },
                {
                  label: 'Contracts',
                  value: 'Typed',
                  detail: 'Schema-aligned integration layer',
                  tone: 'muted',
                },
              ]}
            />

            <ComplexityRadar
              title="Runtime complexity radar"
              score={Math.min(100, 26 + stackCount * 7 + projectCount * 6 + (backendOffline ? 0 : 14))}
              axes={[
                { label: 'Registry density', value: Math.min(100, projectCount * 18 + 24) },
                { label: 'Stack breadth', value: Math.min(100, stackCount * 16 + 18) },
                { label: 'Backend presence', value: backendOffline ? 18 : 92 },
                { label: 'Recovery posture', value: backendOffline ? 72 : 88 },
                { label: 'Operational rhythm', value: backendOffline ? 40 : 84 },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="LDCN presence surface"
          description="A reserved operational layer that keeps the shell aware of route, phase, and pipeline posture without exposing voice, avatar, or AI execution."
        />

        <LDCNPresenceCore
          context={{
            route: '/dashboard',
            page_title: 'Engineering Runtime Command Center',
            current_phase: 'Command center',
            pipeline: {
              route: '/dashboard',
              phase: 'Command center',
              status: backendOffline ? 'blocked' : 'previewing',
              readiness_label: backendOffline ? 'Runtime recovery required' : 'Observing runtime surfaces',
              detail: backendOffline
                ? 'Backend is offline or degraded.'
                : 'Dashboard surfaces are synchronized with the foundation runtime.',
            },
            status: backendOffline ? 'warning' : 'observing',
            summary: 'Reserved presence layer watching the engineering shell without executing generation or voice.',
            suggestions: [
              {
                id: 'ldcn-dashboard-explain',
                action: 'explain_current_page',
                label: 'Explain current page',
                summary: 'Reserved for contextual explanation of the runtime command center.',
                reserved: true,
              },
              {
                id: 'ldcn-dashboard-palette',
                action: 'open_command_palette',
                label: 'Open command palette',
                summary: 'Reserved for future command palette integration.',
                reserved: true,
              },
            ],
          }}
        />
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Operational pulse"
          description="Live foundation metrics are rendered as layered engineering signals instead of equal-weight dashboard tiles."
        />

        {healthQuery.isLoading || stacksQuery.isLoading || projectsQuery.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <CardLoading />
            <CardLoading />
            <CardLoading />
          </div>
        ) : healthQuery.isError || stacksQuery.isError || projectsQuery.isError ? (
          <PageError
            title={backendOffline ? 'Backend offline state detected' : 'Foundation metrics unavailable'}
            description={getApiErrorMessage(
              healthQuery.error ?? stacksQuery.error ?? projectsQuery.error,
              'Unable to load dashboard metrics from the backend foundation.',
            )}
            onRetry={() => {
              void healthQuery.refetch();
              void stacksQuery.refetch();
              void projectsQuery.refetch();
            }}
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="relative overflow-hidden p-5">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_32%)]" />
              <div className="relative grid gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Operational feed</p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">Synced backend signals and live registry observations.</p>
                  </div>
                  <Badge className={backendOffline ? 'border-[color-mix(in_srgb,var(--danger)_28%,transparent)] text-[color:var(--danger)]' : 'border-[color-mix(in_srgb,var(--accent)_28%,transparent)]'}>
                    {healthLabel}
                  </Badge>
                </div>

                <div className="grid gap-3">
                  {activitySignals.map((signal, index) => (
                    <div
                      key={signal}
                      className="flex items-center justify-between gap-4 rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] px-4 py-3"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm text-[color:var(--muted)]">
                        {index % 2 === 0 ? (
                          <Activity className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                        ) : (
                          <Radio className="h-3.5 w-3.5 text-[color:var(--accent-2)]" />
                        )}
                        <span className="truncate">{signal}</span>
                      </span>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${backendOffline ? 'bg-[color:var(--danger)]' : 'bg-[color:var(--accent)]'} shadow-[0_0_16px_var(--glow)]`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="flex min-h-52 flex-col justify-between overflow-hidden p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Backend health</p>
                    <p className="mt-2 text-lg font-semibold text-[color:var(--text)]">
                      {backendOffline ? 'Foundation API offline' : 'Foundation API connected'}
                    </p>
                  </div>
                  {backendOffline ? <ServerCrash className="h-5 w-5 text-[color:var(--danger)]" /> : <Gauge className="h-5 w-5 text-[color:var(--accent)]" />}
                </div>
                <p className="mt-4 text-sm leading-6 text-[color:var(--muted)]">
                  {healthQuery.data ? `${healthQuery.data.service} v${healthQuery.data.version}` : 'Waiting for health response'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge>{healthQuery.data?.status ?? 'pending'}</Badge>
                  <Badge>{backendOffline ? 'offline recovery' : 'live runtime'}</Badge>
                </div>
              </Card>

              <Card className="flex min-h-52 flex-col justify-between overflow-hidden p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Contract sync</p>
                    <p className="mt-2 text-lg font-semibold text-[color:var(--text)]">Typed frontend ↔ backend alignment</p>
                  </div>
                  <Database className="h-5 w-5 text-[color:var(--accent-2)]" />
                </div>
                <p className="mt-4 text-sm leading-6 text-[color:var(--muted)]">
                  Contracts, registry payloads, and persisted project records stay aligned with the backend foundation.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge>Projects {projectCount}</Badge>
                  <Badge>Stacks {stackCount}</Badge>
                </div>
              </Card>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <DeploymentPathSurface
          title="Deployment pathway surface"
          steps={[
            {
              label: 'Observe runtime presence',
              detail: 'The dashboard confirms whether the backend is connected, degraded, or offline before any next step.',
              tone: backendOffline ? 'warning' : 'success',
            },
            {
              label: 'Inspect registry topology',
              detail: 'Stack and project registries are exposed as synchronized engineering surfaces rather than empty metrics.',
              tone: 'accent',
            },
            {
              label: 'Open architecture surfaces',
              detail: 'Projects, templates, and wizard flows keep their operational identities while preserving backend contracts.',
              tone: 'accent2',
            },
          ]}
        />

        <Card className="flex flex-col justify-between gap-6 overflow-hidden p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Command surfaces</p>
            <h3 className="mt-2 text-2xl font-semibold text-[color:var(--text)]">Navigate the engineering OS</h3>
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
              The shell remains stable, but the surfaces now communicate topology, readiness, and operational context with higher density.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SurfaceLabel
              icon={<SurfaceIcon icon={Sparkles} />}
              label="Registry"
              value={`${projectCount} project records`}
              detail="Persisted through the backend project registry."
            />
            <SurfaceLabel
              icon={<SurfaceIcon icon={Activity} />}
              label="Health"
              value={healthQuery.data?.status ?? 'pending'}
              detail={backendOffline ? 'Recovery path is explicit' : 'Foundation runtime is visible'}
            />
          </div>
          <SurfaceDivider />
          <div className="flex flex-wrap gap-3">
            <ActionLink href="/projects" variant="primary">
              Open project registry
            </ActionLink>
            <ActionLink href="/wizard" variant="secondary">
              Enter architecture journey
            </ActionLink>
            <ActionLink href="/settings" variant="ghost">
              Foundation settings
            </ActionLink>
          </div>
        </Card>
      </section>
    </div>
  );
}
