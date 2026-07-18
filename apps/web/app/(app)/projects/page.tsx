'use client';

import { useMemo } from 'react';

import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/shell/section-header';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { EmptyState } from '@/components/empty-states/empty-state';
import { ProjectDeleteButton } from '@/components/project/project-delete-button';
import {
  ArchitectureGraphSurface,
  DeploymentPathSurface,
  ReadinessRing,
  StackEcosystemMap,
} from '@/components/visual/engineering-surface';
import { useArchetypes } from '@/hooks/use-archetypes';
import { useProjects } from '@/hooks/use-projects';
import { useLocale } from '@/hooks/use-locale';
import { getApiErrorMessage } from '@/lib/api/errors';
import type { Project } from '@/lib/api/types';

function getReadinessScore(status: string) {
  switch (status) {
    case 'generated':
      return 100;
    case 'ready':
      return 88;
    case 'ready_with_warnings':
      return 74;
    case 'blueprint_ready':
      return 58;
    case 'blocked':
      return 34;
    case 'failed':
      return 22;
    default:
      return 18;
  }
}

function isHandoffReady(project: Project) {
  return (
    project.status === 'ready_for_generation' &&
    (project.readiness_status === 'ready' || project.readiness_status === 'ready_with_warnings') &&
    Boolean(project.blueprint_snapshot) &&
    Boolean(project.prompt_master_snapshot) &&
    Boolean(project.gatekeeper_snapshot) &&
    Boolean(project.architectural_graph_snapshot)
  );
}

