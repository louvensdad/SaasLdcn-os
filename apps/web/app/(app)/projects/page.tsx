'use client';

import { useMemo } from 'react';

import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/shell/section-header';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { EmptyState } from '@/components/empty-states/empty-state';
import {
  ArchitectureGraphSurface,
  DeploymentPathSurface,
  ReadinessRing,
  StackEcosystemMap,
} from '@/components/visual/engineering-surface';
import { useArchetypes } from '@/hooks/use-archetypes';
import { useProjects } from '@/hooks/use-projects';
import { getApiErrorMessage } from '@/lib/api/errors';
import type { Project } from '@/lib/api/types';

function formatStatus(status: string) {
  return status.replaceAll('_', ' ');
}

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
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Architecture identity</p>
              <h3 className="mt-2 truncate text-2xl font-semibold text-[color:var(--text)]">{project.project_name}</h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                {project.technology_graph.language.name} / {project.technology_graph.runtime.name} / {project.technology_graph.framework.name}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{formatStatus(project.status)}</Badge>
              <Badge>{formatStatus(project.readiness_status)}</Badge>
              {isHandoffReady(project) ? <Badge>handoff ready</Badge> : null}
            </div>
          </div>

          <StackEcosystemMap
            title="Stack visualization"
            nodes={[
              {
                label: 'Language',
                value: project.technology_graph.language.name,
                detail: `Ecosystem: ${project.technology_graph.language.ecosystem}`,
                tone: 'accent',
              },
              {
                label: 'Runtime',
                value: project.technology_graph.runtime.name,
                detail: 'Runtime aligned with the blueprint',
                tone: 'accent2',
              },
              {
                label: 'Framework',
                value: project.technology_graph.framework.name,
                detail: 'Framework topology remains contract-safe',
                tone: 'success',
              },
              {
                label: 'Architecture',
                value: project.technology_graph.architecture.name,
                detail: `Archetype ${archetypeLabel}`,
                tone: readinessTone,
              },
            ]}
            className="bg-black/10"
          />

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">Locale</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{project.locale}</p>
              <p className="mt-2 text-xs text-[color:var(--muted)]">Mode {formatStatus(project.generation_mode)}</p>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">Blueprint lineage</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{project.blueprint_snapshot.generated_at}</p>
              <p className="mt-2 text-xs text-[color:var(--muted)]">Prompt Master and Gatekeeper snapshots are persisted alongside it.</p>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">Operational state</p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{formatStatus(project.gatekeeper_snapshot.decision)}</p>
              <p className="mt-2 text-xs text-[color:var(--muted)]">{project.gatekeeper_snapshot.blockers.length} blockers / {project.gatekeeper_snapshot.warnings.length} warnings</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge>{project.selected_capabilities.length} capabilities</Badge>
            <Badge>{project.selected_business_modules.length} modules</Badge>
            <Badge>{project.selected_endpoints.length} endpoints</Badge>
          </div>
        </div>

        <div className="grid gap-4">
          <ReadinessRing
            title="Readiness ring"
            value={readinessScore}
            label={formatStatus(project.readiness_status)}
            caption="Project readiness and gatekeeper posture."
            tone={readinessTone}
          />
          <DeploymentPathSurface
            title="Deployment profile"
            steps={[
              {
                label: 'Project status',
                detail: formatStatus(project.status),
                tone: readinessTone,
              },
              {
                label: 'Architecture class',
                detail: project.technology_graph.architecture.name,
                tone: 'accent',
              },
              {
                label: 'Gatekeeper decision',
                detail: formatStatus(project.gatekeeper_snapshot.decision),
                tone: readinessTone,
              },
            ]}
          />
          <div className="flex flex-wrap justify-end gap-3">
            <ActionLink href={`/projects/${project.project_id}`} variant="primary">
              Open details
            </ActionLink>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ProjectsPage() {
  const projectsQuery = useProjects();
  const archetypesQuery = useArchetypes();
  const projects = projectsQuery.data ?? [];
  const archetypes = archetypesQuery.data ?? [];

  const archetypeMap = useMemo(
    () => new Map(archetypes.map((item) => [item.id, item])),
    [archetypes],
  );

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Projects"
        description="Persisted project records are surfaced as a registry of architecture identity, readiness, and lineage."
      />

      {projectsQuery.isLoading ? (
        <div className="grid gap-4">
          <CardLoading />
          <CardLoading />
        </div>
      ) : projectsQuery.isError ? (
        <PageError
          title="Project registry unavailable"
          description={getApiErrorMessage(
            projectsQuery.error,
            'Unable to load the persisted project registry from the backend.',
          )}
          onRetry={() => void projectsQuery.refetch()}
        />
      ) : projects.length === 0 ? (
        <EmptyState kind="projects" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <ArchitectureGraphSurface
              title="Project intelligence registry"
              subtitle="Each project carries its blueprint snapshot, prompt master snapshot, gatekeeper snapshot, and readiness status without generating code yet."
              nodes={[
                {
                  label: 'Projects',
                  value: String(projects.length),
                  detail: 'Persisted records',
                  tone: 'accent',
                },
                {
                  label: 'Approved',
                  value: String(projects.filter((project) => project.readiness_status === 'ready' || project.readiness_status === 'ready_with_warnings').length),
                  detail: 'Ready for generation',
                  tone: 'success',
                },
                {
                  label: 'Blocked',
                  value: String(projects.filter((project) => project.readiness_status === 'blocked' || project.status === 'generation_blocked').length),
                  detail: 'Gatekeeper stopped progression',
                  tone: 'warning',
                },
                {
                  label: 'Generated',
                  value: String(projects.filter((project) => project.status === 'generated').length),
                  detail: 'Historic completed records',
                  tone: 'accent2',
                },
              ]}
            />
            <DeploymentPathSurface
              title="Registry flow"
              steps={[
                {
                  label: 'Architecture identity',
                  detail: 'Language, runtime, framework, architecture, and archetype define the operational surface.',
                  tone: 'accent',
                },
                {
                  label: 'Persisted snapshots',
                  detail: 'Blueprint, Prompt Master, and Gatekeeper snapshots remain attached to the record.',
                  tone: 'accent2',
                },
                {
                  label: 'Detail view',
                  detail: 'Open a record to inspect lineage, selected modules, and selected endpoints.',
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
