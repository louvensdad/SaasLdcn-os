'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Code2, Download, FileArchive, FileCode2, FileJson, FileText, Folder, ShieldCheck } from 'lucide-react';

import { LDCNContextPanel } from '@/components/ldcn/ldcn-context-panel';
import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/shell/section-header';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import {
  ArchitectureGraphSurface,
  ComplexityRadar,
  DeploymentPathSurface,
  ReadinessRing,
  StackEcosystemMap,
} from '@/components/visual/engineering-surface';
import { useProject } from '@/hooks/use-projects';
import { useGenerationHandoff } from '@/hooks/use-generation-handoff';
import { useGeneratedFiles } from '@/hooks/use-generated-files';
import { useGeneratedFileContent } from '@/hooks/use-generated-file-content';
import { usePrepareDownload } from '@/hooks/use-prepare-download';
import { useLocalGeneration } from '@/hooks/use-local-generation';
import { useRecommendedSkills } from '@/hooks/use-skills';
import { useTemplateDetail } from '@/hooks/use-templates';
import { useDeliveryEstimate } from '@/hooks/use-delivery-estimate';
import { useEngineeringReadiness } from '@/hooks/use-engineering-readiness';
import { useTeamProfile } from '@/hooks/use-team-profile';
import { ApiClientError } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useLDCNStore } from '@/stores/use-ldcn-store';
import { EngineeringReadinessPanel } from '@/components/wizard/engineering-readiness-panel';
import { VisualizationCockpit } from '@/components/system-design/visualization-cockpit';
import { ArchitecturalGraphCanvas } from '@/components/architectural-graph/architectural-graph-canvas';
import { apiEndpoints } from '@/lib/api/endpoints';

function SummaryRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-[color:var(--muted)]">{label}</span>
      <span className="font-semibold text-[color:var(--text)]">{value}</span>
    </div>
  );
}

function formatStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function getReadinessScore(status: string) {
  switch (status) {
    case 'generated':
      return 100;
    case 'ready':
      return 90;
    case 'ready_with_warnings':
      return 76;
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

function readinessTone(readiness: string) {
  if (readiness === 'blocked') return 'danger';
  if (readiness === 'ready') return 'success';
  return 'warning';
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function GeneratedFileIcon({
  path,
  kind,
}: {
  readonly path: string;
  readonly kind: 'file' | 'directory';
}) {
  if (kind === 'directory') return <Folder className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />;
  if (path.endsWith('.json')) return <FileJson className="h-4 w-4 text-[color:var(--accent2)]" aria-hidden />;
  if (/\.(tsx|ts|jsx|js|css|html)$/.test(path)) return <FileCode2 className="h-4 w-4 text-[color:var(--success)]" aria-hidden />;
  if (/\.(zip|png|jpg|jpeg|webp|gif|ico)$/.test(path)) return <FileArchive className="h-4 w-4 text-[color:var(--muted)]" aria-hidden />;
  return <FileText className="h-4 w-4 text-[color:var(--text)]" aria-hidden />;
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = typeof params.projectId === 'string' ? params.projectId : null;
  const projectQuery = useProject(projectId);
  const engineeringPayload = useMemo(() => {
    if (!projectQuery.data) return null;

    return {
      language_id: projectQuery.data.technology_graph.language.id,
      framework_id: projectQuery.data.technology_graph.framework.id,
      architecture_id: projectQuery.data.technology_graph.architecture.id,
      capability_ids: projectQuery.data.selected_capabilities,
      infrastructure_ids: projectQuery.data.blueprint_snapshot.infrastructure_profile.selected_component_ids,
    };
  }, [projectQuery.data]);
  const architecturalGraphPayload = useMemo(() => {
    if (!engineeringPayload || !projectQuery.data) return null;
    return {
      ...engineeringPayload,
      business_module_ids: projectQuery.data.selected_business_modules,
    };
  }, [engineeringPayload, projectQuery.data]);
  const engineeringReadinessQuery = useEngineeringReadiness(engineeringPayload);
  const teamProfileQuery = useTeamProfile(engineeringPayload);
  const deliveryEstimateQuery = useDeliveryEstimate(engineeringPayload);
  const handoffMutation = useGenerationHandoff();
  const localGenerationMutation = useLocalGeneration();
  const generatedTemplateId = localGenerationMutation.data?.template_id ?? null;
  const generatedTemplateQuery = useTemplateDetail(generatedTemplateId);
  const projectSkillSelection = useMemo(() => {
    if (!projectQuery.data) return null;
    return {
      project_id: projectQuery.data.project_id,
      language_id: projectQuery.data.technology_graph.language.id,
      framework_id: projectQuery.data.technology_graph.framework.id,
      architecture_id: projectQuery.data.technology_graph.architecture.id,
      archetype_id: projectQuery.data.archetype_id,
      has_generated_project: Boolean(localGenerationMutation.data?.status === 'generated'),
    };
  }, [localGenerationMutation.data?.status, projectQuery.data]);
  const recommendedSkillsQuery = useRecommendedSkills(projectSkillSelection);
  const generatedFilesQuery = useGeneratedFiles(projectId);
  const [outputPath, setOutputPath] = useState('');
  const [selectedGeneratedPath, setSelectedGeneratedPath] = useState<string | null>(null);
  const selectedFilePreviewQuery = useGeneratedFileContent(projectId, selectedGeneratedPath);
  const prepareDownloadMutation = usePrepareDownload(projectId);
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  useEffect(() => {
    const files = generatedFilesQuery.data?.files ?? [];
    if (!files.length) {
      setSelectedGeneratedPath(null);
      return;
    }
    if (!selectedGeneratedPath || !files.some((file) => file.relative_path === selectedGeneratedPath)) {
      setSelectedGeneratedPath(files[0].relative_path);
    }
  }, [generatedFilesQuery.data, selectedGeneratedPath]);

  useEffect(() => {
    if (!projectQuery.data) return;

    const handoff = handoffMutation.data;
    const localGeneration = localGenerationMutation.data;
    const effectiveReadiness = handoff?.handoff_readiness;
    const readinessState =
      localGeneration?.status === 'blocked' ||
      effectiveReadiness === 'blocked' || projectQuery.data.readiness_status === 'blocked' || projectQuery.data.status === 'generation_blocked'
        ? 'blocked'
        : localGenerationMutation.isPending || effectiveReadiness === 'incomplete' || projectQuery.data.readiness_status === 'failed'
          ? 'warning'
          : 'observing';
    const handoffSummary =
      localGenerationMutation.isPending
        ? 'Template assembly in progress'
        : localGeneration?.status === 'generated'
          ? 'Filesystem snapshot generated'
          : localGeneration?.status === 'blocked'
            ? 'Generation blocked by unsupported architecture'
            : effectiveReadiness === 'ready'
        ? 'Generation handoff ready'
        : effectiveReadiness === 'blocked'
          ? 'Generation blocked by Gatekeeper'
          : effectiveReadiness === 'incomplete'
            ? 'Project missing required artifacts'
            : 'Reserved presence layer for project intelligence and readiness insight.';

    setPresenceState(readinessState);
    setContext({
      route: `/projects/${projectQuery.data.project_id}`,
      page_title: projectQuery.data.project_name,
      current_phase: 'Project detail',
      pipeline: {
        route: `/projects/${projectQuery.data.project_id}`,
        phase: 'Project detail',
        status: readinessState === 'blocked' ? 'blocked' : readinessState === 'warning' ? 'degraded' : 'ready',
        readiness_label: effectiveReadiness ? formatStatus(effectiveReadiness) : formatStatus(projectQuery.data.readiness_status),
        project_id: projectQuery.data.project_id,
        detail: handoffSummary,
      },
      status: readinessState,
      summary: handoffSummary,
      project_id: projectQuery.data.project_id,
      suggestions: [
        {
          id: `project-${projectQuery.data.project_id}-review`,
          action: 'review_blueprint',
          label: 'Review blueprint',
          summary: 'Reserved for future blueprint explanation on the project detail surface.',
          reserved: true,
        },
      ],
    });
  }, [handoffMutation.data, localGenerationMutation.data, localGenerationMutation.isPending, projectQuery.data, setContext, setPresenceState]);

  const prepareHandoff = () => {
    if (!projectQuery.data) return;
    handoffMutation.mutate({ project_id: projectQuery.data.project_id });
  };

  const runLocalGeneration = () => {
    if (!projectQuery.data || !outputPath.trim()) return;
    localGenerationMutation.mutate({
      project_id: projectQuery.data.project_id,
      output_path: outputPath.trim(),
    });
  };

  const generatedTreeEntries = useMemo(() => {
    const directories = generatedFilesQuery.data?.directories ?? [];
    const files = generatedFilesQuery.data?.files ?? [];
    return [...directories, ...files].sort((left, right) => {
      const leftDepth = left.relative_path.split('/').length;
      const rightDepth = right.relative_path.split('/').length;
      if (leftDepth !== rightDepth) return leftDepth - rightDepth;
      return left.relative_path.localeCompare(right.relative_path);
    });
  }, [generatedFilesQuery.data]);
  const preparedDownload = prepareDownloadMutation.data;
  const downloadHref = projectId ? apiEndpoints.localGeneration.download(projectId) : '#';
  const generatedFilesNotReady =
    generatedFilesQuery.error instanceof ApiClientError && generatedFilesQuery.error.status === 409;
  const previewBlocked =
    Boolean(selectedFilePreviewQuery.data && !selectedFilePreviewQuery.data.preview_supported) ||
    selectedFilePreviewQuery.isError;

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Project Details"
        description="Persisted registry view of the validated wizard selection, with blueprint, Prompt Master, and Gatekeeper snapshots attached."
      />

      {projectQuery.isLoading ? (
        <Card className="space-y-4 p-6">
          <CardLoading className="p-0 shadow-none" />
          <CardLoading className="p-0 shadow-none" />
        </Card>
      ) : projectQuery.isError ? (
        <Card className="p-6">
          <PageError
            title="Project detail unavailable"
            description={getApiErrorMessage(projectQuery.error, 'Unable to load the project detail view.')}
            onRetry={() => void projectQuery.refetch()}
            className="p-4"
          />
        </Card>
      ) : projectQuery.data ? (
        <div className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
          <div className="grid gap-6">
            <Card className="relative overflow-hidden p-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_32%)]" />
              <div className="relative grid gap-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Blueprint lineage</p>
                    <p className="mt-2 text-3xl font-semibold text-[color:var(--text)]">{projectQuery.data.project_name}</p>
                    <p className="mt-2 text-sm text-[color:var(--muted)]">
                      {projectQuery.data.technology_graph.language.name} / {projectQuery.data.technology_graph.runtime.name} / {projectQuery.data.technology_graph.framework.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{formatStatus(projectQuery.data.status)}</Badge>
                    <Badge>{formatStatus(projectQuery.data.readiness_status)}</Badge>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <StackEcosystemMap
                    title="Technology graph"
                    nodes={[
                      {
                        label: 'Language',
                        value: projectQuery.data.technology_graph.language.name,
                        detail: `Ecosystem: ${projectQuery.data.technology_graph.language.ecosystem}`,
                        tone: 'accent',
                      },
                      {
                        label: 'Runtime',
                        value: projectQuery.data.technology_graph.runtime.name,
                        detail: 'Runtime segment',
                        tone: 'accent2',
                      },
                      {
                        label: 'Framework',
                        value: projectQuery.data.technology_graph.framework.name,
                        detail: 'Framework topology',
                        tone: 'success',
                      },
                      {
                        label: 'Architecture',
                        value: projectQuery.data.technology_graph.architecture.name,
                        detail: `Archetype ${projectQuery.data.archetype_id}`,
                        tone: 'muted',
                      },
                    ]}
                    className="bg-black/10"
                  />

                  <ReadinessRing
                    title="Readiness ring"
                    value={getReadinessScore(projectQuery.data.readiness_status)}
                    label={formatStatus(projectQuery.data.readiness_status)}
                    caption="Readiness is derived from the persisted project status."
                    tone={
                      projectQuery.data.readiness_status === 'blocked' || projectQuery.data.status === 'generation_blocked'
                        ? 'danger'
                        : projectQuery.data.readiness_status === 'ready_with_warnings'
                          ? 'warning'
                          : projectQuery.data.readiness_status === 'ready' || projectQuery.data.status === 'generated'
                            ? 'success'
                            : 'accent'
                    }
                  />
                </div>
              </div>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="space-y-4 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Snapshot summary</p>
                <SummaryRow label="Locale" value={projectQuery.data.locale} />
                <SummaryRow label="Generation mode" value={formatStatus(projectQuery.data.generation_mode)} />
                <SummaryRow label="Architecture" value={projectQuery.data.technology_graph.architecture.name} />
                <SummaryRow label="Archetype" value={projectQuery.data.archetype_id} />
                <SummaryRow label="Readiness" value={formatStatus(projectQuery.data.readiness_status)} />
              </Card>

              <Card className="space-y-4 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Blueprint summary</p>
                <SummaryRow label="Complexity" value={`${projectQuery.data.blueprint_snapshot.complexity_profile.overall_score}`} />
                <SummaryRow label="Risk" value={projectQuery.data.blueprint_snapshot.complexity_profile.risk_level} />
                <SummaryRow label="Recommendations" value={`${projectQuery.data.blueprint_snapshot.recommendations.length}`} />
                <SummaryRow label="Errors" value={`${projectQuery.data.blueprint_snapshot.validation.errors.length}`} />
                <SummaryRow label="Warnings" value={`${projectQuery.data.blueprint_snapshot.validation.warnings.length}`} />
              </Card>

              <Card className="space-y-4 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Prompt Master</p>
                <SummaryRow label="Sections" value={`${projectQuery.data.prompt_master_snapshot.sections.length}`} />
                <SummaryRow label="Warnings" value={`${projectQuery.data.prompt_master_snapshot.validation.warnings.length}`} />
                <SummaryRow label="Source valid" value={projectQuery.data.prompt_master_snapshot.source_blueprint_valid ? 'yes' : 'no'} />
                <SummaryRow label="Contains secrets" value={projectQuery.data.prompt_master_snapshot.trace.contains_secrets ? 'yes' : 'no'} />
                <SummaryRow label="Compiled" value="persisted" />
              </Card>
            </div>

            <Card className="space-y-4 p-5" data-testid="project-template-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Template Used</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">
                    {localGenerationMutation.data?.template_name ?? generatedTemplateQuery.data?.name ?? 'No generated template recorded yet'}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    Template metadata appears after local generation resolves a local registry template. Code is not executed or previewed in an iframe.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{generatedTemplateQuery.data?.version ? `v${generatedTemplateQuery.data.version}` : 'version pending'}</Badge>
                  <Badge>{generatedTemplateQuery.data?.maturity ?? 'maturity pending'}</Badge>
                  <Badge>{generatedTemplateId ?? 'template pending'}</Badge>
                </div>
              </div>

              {generatedTemplateQuery.isError ? (
                <PageError
                  title="Template metadata unavailable"
                  description={getApiErrorMessage(generatedTemplateQuery.error, 'Template registry metadata could not be loaded for this generated project.')}
                  className="p-4"
                />
              ) : generatedTemplateQuery.data ? (
                <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
                  <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <SummaryRow label="Category" value={generatedTemplateQuery.data.category} />
                    <SummaryRow label="Complexity" value={generatedTemplateQuery.data.complexity} />
                    <SummaryRow label="Capabilities" value={`${generatedTemplateQuery.data.capabilities.length}`} />
                    <SummaryRow label="Frameworks" value={generatedTemplateQuery.data.supported_frameworks.join(', ')} />
                  </div>
                  <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-sm font-semibold text-[color:var(--text)]">Changelog</p>
                    {generatedTemplateQuery.data.changelog.slice(0, 3).map((entry) => (
                      <div key={`${entry.version}-${entry.date}`} className="text-sm leading-6 text-[color:var(--muted)]">
                        <span className="font-semibold text-[color:var(--text)]">v{entry.version}</span> / {entry.date}: {entry.changes.join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-black/10 p-4 text-sm leading-6 text-[color:var(--muted)]">
                  Run local generation to record the template id, version, maturity, and changelog for this project.
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ['Template compatibility validated', Boolean(generatedTemplateQuery.data)],
                  ['Recommended template detected', Boolean(generatedTemplateId)],
                  ['Template maturity verified', Boolean(generatedTemplateQuery.data?.maturity)],
                ].map(([label, ready]) => (
                  <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-sm font-semibold text-[color:var(--text)]">{label}</p>
                    <p className="mt-1 text-xs text-[color:var(--muted)]">{ready ? 'ready' : 'waiting'}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="space-y-4 p-5" data-testid="available-skills-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Available Skills</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">Operational skills for this project</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    Skills are read-only operational assists. They do not execute agents, AI, shell commands, deployments, or external integrations.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{recommendedSkillsQuery.data?.filter((skill) => skill.unlocked).length ?? 0} unlocked</Badge>
                  <Badge>Skill registry synchronized</Badge>
                </div>
              </div>
              {recommendedSkillsQuery.isError ? (
                <PageError
                  title="Available skills unavailable"
                  description={getApiErrorMessage(recommendedSkillsQuery.error, 'Skill registry could not be loaded for this project.')}
                  className="p-4"
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {(recommendedSkillsQuery.data ?? []).filter((skill) => skill.unlocked).slice(0, 6).map((skill) => (
                    <div key={skill.skill_id} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--text)]">{skill.skill_id.replaceAll('_', ' ')}</p>
                        <Badge>{skill.score}%</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{skill.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="space-y-5 p-5" data-testid="generation-handoff-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Generation Readiness Handoff</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">Final preparation preview</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    Packages the saved project snapshots, selected scope, infrastructure recommendations, dependency impact, and engineering readiness without generating code.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {handoffMutation.data ? (
                    <Badge>{formatStatus(handoffMutation.data.handoff_readiness)}</Badge>
                  ) : (
                    <Badge>not prepared</Badge>
                  )}
                  <Badge>generation disabled</Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="primary" onClick={prepareHandoff} disabled={handoffMutation.isPending}>
                  {handoffMutation.isPending ? 'Preparing handoff' : 'Prepare Handoff'}
                </Button>
                <Button type="button" variant="secondary" disabled>
                  Generate Project
                </Button>
              </div>

              {handoffMutation.isError ? (
                <PageError
                  title="Generation handoff unavailable"
                  description={getApiErrorMessage(handoffMutation.error, 'Backend handoff preview is offline. The project record remains unchanged.')}
                  onRetry={prepareHandoff}
                  className="p-4"
                />
              ) : null}

              {handoffMutation.data ? (
                <div className="grid gap-4">
                  <ReadinessRing
                    title="Handoff readiness"
                    value={handoffMutation.data.handoff_readiness === 'ready' ? 96 : handoffMutation.data.handoff_readiness === 'blocked' ? 18 : 52}
                    label={formatStatus(handoffMutation.data.handoff_readiness)}
                    caption="Generation remains disabled until a future explicit generation flow exists."
                    tone={readinessTone(handoffMutation.data.handoff_readiness)}
                  />

                  <div className="grid gap-3 md:grid-cols-2">
                    {handoffMutation.data.checklist.map((item) => (
                      <div key={item.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-[color:var(--text)]">{item.label}</p>
                          <Badge>{item.status}</Badge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{item.summary}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Blockers</p>
                      <div className="mt-3 grid gap-2">
                        {handoffMutation.data.blockers.length ? (
                          handoffMutation.data.blockers.map((item) => (
                            <p key={`${item.source}-${item.code}`} className="text-sm leading-5 text-[color:var(--text)]">{item.message}</p>
                          ))
                        ) : (
                          <p className="text-sm text-[color:var(--muted)]">No critical blockers.</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Warnings</p>
                      <div className="mt-3 grid gap-2">
                        {handoffMutation.data.warnings.length ? (
                          handoffMutation.data.warnings.slice(0, 5).map((item) => (
                            <p key={`${item.source}-${item.code}`} className="text-sm leading-5 text-[color:var(--text)]">{item.message}</p>
                          ))
                        ) : (
                          <p className="text-sm text-[color:var(--muted)]">No warnings returned.</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Safe trace</p>
                      <div className="mt-3 grid gap-2 text-sm text-[color:var(--muted)]">
                        <p>{handoffMutation.data.trace.generated_at}</p>
                        <p>{handoffMutation.data.trace.operations.join(' / ')}</p>
                        <p>contains secrets: {handoffMutation.data.trace.contains_secrets ? 'yes' : 'no'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Artifacts included</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {handoffMutation.data.artifacts.map((artifact) => (
                        <Badge key={artifact.id}>{artifact.included ? artifact.label : `${artifact.label} missing`}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>

            <Card className="space-y-5 p-5" data-testid="local-generation-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Local Generation Engine V0</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">Static foundation assembly</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    Template-driven local generation for static foundations only. No AI, no agents, no installs, no shell execution.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{localGenerationMutation.data?.status ?? 'idle'}</Badge>
                  <Badge>local static v0</Badge>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  value={outputPath}
                  onChange={(event) => setOutputPath(event.target.value)}
                  placeholder={`generated-projects/active/${projectQuery.data.project_id}`}
                  aria-label="Local generation output path"
                />
                <Button
                  type="button"
                  variant="primary"
                  onClick={runLocalGeneration}
                  disabled={localGenerationMutation.isPending || !outputPath.trim()}
                >
                  {localGenerationMutation.isPending ? 'Generating locally' : 'Generate Locally'}
                </Button>
              </div>

              {localGenerationMutation.isError ? (
                <PageError
                  title="Local generation unavailable"
                  description={getApiErrorMessage(localGenerationMutation.error, 'Local generation failed safely. No project files were overwritten.')}
                  onRetry={runLocalGeneration}
                  className="p-4"
                />
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <DeploymentPathSurface
                  title="Generation Pipeline Surface"
                  steps={[
                    {
                      label: 'Readiness handoff',
                      detail: localGenerationMutation.data?.trace.find((item) => item.step === 'handoff_validation')?.message ?? 'Awaiting local generation request.',
                      tone: localGenerationMutation.data?.handoff_readiness === 'ready' ? 'success' : localGenerationMutation.data ? 'warning' : 'accent',
                    },
                    {
                      label: 'Template Resolution Layer',
                      detail: localGenerationMutation.data?.template_name ?? 'Template will resolve after handoff validation.',
                      tone: localGenerationMutation.data?.template_id ? 'success' : 'accent2',
                    },
                    {
                      label: 'Artifact Assembly Timeline',
                      detail: localGenerationMutation.data ? `${localGenerationMutation.data.artifacts.length} artifacts assembled` : 'No artifacts assembled yet.',
                      tone: localGenerationMutation.data?.status === 'generated' ? 'success' : localGenerationMutation.data?.status === 'blocked' ? 'danger' : 'accent',
                    },
                  ]}
                />

                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Local path surface</p>
                  <p className="mt-3 break-all text-sm font-semibold text-[color:var(--text)]">
                    {localGenerationMutation.data?.output_path ?? (outputPath.trim() || 'No output path selected')}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">Existing directories are rejected by the backend before writing.</p>
                </div>
              </div>

              {localGenerationMutation.data ? (
                <div className="grid gap-4">
                  {localGenerationMutation.data.failures.length ? (
                    <div className="rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-black/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Safe failure handling</p>
                      <div className="mt-3 grid gap-2">
                        {localGenerationMutation.data.failures.map((failure) => (
                          <p key={failure.code} className="text-sm leading-5 text-[color:var(--text)]">{failure.message}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">File System Snapshot</p>
                    <div className="mt-3 grid gap-2">
                      {localGenerationMutation.data.file_map.files.length ? (
                        localGenerationMutation.data.file_map.files.map((file) => (
                          <div key={file.relative_path} className="flex items-center justify-between gap-4 rounded-lg bg-black/10 px-3 py-2 text-sm">
                            <span className="break-all text-[color:var(--text)]">{file.relative_path}</span>
                            <span className="shrink-0 text-xs text-[color:var(--muted)]">{file.size_bytes} bytes</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[color:var(--muted)]">No files generated.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Artifacts</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {localGenerationMutation.data.artifacts.length ? (
                        localGenerationMutation.data.artifacts.map((artifact) => <Badge key={artifact.id}>{artifact.relative_path}</Badge>)
                      ) : (
                        <Badge>no artifacts</Badge>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Generation trace</p>
                    <div className="mt-3 grid gap-2">
                      {localGenerationMutation.data.trace.map((item) => (
                        <p key={`${item.step}-${item.status}-${item.timestamp}`} className="text-sm leading-5 text-[color:var(--muted)]">
                          <span className="font-semibold text-[color:var(--text)]">{item.step}</span> / {item.status}: {item.message}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>

            <Card className="space-y-5 p-5" data-testid="generated-file-explorer-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Generated File Explorer</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">Local project inspection</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    Browse generated files and preview text content only. Project code is not executed, framed, installed, or opened in a runtime.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{generatedFilesQuery.data ? `${generatedFilesQuery.data.file_count} files` : 'not indexed'}</Badge>
                  <Badge>{generatedFilesQuery.data?.security.status ?? 'safe state'}</Badge>
                </div>
              </div>

              {generatedFilesQuery.isLoading ? (
                <CardLoading className="p-0 shadow-none" />
              ) : generatedFilesQuery.isError ? (
                generatedFilesNotReady ? (
                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-5" data-testid="generated-files-empty-state">
                    <p className="text-sm font-semibold text-[color:var(--text)]">Project not generated yet</p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                      Run local generation before indexing files, preparing a ZIP, or previewing generated content.
                    </p>
                  </div>
                ) : (
                  <PageError
                    title="Generated files unavailable"
                    description={getApiErrorMessage(generatedFilesQuery.error, 'Generated files cannot be indexed yet. Run local generation first or reconnect the backend.')}
                    onRetry={() => void generatedFilesQuery.refetch()}
                    className="p-4"
                  />
                )
              ) : generatedFilesQuery.data ? (
                <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">File tree</p>
                      <span className="text-xs text-[color:var(--muted)]">{formatBytes(generatedFilesQuery.data.total_size_bytes)}</span>
                    </div>
                    <div className="mt-3 grid max-h-[420px] gap-1 overflow-auto pr-1">
                      {generatedTreeEntries.length ? (
                        generatedTreeEntries.map((entry) => {
                          const depth = Math.max(0, entry.relative_path.split('/').length - 1);
                          const selected = selectedGeneratedPath === entry.relative_path;
                          const content = (
                            <>
                              <GeneratedFileIcon path={entry.relative_path} kind={entry.kind} />
                              <span className="min-w-0 flex-1 truncate text-left">{entry.relative_path.split('/').at(-1)}</span>
                              {entry.kind === 'file' ? <span className="text-xs text-[color:var(--muted)]">{formatBytes(entry.size_bytes)}</span> : null}
                            </>
                          );
                          return entry.kind === 'file' ? (
                            <button
                              key={entry.relative_path}
                              type="button"
                              aria-label={`Select generated file ${entry.relative_path}`}
                              onClick={() => setSelectedGeneratedPath(entry.relative_path)}
                              className={`focus-ring flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${selected ? 'bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[color:var(--text)]' : 'bg-white/[0.03] text-[color:var(--muted)] hover:bg-white/[0.07] hover:text-[color:var(--text)]'}`}
                              style={{ paddingLeft: `${12 + Math.min(depth, 4) * 16}px` }}
                            >
                              {content}
                            </button>
                          ) : (
                            <div
                              key={entry.relative_path}
                              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[color:var(--text)]"
                              style={{ paddingLeft: `${12 + Math.min(depth, 4) * 16}px` }}
                            >
                              {content}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-[color:var(--muted)]">No generated files indexed.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Preview State</p>
                        <p className="mt-2 break-all text-sm font-semibold text-[color:var(--text)]">
                          {selectedGeneratedPath ?? 'No file selected'}
                        </p>
                      </div>
                      <Badge>text only</Badge>
                    </div>

                    <div className="mt-4 min-h-[280px] rounded-lg border border-white/10 bg-black/20 p-4">
                      {!selectedGeneratedPath ? (
                        <p className="text-sm text-[color:var(--muted)]">Select a generated file to inspect text preview.</p>
                      ) : selectedFilePreviewQuery.isLoading ? (
                        <CardLoading className="p-0 shadow-none" />
                      ) : selectedFilePreviewQuery.isError ? (
                        <PageError
                          title="Preview unavailable"
                          description={getApiErrorMessage(selectedFilePreviewQuery.error, 'Generated file preview failed safely.')}
                          className="p-4"
                        />
                      ) : selectedFilePreviewQuery.data?.preview_supported ? (
                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[color:var(--text)]">
                          {selectedFilePreviewQuery.data.content}
                        </pre>
                      ) : (
                        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
                          <Code2 className="h-8 w-8 text-[color:var(--muted)]" aria-hidden />
                          <p className="text-sm font-semibold text-[color:var(--text)]">Unsupported preview</p>
                          <p className="max-w-sm text-sm leading-6 text-[color:var(--muted)]">
                            {selectedFilePreviewQuery.data?.unsupported_reason ?? 'This generated file cannot be previewed as text.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4" data-testid="generated-download-section">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Download Section</p>
                    <h3 className="mt-2 text-lg font-semibold text-[color:var(--text)]">Secure ZIP package</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                      Prepares a ZIP from the generated project directory only, filtering secret-like files and never packaging the LDCN OS root.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{preparedDownload ? formatBytes(preparedDownload.zip_size_bytes) : 'no zip'}</Badge>
                    <Badge>{preparedDownload ? `${preparedDownload.file_count} files` : 'not prepared'}</Badge>
                    <Badge>{preparedDownload?.security.status ?? generatedFilesQuery.data?.security.status ?? 'safe state'}</Badge>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => prepareDownloadMutation.mutate()}
                    disabled={prepareDownloadMutation.isPending || !generatedFilesQuery.data?.file_count}
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    {prepareDownloadMutation.isPending ? 'Preparing Download' : 'Prepare Download'}
                  </Button>
                  {preparedDownload ? (
                    <a
                      href={downloadHref}
                      download
                      className="focus-ring micro-interaction inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[color:var(--text)] hover:bg-white/10"
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      Download ZIP
                    </a>
                  ) : null}
                </div>

                {prepareDownloadMutation.isError ? (
                  <PageError
                    title="Download preparation unavailable"
                    description={getApiErrorMessage(prepareDownloadMutation.error, 'Secure ZIP preparation failed safely.')}
                    className="mt-4 p-4"
                  />
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    ['Generated files indexed', generatedFilesQuery.isSuccess],
                    ['Secure ZIP prepared', Boolean(preparedDownload)],
                    ['Download ready', Boolean(preparedDownload)],
                    ['Preview blocked for binary/large file', previewBlocked],
                  ].map(([label, ready]) => (
                    <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-sm font-semibold text-[color:var(--text)]">{label}</p>
                      <p className="mt-1 text-xs text-[color:var(--muted)]">{ready ? 'ready' : 'waiting'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <VisualizationCockpit
              payload={engineeringPayload}
              offlineMessage="System design visualization is offline for this persisted project snapshot."
            />

            <ArchitecturalGraphCanvas
              payload={architecturalGraphPayload}
              snapshot={projectQuery.data.architectural_graph_snapshot ?? null}
              title="Graph Snapshot"
              offlineMessage="Architectural graph preview is offline for this persisted project snapshot."
            />
          </div>

          <div className="grid gap-4">
            <ComplexityRadar
              title="Architecture burden"
              score={projectQuery.data.blueprint_snapshot.complexity_profile.overall_score}
              axes={[
                { label: 'Learning curve', value: projectQuery.data.blueprint_snapshot.complexity_profile.learning_curve === 'low' ? 26 : projectQuery.data.blueprint_snapshot.complexity_profile.learning_curve === 'medium' ? 54 : 82 },
                { label: 'Effort', value: projectQuery.data.blueprint_snapshot.complexity_profile.implementation_effort === 'low' ? 28 : projectQuery.data.blueprint_snapshot.complexity_profile.implementation_effort === 'medium' ? 56 : 84 },
                { label: 'Infrastructure', value: projectQuery.data.blueprint_snapshot.complexity_profile.infrastructure_cost === 'low' ? 30 : projectQuery.data.blueprint_snapshot.complexity_profile.infrastructure_cost === 'medium' ? 58 : 86 },
                { label: 'Maintenance', value: projectQuery.data.blueprint_snapshot.complexity_profile.maintenance_cost === 'low' ? 28 : projectQuery.data.blueprint_snapshot.complexity_profile.maintenance_cost === 'medium' ? 55 : 82 },
                { label: 'Risk', value: projectQuery.data.blueprint_snapshot.complexity_profile.risk_level === 'low' ? 20 : projectQuery.data.blueprint_snapshot.complexity_profile.risk_level === 'medium' ? 48 : 80 },
              ]}
            />

            <EngineeringReadinessPanel
              readiness={engineeringReadinessQuery.data ?? null}
              team={teamProfileQuery.data ?? null}
              delivery={deliveryEstimateQuery.data ?? null}
              isLoading={engineeringReadinessQuery.isLoading || teamProfileQuery.isLoading || deliveryEstimateQuery.isLoading}
              errorMessage={
                engineeringReadinessQuery.isError || teamProfileQuery.isError || deliveryEstimateQuery.isError
                  ? 'Engineering readiness services are offline for this persisted project snapshot.'
                  : null
              }
            />

            <DeploymentPathSurface
              title="Gatekeeper result"
              steps={[
                {
                  label: 'Decision',
                  detail: formatStatus(projectQuery.data.gatekeeper_snapshot.decision),
                  tone:
                    projectQuery.data.gatekeeper_snapshot.decision === 'blocked'
                      ? 'danger'
                      : projectQuery.data.gatekeeper_snapshot.decision === 'approved_with_warnings'
                        ? 'warning'
                        : 'success',
                },
                {
                  label: 'Checks',
                  detail: `${projectQuery.data.gatekeeper_snapshot.checks.length} checks evaluated`,
                  tone: 'accent',
                },
                {
                  label: 'Blockers and warnings',
                  detail: `${projectQuery.data.gatekeeper_snapshot.blockers.length} blockers / ${projectQuery.data.gatekeeper_snapshot.warnings.length} warnings`,
                  tone:
                    projectQuery.data.gatekeeper_snapshot.blockers.length > 0
                      ? 'danger'
                      : projectQuery.data.gatekeeper_snapshot.warnings.length > 0
                        ? 'warning'
                        : 'success',
                },
              ]}
            />

            <LDCNContextPanel
              context={{
                route: `/projects/${projectQuery.data.project_id}`,
                page_title: projectQuery.data.project_name,
                current_phase: 'Readiness insight',
                pipeline: {
                  route: `/projects/${projectQuery.data.project_id}`,
                  phase: 'Project detail',
                  status:
                    projectQuery.data.readiness_status === 'blocked' || projectQuery.data.status === 'generation_blocked'
                      ? 'blocked'
                      : projectQuery.data.readiness_status === 'failed'
                        ? 'degraded'
                        : 'ready',
                  readiness_label: formatStatus(projectQuery.data.readiness_status),
                  project_id: projectQuery.data.project_id,
                  detail: 'Reserved project readiness insight placeholder.',
                },
                status:
                  projectQuery.data.readiness_status === 'blocked' || projectQuery.data.status === 'generation_blocked'
                    ? 'blocked'
                    : projectQuery.data.readiness_status === 'failed'
                      ? 'warning'
                      : 'observing',
                summary: 'Reserved project intelligence surface for future LDCN guidance.',
                project_id: projectQuery.data.project_id,
                suggestions: [
                  {
                    id: `project-${projectQuery.data.project_id}-review`,
                    action: 'review_blueprint',
                    label: 'Review blueprint',
                    summary: 'Reserved for future blueprint explanation on the project detail surface.',
                    reserved: true,
                  },
                ],
              }}
            />

            <Card className="space-y-4 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Selected modules</p>
              <div className="flex flex-wrap gap-2">
                {projectQuery.data.selected_business_modules.length ? (
                  projectQuery.data.selected_business_modules.map((item) => <Badge key={item}>{item}</Badge>)
                ) : (
                  <p className="text-sm text-[color:var(--muted)]">None</p>
                )}
              </div>

              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Selected endpoints</p>
              <div className="flex flex-wrap gap-2">
                {projectQuery.data.selected_endpoints.length ? (
                  projectQuery.data.selected_endpoints.map((item) => <Badge key={item}>{item}</Badge>)
                ) : (
                  <p className="text-sm text-[color:var(--muted)]">None</p>
                )}
              </div>

              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Selected capabilities</p>
              <div className="flex flex-wrap gap-2">
                {projectQuery.data.selected_capabilities.length ? (
                  projectQuery.data.selected_capabilities.map((item) => <Badge key={item}>{item}</Badge>)
                ) : (
                  <p className="text-sm text-[color:var(--muted)]">None</p>
                )}
              </div>
            </Card>

            <ActionLink href="/projects" variant="secondary" className="w-fit">
              Back to projects
            </ActionLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