function ProjectRegistryCard({
  project,
  archetypeLabel,
}: {
  readonly project: Project;
  readonly archetypeLabel: string;
}) {
  const { locale, t } = useLocale();
  const statusLabel = (status: string) => t(`status.${status}`);
  const readinessScore = getReadinessScore(project.readiness_status);
  const readinessTone =
    project.readiness_status === 'blocked' || project.status === 'generation_blocked'
      ? 'danger'
      : project.readiness_status === 'ready_with_warnings'
        ? 'warning'
        : project.readiness_status === 'generated' || project.readiness_status === 'ready'
          ? 'success'
          : 'accent';

  return (
    <Card className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_8%,transparent),transparent_34%)]" />
      <div className="relative grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="type-eyebrow">{t('projects.card.architectureIdentity')}</p>
              <h3 className="mt-2 flex items-center gap-2.5 truncate text-2xl font-semibold text-[color:var(--text)]">
                <span className="signal-node shrink-0" data-state={readinessTone === 'danger' ? 'idle' : 'active'} aria-hidden />
                <span className="truncate">{project.project_name}</span>
              </h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                {project.technology_graph.language.name} / {project.technology_graph.runtime.name} / {project.technology_graph.framework.name}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{statusLabel(project.status)}</Badge>
              <Badge>{statusLabel(project.readiness_status)}</Badge>
              {isHandoffReady(project) ? <Badge>{t('projects.card.handoffReady')}</Badge> : null}
            </div>
          </div>

          <StackEcosystemMap
            title={t('projects.card.stackVisualization')}
            nodes={[
              {
                label: t('projects.card.language'),
                value: project.technology_graph.language.name,
                detail: t('projects.card.ecosystem', { ecosystem: project.technology_graph.language.ecosystem }),
                tone: 'accent',
              },
              {
                label: t('projects.card.runtime'),
                value: project.technology_graph.runtime.name,
                detail: t('projects.card.runtimeDetail'),
                tone: 'accent2',
              },
              {
                label: t('projects.card.framework'),
                value: project.technology_graph.framework.name,
                detail: t('projects.card.frameworkDetail'),
                tone: 'success',
              },
              {
                label: t('projects.card.architecture'),
                value: project.technology_graph.architecture.name,
                detail: t('projects.card.archetype', { archetype: archetypeLabel }),
                tone: readinessTone,
              },
            ]}
            className="bg-black/10"
          />

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
              <p className="type-eyebrow">{t('projects.card.locale')}</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{project.locale}</p>
              <p className="mt-2 text-xs text-[color:var(--muted)]">{t('projects.card.mode', { mode: statusLabel(project.generation_mode) })}</p>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
              <p className="type-eyebrow">{t('projects.card.blueprintLineage')}</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{new Date(project.blueprint_snapshot.generated_at).toLocaleString(locale)}</p>
              <p className="mt-2 text-xs text-[color:var(--muted)]">{t('projects.card.blueprintLineageDetail')}</p>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
              <p className="type-eyebrow">{t('projects.card.operationalState')}</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{statusLabel(project.gatekeeper_snapshot.decision)}</p>
              <p className="mt-2 text-xs text-[color:var(--muted)]">{t('projects.card.issues', { blockers: project.gatekeeper_snapshot.blockers.length, warnings: project.gatekeeper_snapshot.warnings.length })}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge>{t('projects.card.capabilityCount', { count: project.selected_capabilities.length })}</Badge>
            <Badge>{t('projects.card.moduleCount', { count: project.selected_business_modules.length })}</Badge>
            <Badge>{t('projects.card.endpointCount', { count: project.selected_endpoints.length })}</Badge>
          </div>
        </div>

        <div className="grid gap-4">
          <ReadinessRing
            title={t('projects.card.readiness')}
            value={readinessScore}
            label={statusLabel(project.readiness_status)}
            caption={t('projects.card.readinessDetail')}
            tone={readinessTone}
          />
          <DeploymentPathSurface
            title={t('projects.card.deploymentProfile')}
            steps={[
              {
                label: t('projects.card.projectStatus'),
                detail: statusLabel(project.status),
                tone: readinessTone,
              },
              {
                label: t('projects.card.architectureClass'),
                detail: project.technology_graph.architecture.name,
                tone: 'accent',
              },
              {
                label: t('projects.card.gatekeeperDecision'),
                detail: statusLabel(project.gatekeeper_snapshot.decision),
                tone: readinessTone,
              },
            ]}
          />
          <div className="flex flex-wrap justify-end gap-3">
            <ProjectDeleteButton projectId={project.project_id} projectName={project.project_name} />
            <ActionLink href={`/projects/${project.project_id}`} variant="primary">
              {t('projects.card.openDetails')}
            </ActionLink>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ProjectsPage() {
  const { t } = useLocale();
  const projectsQuery = useProjects();
  const archetypesQuery = useArchetypes();
  const projects = projectsQuery.data ?? [];
  const archetypes = useMemo(() => archetypesQuery.data ?? [], [archetypesQuery.data]);

  const archetypeMap = useMemo(
    () => new Map(archetypes.map((item) => [item.id, item])),
    [archetypes],
  );

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t('projects.title')}
        description={t('projects.description')}
      />

      {projectsQuery.isLoading ? (
        <div className="grid gap-4">
          <CardLoading />
          <CardLoading />
        </div>
      ) : projectsQuery.isError ? (
        <PageError
          title={t('projects.error.title')}
          description={getApiErrorMessage(
            projectsQuery.error,
            t('projects.error.description'),
          )}
          onRetry={() => void projectsQuery.refetch()}
        />
      ) : projects.length === 0 ? (
        <EmptyState kind="projects" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <ArchitectureGraphSurface
              title={t('projects.registry.title')}
              subtitle={t('projects.registry.description')}
              nodes={[
                {
                  label: t('projects.registry.projects'),
                  value: String(projects.length),
                  detail: t('projects.registry.projectsDetail'),
                  tone: 'accent',
                },
                {
                  label: t('projects.registry.approved'),
                  value: String(projects.filter((project) => project.readiness_status === 'ready' || project.readiness_status === 'ready_with_warnings').length),
                  detail: t('projects.registry.approvedDetail'),
                  tone: 'success',
                },
                {
                  label: t('projects.registry.blocked'),
                  value: String(projects.filter((project) => project.readiness_status === 'blocked' || project.status === 'generation_blocked').length),
                  detail: t('projects.registry.blockedDetail'),
                  tone: 'warning',
                },
                {
                  label: t('projects.registry.generated'),
                  value: String(projects.filter((project) => project.status === 'generated').length),
                  detail: t('projects.registry.generatedDetail'),
                  tone: 'accent2',
                },
              ]}
            />
            <DeploymentPathSurface
              title={t('projects.flow.title')}
              steps={[
                {
                  label: t('projects.flow.architectureIdentity'),
                  detail: t('projects.flow.architectureIdentityDetail'),
                  tone: 'accent',
                },
                {
                  label: t('projects.flow.snapshots'),
                  detail: t('projects.flow.snapshotsDetail'),
                  tone: 'accent2',
                },
                {
                  label: t('projects.flow.detailView'),
                  detail: t('projects.flow.detailViewDetail'),
                  tone: 'success',
                },
              ]}
            />
          </div>

          <div className="grid gap-4">
            {projects.map((project) => (
              <ProjectRegistryCard
                key={project.project_id}
                project={project}
                archetypeLabel={archetypeMap.get(project.archetype_id)?.name ?? project.archetype_id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
