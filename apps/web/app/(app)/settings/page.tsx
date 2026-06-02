'use client';

import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { SectionHeader } from '@/components/shell/section-header';
import { ThemeSwitcher } from '@/components/shell/theme-switcher';
import {
  ArchitectureGraphSurface,
  OperationalRail,
  ReadinessRing,
  StackEcosystemMap,
} from '@/components/visual/engineering-surface';
import { useArchitectures } from '@/hooks/use-architectures';
import { useArchetypes } from '@/hooks/use-archetypes';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useFrameworks } from '@/hooks/use-frameworks';
import { useHealth } from '@/hooks/use-health';
import { useLanguages } from '@/hooks/use-languages';
import { useProjects } from '@/hooks/use-projects';
import { useStacks } from '@/hooks/use-stacks';
import { API_BASE_URL } from '@/lib/api/endpoints';
import { getApiErrorMessage, isApiOffline } from '@/lib/api/errors';

export default function SettingsPage() {
  const healthQuery = useHealth();
  const languagesQuery = useLanguages();
  const frameworksQuery = useFrameworks();
  const architecturesQuery = useArchitectures();
  const archetypesQuery = useArchetypes();
  const capabilitiesQuery = useCapabilities();
  const stacksQuery = useStacks();
  const projectsQuery = useProjects();
  const offline = healthQuery.isError && isApiOffline(healthQuery.error);
  const readinessScore = offline ? 34 : healthQuery.data?.status === 'degraded' ? 72 : 92;

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Settings"
        description="Operational runtime view for theme control, backend registry visibility, and contract synchronization."
      />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="grid gap-4">
          <Card className="space-y-4 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Theme engine</p>
            <ThemeSwitcher />
            <p className="text-sm leading-6 text-[color:var(--muted)]">
              Theme switching remains independent from backend availability and preserves the current engineering shell.
            </p>
          </Card>

          <ArchitectureGraphSurface
            title="Contract registry overview"
            subtitle="The frontend stays aligned with the foundation contracts that shape projects, blueprints, and validation surfaces."
            nodes={[
              {
                label: 'Languages',
                value: String(languagesQuery.data?.length ?? 0),
                detail: 'Language registry entries',
                tone: 'accent',
              },
              {
                label: 'Frameworks',
                value: String(frameworksQuery.data?.length ?? 0),
                detail: 'Framework registry entries',
                tone: 'accent2',
              },
              {
                label: 'Architectures',
                value: String(architecturesQuery.data?.length ?? 0),
                detail: 'Architecture registry entries',
                tone: 'success',
              },
              {
                label: 'Archetypes',
                value: String(archetypesQuery.data?.length ?? 0),
                detail: 'Archetype registry entries',
                tone: 'muted',
              },
            ]}
          />
        </div>

        <div className="grid gap-4">
          <ReadinessRing
            title="Foundation health"
            value={readinessScore}
            label={offline ? 'Offline' : healthQuery.data?.status ?? 'Pending'}
            caption="Backend runtime, registry access, and local-first persistence are tracked here."
            tone={offline ? 'danger' : healthQuery.data?.status === 'degraded' ? 'warning' : 'success'}
          />

          <OperationalRail
            title="Runtime synchronization"
            items={[
              {
                label: 'Backend registry',
                value: offline ? 'Unavailable' : 'Visible',
                detail: 'API base URL and health endpoint are exposed',
                tone: offline ? 'warning' : 'success',
              },
              {
                label: 'Contract sync',
                value: 'Aligned',
                detail: 'Typed contract shapes remain shared across frontend and backend',
                tone: 'accent',
              },
              {
                label: 'Topology sync',
                value: `${stacksQuery.data?.length ?? 0} stacks`,
                detail: 'Stack registry is part of the operational surface',
                tone: 'accent2',
              },
              {
                label: 'Project registry',
                value: `${projectsQuery.data?.length ?? 0} records`,
                detail: 'Persisted records confirm backend registry connectivity',
                tone: 'success',
              },
            ]}
          />

          <StackEcosystemMap
            title="Foundation health panels"
            nodes={[
              {
                label: 'API base',
                value: API_BASE_URL,
                detail: 'Backend foundation endpoint',
                tone: 'accent',
              },
              {
                label: 'Health',
                value: healthQuery.data?.status ?? 'pending',
                detail: healthQuery.data ? `${healthQuery.data.service} v${healthQuery.data.version}` : 'Awaiting response',
                tone: offline ? 'warning' : 'success',
              },
              {
                label: 'Capabilities',
                value: String(capabilitiesQuery.data?.length ?? 0),
                detail: 'Capability registry visibility',
                tone: 'accent2',
              },
              {
                label: 'Registry mode',
                value: offline ? 'Recovery' : 'Live',
                detail: 'Explicit operational posture',
                tone: offline ? 'warning' : 'success',
              },
            ]}
          />

          <Card className="space-y-4 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Quick actions</p>
            <div className="flex flex-wrap gap-3">
              <Badge>{offline ? 'backend offline' : 'backend online'}</Badge>
              <Badge>{projectsQuery.data?.length ?? 0} projects</Badge>
              <Badge>{stacksQuery.data?.length ?? 0} stacks</Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              <ActionLink href="/dashboard" variant="primary">
                Return dashboard
              </ActionLink>
              <ActionLink href="/documentation" variant="secondary">
                Review rules
              </ActionLink>
            </div>
          </Card>
        </div>
      </div>

      {healthQuery.isLoading ? (
        <CardLoading />
      ) : healthQuery.isError ? (
        <PageError
          title={offline ? 'Backend offline state active' : 'API health unavailable'}
          description={getApiErrorMessage(
            healthQuery.error,
            'Unable to load backend health status.',
          )}
          onRetry={() => void healthQuery.refetch()}
        />
      ) : null}
    </div>
  );
}
