'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Code2, Download, FileArchive, FileCode2, FileJson, FileText, Folder, GitBranch, ListChecks, ShieldCheck } from 'lucide-react';

import { LDCNContextPanel } from '@/components/ldcn/ldcn-context-panel';
import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
import { useGeneratedProjectQuality } from '@/hooks/use-generated-project-quality';
import { usePrepareDownload } from '@/hooks/use-prepare-download';
import { useBackendGenerationPreview, useBackendGenerationRun, useBackendGenerationTemplates } from '@/hooks/use-backend-generation';
import { useLocalGeneration } from '@/hooks/use-local-generation';
import { useGitExport } from '@/hooks/use-git-export';
import { useCreateRepository, useGitProviderConnection } from '@/hooks/use-git-providers';
import { useRecommendedSkills } from '@/hooks/use-skills';
import { useTemplateDetail } from '@/hooks/use-templates';
import { useDeliveryEstimate } from '@/hooks/use-delivery-estimate';
import { useEngineeringReadiness } from '@/hooks/use-engineering-readiness';
import { useTeamProfile } from '@/hooks/use-team-profile';
import { useLocale } from '@/hooks/use-locale';
import { ApiClientError, downloadAuthenticated } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useLDCNStore } from '@/stores/use-ldcn-store';
import { useAuthStore } from '@/stores/use-auth-store';
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
  const { t } = useLocale();
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
  const backendGenerationPreviewMutation = useBackendGenerationPreview();
  const backendGenerationRunMutation = useBackendGenerationRun();
  const backendGenerationTemplatesQuery = useBackendGenerationTemplates();
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
      has_generated_project: Boolean(localGenerationMutation.data?.status === 'generated' || backendGenerationRunMutation.data?.status === 'generated'),
    };
  }, [backendGenerationRunMutation.data?.status, localGenerationMutation.data?.status, projectQuery.data]);
  const recommendedSkillsQuery = useRecommendedSkills(projectSkillSelection);
  const generatedFilesQuery = useGeneratedFiles(projectId);
  const [outputPath, setOutputPath] = useState('');
  const [backendOutputPath, setBackendOutputPath] = useState('');
  const [selectedGeneratedPath, setSelectedGeneratedPath] = useState<string | null>(null);
  const selectedFilePreviewQuery = useGeneratedFileContent(projectId, selectedGeneratedPath);
  const prepareDownloadMutation = usePrepareDownload(projectId);
  const generatedProjectQualityMutation = useGeneratedProjectQuality(projectId);
  const gitExportMutation = useGitExport();
  const createRepositoryMutation = useCreateRepository();
  const [gitProvider, setGitProvider] = useState<'github' | 'gitlab'>('github');
  const [gitNamespace, setGitNamespace] = useState('');
  const [gitRepoName, setGitRepoName] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [gitVisibility, setGitVisibility] = useState<'private' | 'public'>('private');
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const githubConnection = useGitProviderConnection('github', isAdmin);
  const gitlabConnection = useGitProviderConnection('gitlab', isAdmin);
  const activeGitConnection = gitProvider === 'github' ? githubConnection.data : gitlabConnection.data;
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
    const quality = generatedProjectQualityMutation.data;
    const hasSecurityFinding = Boolean(quality?.security_findings.length);
    const hasMissingFile = Boolean(quality?.missing_files.length);
    const effectiveReadiness = handoff?.handoff_readiness;
    const readinessState =
      hasSecurityFinding ||
      localGeneration?.status === 'blocked' ||
      effectiveReadiness === 'blocked' || projectQuery.data.readiness_status === 'blocked' || projectQuery.data.status === 'generation_blocked'
        ? 'blocked'
        : hasMissingFile || quality?.failed || generatedProjectQualityMutation.isPending || localGenerationMutation.isPending || effectiveReadiness === 'incomplete' || projectQuery.data.readiness_status === 'failed'
          ? 'warning'
          : 'observing';
    const handoffSummary =
      generatedProjectQualityMutation.isPending
        ? 'Generated project quality validation running'
        : hasSecurityFinding
          ? 'Security finding detected'
          : hasMissingFile
            ? 'Missing file detected'
            : quality?.passed
              ? 'Generated project quality validated'
              : localGenerationMutation.isPending
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
  }, [
    generatedProjectQualityMutation.data,
    generatedProjectQualityMutation.isPending,
    handoffMutation.data,
    localGenerationMutation.data,
    localGenerationMutation.isPending,
    projectQuery.data,
    setContext,
    setPresenceState,
  ]);

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

  const backendGenerationPayload = () => {
    if (!projectQuery.data) return null;
    const framework = projectQuery.data.technology_graph.framework.id;
    const profileId =
      framework === 'spring_boot'
        ? 'basic_rest_api'
        : framework === 'nestjs'
          ? 'basic_api'
          : 'basic_api';
    const capabilities = [
      projectQuery.data.selected_capabilities.includes('authentication') ? 'jwt' : null,
      projectQuery.data.blueprint_snapshot.infrastructure_profile.selected_component_ids.includes('postgresql') ? 'postgresql' : 'sqlite',
      'health',
      framework === 'spring_boot' ? 'openapi' : 'swagger',
      framework === 'spring_boot' ? 'validation' : null,
    ].filter((item): item is 'jwt' | 'postgresql' | 'sqlite' | 'health' | 'openapi' | 'swagger' | 'validation' => Boolean(item));

    return {
      project_id: projectQuery.data.project_id,
      target: {
        language: projectQuery.data.technology_graph.language.id,
        framework,
        output_path: backendOutputPath.trim() || `generated-projects/active/backend-${projectQuery.data.project_id}`,
        project_name: projectQuery.data.project_name,
      },
      profile: {
        profile_id: profileId,
        capabilities,
        database: capabilities.includes('postgresql') ? 'postgresql' : framework === 'spring_boot' ? 'h2' : 'sqlite',
        complexity: profileId.includes('crud') ? 'crud' : 'basic',
      },
    };
  };

  const previewBackendGeneration = () => {
    const payload = backendGenerationPayload();
    if (!payload) return;
    backendGenerationPreviewMutation.mutate(payload);
  };

  const runBackendGeneration = () => {
    const payload = backendGenerationPayload();
    if (!payload) return;
    backendGenerationRunMutation.mutate(payload);
  };

  const runGeneratedProjectQuality = () => {
    if (!projectId) return;
    generatedProjectQualityMutation.mutate();
  };

  const repositoryPayload = () => {
    if (!projectQuery.data || !gitNamespace.trim()) return null;
    return {
      provider: gitProvider,
      namespace: gitNamespace.trim(),
      repo_name: gitRepoName.trim() || projectQuery.data.project_name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''),
      visibility: gitVisibility,
      branch: gitBranch.trim() || 'main',
    } as const;
  };

  const createRepository = () => {
    const payload = repositoryPayload();
    if (payload) createRepositoryMutation.mutate(payload);
  };

  const runGitExport = () => {
    const payload = repositoryPayload();
    if (!projectQuery.data || !payload) return;
    gitExportMutation.mutate({
      ...payload,
      project_id: projectQuery.data.project_id,
      commit_message: 'Initial commit generated by LDCN OS',
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
  const requirements = projectQuery.data?.blueprint_snapshot.project_requirements;
  const projectRequirementsComplete = Boolean(
    requirements?.project_goal &&
      requirements.business_context &&
      requirements.target_users.length &&
      requirements.business_rules.length &&
      requirements.entities.length &&
      requirements.workflows.length &&
      requirements.constraints.length &&
      requirements.delivery_target,
  );
  const exportReadiness = [
    { label: t('projectDetail.export.requirementsComplete'), ready: projectRequirementsComplete },
    { label: t('projectDetail.export.blueprintValid'), ready: Boolean(projectQuery.data?.blueprint_snapshot) },
    { label: t('projectDetail.export.architectureValidated'), ready: Boolean(projectQuery.data?.architectural_graph_snapshot && projectQuery.data?.gatekeeper_snapshot) },
    { label: t('projectDetail.export.generationComplete'), ready: Boolean(generatedFilesQuery.data?.file_count) },
  ] as const;
  const exportReady = exportReadiness.every((item) => item.ready);
  const generatedFilesNotReady =
    generatedFilesQuery.error instanceof ApiClientError && generatedFilesQuery.error.status === 409;
  const previewBlocked =
    Boolean(selectedFilePreviewQuery.data && !selectedFilePreviewQuery.data.preview_supported) ||
    selectedFilePreviewQuery.isError;

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t('projectDetail.title')}
        description={t('projectDetail.description')}
      />

      {projectQuery.isLoading ? (
        <Card className="space-y-4 p-6">
          <CardLoading className="p-0 shadow-none" />
          <CardLoading className="p-0 shadow-none" />
        </Card>
      ) : projectQuery.isError ? (
        <Card className="p-6">
          <PageError
            title={t('projectDetail.unavailable')}
            description={getApiErrorMessage(projectQuery.error, t('projectDetail.unavailableDetail'))}
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
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.blueprintLineage')}</p>
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
                    title={t('projectDetail.technologyGraph')}
                    nodes={[
                      {
                        label: t('projectDetail.language'),
                        value: projectQuery.data.technology_graph.language.name,
                        detail: t('projectDetail.ecosystem', { value: projectQuery.data.technology_graph.language.ecosystem }),
                        tone: 'accent',
                      },
                      {
                        label: t('projectDetail.runtime'),
                        value: projectQuery.data.technology_graph.runtime.name,
                        detail: t('projectDetail.runtimeSegment'),
                        tone: 'accent2',
                      },
                      {
                        label: t('projectDetail.framework'),
                        value: projectQuery.data.technology_graph.framework.name,
                        detail: t('projectDetail.frameworkTopology'),
                        tone: 'success',
                      },
                      {
                        label: t('projectDetail.architecture'),
                        value: projectQuery.data.technology_graph.architecture.name,
                        detail: t('projectDetail.archetypeValue', { value: projectQuery.data.archetype_id }),
                        tone: 'muted',
                      },
                    ]}
                    className="bg-black/10"
                  />

                  <ReadinessRing
                    title={t('projectDetail.readinessRing')}
                    value={getReadinessScore(projectQuery.data.readiness_status)}
                    label={formatStatus(projectQuery.data.readiness_status)}
                    caption={t('projectDetail.readinessDetail')}
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
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.snapshotSummary')}</p>
                <SummaryRow label={t('projectDetail.locale')} value={projectQuery.data.locale} />
                <SummaryRow label={t('projectDetail.generationMode')} value={formatStatus(projectQuery.data.generation_mode)} />
                <SummaryRow label={t('projectDetail.architecture')} value={projectQuery.data.technology_graph.architecture.name} />
                <SummaryRow label={t('projectDetail.archetype')} value={projectQuery.data.archetype_id} />
                <SummaryRow label={t('projectDetail.readiness')} value={formatStatus(projectQuery.data.readiness_status)} />
              </Card>

              <Card className="space-y-4 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.blueprintSummary')}</p>
                <SummaryRow label={t('projectDetail.complexity')} value={`${projectQuery.data.blueprint_snapshot.complexity_profile.overall_score}`} />
                <SummaryRow label={t('projectDetail.risk')} value={projectQuery.data.blueprint_snapshot.complexity_profile.risk_level} />
                <SummaryRow label={t('projectDetail.recommendations')} value={`${projectQuery.data.blueprint_snapshot.recommendations.length}`} />
                <SummaryRow label={t('projectDetail.errors')} value={`${projectQuery.data.blueprint_snapshot.validation.errors.length}`} />
                <SummaryRow label={t('common.warnings')} value={`${projectQuery.data.blueprint_snapshot.validation.warnings.length}`} />
              </Card>

              <Card className="space-y-4 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.promptMasterSummary')}</p>
                <SummaryRow label={t('projectDetail.sections')} value={`${projectQuery.data.prompt_master_snapshot.sections.length}`} />
                <SummaryRow label={t('common.warnings')} value={`${projectQuery.data.prompt_master_snapshot.validation.warnings.length}`} />
                <SummaryRow label={t('projectDetail.sourceValid')} value={projectQuery.data.prompt_master_snapshot.source_blueprint_valid ? t('common.yes') : t('common.no')} />
                <SummaryRow label={t('projectDetail.containsSecrets')} value={projectQuery.data.prompt_master_snapshot.trace.contains_secrets ? t('common.yes') : t('common.no')} />
                <SummaryRow label={t('projectDetail.compiled')} value={t('projectDetail.persisted')} />
              </Card>
            </div>

            <Card className="space-y-4 p-5" data-testid="project-template-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.templateUsed')}</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">
                    {localGenerationMutation.data?.template_name ?? generatedTemplateQuery.data?.name ?? t('projectDetail.noTemplate')}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    {t('projectDetail.templateDescription')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{generatedTemplateQuery.data?.version ? `v${generatedTemplateQuery.data.version}` : t('projectDetail.versionPending')}</Badge>
                  <Badge>{generatedTemplateQuery.data?.maturity ?? t('projectDetail.maturityPending')}</Badge>
                  <Badge>{generatedTemplateId ?? t('projectDetail.templatePending')}</Badge>
                </div>
              </div>

              {generatedTemplateQuery.isError ? (
                <PageError
                  title={t('projectDetail.templateUnavailable')}
                  description={getApiErrorMessage(generatedTemplateQuery.error, t('projectDetail.templateUnavailableDetail'))}
                  className="p-4"
                />
              ) : generatedTemplateQuery.data ? (
                <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
                  <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <SummaryRow label={t('projectDetail.category')} value={generatedTemplateQuery.data.category} />
                    <SummaryRow label={t('projectDetail.complexity')} value={generatedTemplateQuery.data.complexity} />
                    <SummaryRow label={t('projectDetail.capabilities')} value={`${generatedTemplateQuery.data.capabilities.length}`} />
                    <SummaryRow label={t('projectDetail.frameworks')} value={generatedTemplateQuery.data.supported_frameworks.join(', ')} />
                  </div>
                  <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-sm font-semibold text-[color:var(--text)]">{t('projectDetail.changelog')}</p>
                    {generatedTemplateQuery.data.changelog.slice(0, 3).map((entry) => (
                      <div key={`${entry.version}-${entry.date}`} className="text-sm leading-6 text-[color:var(--muted)]">
                        <span className="font-semibold text-[color:var(--text)]">v{entry.version}</span> / {entry.date}: {entry.changes.join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-black/10 p-4 text-sm leading-6 text-[color:var(--muted)]">
                  {t('projectDetail.runGenerationForTemplate')}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                {[
                  [t('projectDetail.templateCompatibility'), Boolean(generatedTemplateQuery.data)],
                  [t('projectDetail.templateRecommended'), Boolean(generatedTemplateId)],
                  [t('projectDetail.templateMaturity'), Boolean(generatedTemplateQuery.data?.maturity)],
                ].map(([label, ready]) => (
                  <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-sm font-semibold text-[color:var(--text)]">{label}</p>
                    <p className="mt-1 text-xs text-[color:var(--muted)]">{ready ? t('status.ready') : t('projectDetail.waiting')}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="space-y-4 p-5" data-testid="available-skills-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.availableSkills')}</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{t('projectDetail.operationalSkills')}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    {t('projectDetail.skillsDescription')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{t('projectDetail.unlockedCount', { count: recommendedSkillsQuery.data?.filter((skill) => skill.unlocked).length ?? 0 })}</Badge>
                  <Badge>{t('projectDetail.skillsSynchronized')}</Badge>
                </div>
              </div>
              {recommendedSkillsQuery.isError ? (
                <PageError
                  title={t('projectDetail.skillsUnavailable')}
                  description={getApiErrorMessage(recommendedSkillsQuery.error, t('projectDetail.skillsUnavailableDetail'))}
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
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.handoffTitle')}</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{t('projectDetail.handoffPreview')}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    {t('projectDetail.handoffDescription')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {handoffMutation.data ? (
                    <Badge>{formatStatus(handoffMutation.data.handoff_readiness)}</Badge>
                  ) : (
                    <Badge>{t('projectDetail.notPrepared')}</Badge>
                  )}
                  <Badge>{t('projectDetail.generationDisabled')}</Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="primary" onClick={prepareHandoff} disabled={handoffMutation.isPending || !projectRequirementsComplete}>
                  {handoffMutation.isPending ? t('projectDetail.preparingHandoff') : t('projectDetail.prepareHandoff')}
                </Button>
                <Button type="button" variant="secondary" disabled>
                  {t('projectDetail.generateProject')}
                </Button>
              </div>
              {!projectRequirementsComplete ? (
                <p className="rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-4 text-sm text-[color:var(--warning)]">
                  {t('projectDetail.completeRequirements')}
                </p>
              ) : null}

              {handoffMutation.isError ? (
                <PageError
                  title={t('projectDetail.handoffUnavailable')}
                  description={getApiErrorMessage(handoffMutation.error, t('projectDetail.handoffUnavailableDetail'))}
                  onRetry={prepareHandoff}
                  className="p-4"
                />
              ) : null}

              {handoffMutation.data ? (
                <div className="grid gap-4">
                  <ReadinessRing
                    title={t('projectDetail.handoffReadiness')}
                    value={handoffMutation.data.handoff_readiness === 'ready' ? 96 : handoffMutation.data.handoff_readiness === 'blocked' ? 18 : 52}
                    label={formatStatus(handoffMutation.data.handoff_readiness)}
                    caption={t('projectDetail.handoffReadinessDetail')}
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
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.blockers')}</p>
                      <div className="mt-3 grid gap-2">
                        {handoffMutation.data.blockers.length ? (
                          handoffMutation.data.blockers.map((item) => (
                            <p key={`${item.source}-${item.code}`} className="text-sm leading-5 text-[color:var(--text)]">{item.message}</p>
                          ))
                        ) : (
                          <p className="text-sm text-[color:var(--muted)]">{t('projectDetail.noBlockers')}</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('common.warnings')}</p>
                      <div className="mt-3 grid gap-2">
                        {handoffMutation.data.warnings.length ? (
                          handoffMutation.data.warnings.slice(0, 5).map((item) => (
                            <p key={`${item.source}-${item.code}`} className="text-sm leading-5 text-[color:var(--text)]">{item.message}</p>
                          ))
                        ) : (
                          <p className="text-sm text-[color:var(--muted)]">{t('projectDetail.noWarnings')}</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.safeTrace')}</p>
                      <div className="mt-3 grid gap-2 text-sm text-[color:var(--muted)]">
                        <p>{handoffMutation.data.trace.generated_at}</p>
                        <p>{handoffMutation.data.trace.operations.join(' / ')}</p>
                        <p>{t('projectDetail.containsSecrets')}: {handoffMutation.data.trace.contains_secrets ? t('common.yes') : t('common.no')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.artifactsIncluded')}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {handoffMutation.data.artifacts.map((artifact) => (
                        <Badge key={artifact.id}>{artifact.included ? artifact.label : t('projectDetail.missingArtifact', { label: artifact.label })}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>

            <Card className="space-y-5 p-5" data-testid="local-generation-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.localGen.eyebrow')}</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{t('projectDetail.localGen.title')}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    {t('projectDetail.localGen.description')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{localGenerationMutation.data?.status ?? 'idle'}</Badge>
                  <Badge>{t('projectDetail.localGen.badge')}</Badge>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  value={outputPath}
                  onChange={(event) => setOutputPath(event.target.value)}
                  placeholder={`generated-projects/active/${projectQuery.data.project_id}`}
                  aria-label={t('projectDetail.localGen.outputPathLabel')}
                />
                <Button
                  type="button"
                  variant="primary"
                  onClick={runLocalGeneration}
                  disabled={localGenerationMutation.isPending || !outputPath.trim() || !projectRequirementsComplete}
                >
                  {localGenerationMutation.isPending ? t('projectDetail.localGen.generatingLocally') : t('projectDetail.localGen.generateLocally')}
                </Button>
              </div>

              {localGenerationMutation.isError ? (
                <PageError
                  title={t('projectDetail.localGen.unavailable')}
                  description={getApiErrorMessage(localGenerationMutation.error, t('projectDetail.localGen.unavailableDetail'))}
                  onRetry={runLocalGeneration}
                  className="p-4"
                />
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <DeploymentPathSurface
                  title={t('projectDetail.localGen.pipelineTitle')}
                  steps={[
                    {
                      label: t('projectDetail.localGen.step.readinessHandoff'),
                      detail: localGenerationMutation.data?.trace.find((item) => item.step === 'handoff_validation')?.message ?? t('projectDetail.localGen.step.awaitingRequest'),
                      tone: localGenerationMutation.data?.handoff_readiness === 'ready' ? 'success' : localGenerationMutation.data ? 'warning' : 'accent',
                    },
                    {
                      label: t('projectDetail.localGen.step.templateResolution'),
                      detail: localGenerationMutation.data?.template_name ?? t('projectDetail.localGen.step.templatePending'),
                      tone: localGenerationMutation.data?.template_id ? 'success' : 'accent2',
                    },
                    {
                      label: t('projectDetail.localGen.step.artifactAssembly'),
                      detail: localGenerationMutation.data ? t('projectDetail.localGen.step.artifactsAssembled', { count: localGenerationMutation.data.artifacts.length }) : t('projectDetail.localGen.step.noArtifacts'),
                      tone: localGenerationMutation.data?.status === 'generated' ? 'success' : localGenerationMutation.data?.status === 'blocked' ? 'danger' : 'accent',
                    },
                  ]}
                />

                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.localGen.pathSurface')}</p>
                  <p className="mt-3 break-all text-sm font-semibold text-[color:var(--text)]">
                    {localGenerationMutation.data?.output_path ?? (outputPath.trim() || t('projectDetail.localGen.noOutputPath'))}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{t('projectDetail.localGen.existingDirWarning')}</p>
                </div>
              </div>

              {localGenerationMutation.data ? (
                <div className="grid gap-4">
                  {localGenerationMutation.data.failures.length ? (
                    <div className="rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-black/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.localGen.safeFailures')}</p>
                      <div className="mt-3 grid gap-2">
                        {localGenerationMutation.data.failures.map((failure) => (
                          <p key={failure.code} className="text-sm leading-5 text-[color:var(--text)]">{failure.message}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.localGen.fileSystemSnapshot')}</p>
                    <div className="mt-3 grid gap-2">
                      {localGenerationMutation.data.file_map.files.length ? (
                        localGenerationMutation.data.file_map.files.map((file) => (
                          <div key={file.relative_path} className="flex items-center justify-between gap-4 rounded-lg bg-black/10 px-3 py-2 text-sm">
                            <span className="break-all text-[color:var(--text)]">{file.relative_path}</span>
                            <span className="shrink-0 text-xs text-[color:var(--muted)]">{file.size_bytes} bytes</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[color:var(--muted)]">{t('projectDetail.localGen.noFiles')}</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.localGen.artifacts')}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {localGenerationMutation.data.artifacts.length ? (
                        localGenerationMutation.data.artifacts.map((artifact) => <Badge key={artifact.id}>{artifact.relative_path}</Badge>)
                      ) : (
                        <Badge>{t('projectDetail.localGen.noArtifactsBadge')}</Badge>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.localGen.generationTrace')}</p>
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

            <Card className="space-y-5 p-5" data-testid="backend-generation-explorer-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.backendGen.eyebrow')}</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{t('projectDetail.backendGen.title')}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    {t('projectDetail.backendGen.description')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{backendGenerationRunMutation.data?.status ?? backendGenerationPreviewMutation.data?.status ?? 'idle'}</Badge>
                  <Badge>{projectQuery.data.technology_graph.framework.name}</Badge>
                  <Badge>{backendGenerationTemplatesQuery.data ? t('projectDetail.backendGen.templatesBadge', { count: String(backendGenerationTemplatesQuery.data.templates.filter((item) => item.implemented).length) }) : t('projectDetail.backendGen.templatesPending')}</Badge>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <Input
                  value={backendOutputPath}
                  onChange={(event) => setBackendOutputPath(event.target.value)}
                  placeholder={`generated-projects/active/backend-${projectQuery.data.project_id}`}
                  aria-label={t('projectDetail.backendGen.outputPathLabel')}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={previewBackendGeneration}
                  disabled={backendGenerationPreviewMutation.isPending || !projectRequirementsComplete}
                >
                  {backendGenerationPreviewMutation.isPending ? t('projectDetail.backendGen.previewing') : t('projectDetail.backendGen.preview')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={runBackendGeneration}
                  disabled={backendGenerationRunMutation.isPending || !projectRequirementsComplete}
                >
                  {backendGenerationRunMutation.isPending ? t('projectDetail.backendGen.generatingBackend') : t('projectDetail.backendGen.generateBackend')}
                </Button>
              </div>

              {backendGenerationPreviewMutation.isError || backendGenerationRunMutation.isError ? (
                <PageError
                  title={t('projectDetail.backendGen.unavailable')}
                  description={getApiErrorMessage(
                    backendGenerationRunMutation.error ?? backendGenerationPreviewMutation.error,
                    t('projectDetail.backendGen.unavailableDetail'),
                  )}
                  className="p-4"
                />
              ) : null}

              {backendGenerationRunMutation.data?.status === 'blocked' || backendGenerationPreviewMutation.data?.status === 'blocked' ? (
                <div className="rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-black/10 p-4" data-testid="backend-generation-blocked-state">
                  <p className="text-sm font-semibold text-[color:var(--text)]">{t('projectDetail.backendGen.generationDisabled')}</p>
                  <div className="mt-3 grid gap-2">
                    {(backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.validation.failures.map((failure) => (
                      <p key={failure.code} className="text-sm leading-5 text-[color:var(--muted)]">{failure.message}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              {backendGenerationPreviewMutation.data || backendGenerationRunMutation.data ? (
                <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.backendGen.generatedMetrics')}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {[
                        [t('projectDetail.backendGen.frameworkUsed'), (backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.metrics.framework],
                        [t('projectDetail.backendGen.templateUsed'), (backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.template_name],
                        [t('projectDetail.backendGen.complexity'), (backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.metrics.complexity],
                        [t('projectDetail.backendGen.fileCount'), `${(backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.metrics.file_count ?? 0}`],
                        [t('projectDetail.backendGen.projectSize'), formatBytes((backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.metrics.total_size_bytes ?? 0)],
                        [t('projectDetail.backendGen.securityGate'), (backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.validation.security_gate],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                          <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">{label}</p>
                          <p className="mt-2 break-words text-sm font-semibold text-[color:var(--text)]">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.backendGen.generatedStructure')}</p>
                        <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">
                          {(backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.output_path ?? t('projectDetail.backendGen.previewOnly')}
                        </p>
                      </div>
                      <Badge>{(backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.validation.handoff_readiness ?? t('projectDetail.backendGen.handoffPending')}</Badge>
                    </div>
                    <div className="mt-3 grid max-h-[280px] gap-1 overflow-auto pr-1">
                      {((backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.file_tree ?? []).length ? (
                        (backendGenerationRunMutation.data ?? backendGenerationPreviewMutation.data)?.file_tree.map((path) => (
                          <div key={path} className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-sm text-[color:var(--muted)]">
                            <GeneratedFileIcon path={path} kind={path.includes('.') ? 'file' : 'directory'} />
                            <span className="break-all">{path}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[color:var(--muted)]" data-testid="backend-generation-empty-state">{t('projectDetail.backendGen.noFilesYet')}</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-5" data-testid="backend-generation-empty-state">
                  <p className="text-sm font-semibold text-[color:var(--text)]">{t('projectDetail.backendGen.noManifestTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('projectDetail.backendGen.noManifestDesc')}</p>
                </div>
              )}
            </Card>

            <Card className="space-y-5 p-5" data-testid="generated-project-quality-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.qualityGate.eyebrow')}</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{t('projectDetail.qualityGate.title')}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    {t('projectDetail.qualityGate.description')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{generatedProjectQualityMutation.data?.passed ? 'passed' : generatedProjectQualityMutation.data?.failed ? 'failed' : 'not run'}</Badge>
                  <Badge>{generatedProjectQualityMutation.data ? `${generatedProjectQualityMutation.data.score}/100` : t('projectDetail.qualityGate.scorePending')}</Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="primary"
                  onClick={runGeneratedProjectQuality}
                  disabled={generatedProjectQualityMutation.isPending || !projectId}
                >
                  <ListChecks className="h-4 w-4" aria-hidden />
                  {generatedProjectQualityMutation.isPending ? t('projectDetail.qualityGate.running') : t('projectDetail.qualityGate.run')}
                </Button>
              </div>

              {generatedProjectQualityMutation.isError ? (
                <PageError
                  title={t('projectDetail.qualityGate.unavailable')}
                  description={getApiErrorMessage(generatedProjectQualityMutation.error, t('projectDetail.qualityGate.unavailableDetail'))}
                  className="p-4"
                />
              ) : null}

              {generatedProjectQualityMutation.data ? (
                <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.qualityGate.qualityScore')}</p>
                    <div className="mt-4 flex items-end gap-3">
                      <p className="text-4xl font-semibold text-[color:var(--text)]">{generatedProjectQualityMutation.data.score}</p>
                      <p className="pb-1 text-sm text-[color:var(--muted)]">{t('projectDetail.qualityGate.scoreOutOf')}</p>
                    </div>
                    <div className="mt-4 grid gap-2">
                      {[
                        [t('projectDetail.qualityGate.warnings'), generatedProjectQualityMutation.data.warnings.length],
                        [t('projectDetail.qualityGate.missingFiles'), generatedProjectQualityMutation.data.missing_files.length],
                        [t('projectDetail.qualityGate.securityFindings'), generatedProjectQualityMutation.data.security_findings.length],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
                          <span className="text-[color:var(--muted)]">{label}</span>
                          <span className="font-semibold text-[color:var(--text)]">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.qualityGate.checklist')}</p>
                    <div className="mt-3 grid max-h-[320px] gap-2 overflow-auto pr-1">
                      {generatedProjectQualityMutation.data.checks.map((check) => (
                        <div key={check.id} className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/10 p-3">
                          {check.status === 'passed' ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 text-[color:var(--success)]" aria-hidden />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-4 w-4 text-[color:var(--danger)]" aria-hidden />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[color:var(--text)]">{check.label}</p>
                            <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{check.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.qualityGate.warnings')}</p>
                    <div className="mt-3 grid gap-2">
                      {generatedProjectQualityMutation.data.warnings.length ? (
                        generatedProjectQualityMutation.data.warnings.map((item) => <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>)
                      ) : (
                        <p className="text-sm text-[color:var(--muted)]">{t('projectDetail.qualityGate.noWarnings')}</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.qualityGate.missingAndSecurity')}</p>
                    <div className="mt-3 grid gap-2">
                      {generatedProjectQualityMutation.data.missing_files.map((item) => (
                        <p key={`missing-${item}`} className="break-all text-sm text-[color:var(--muted)]">{t('projectDetail.qualityGate.missingFileDetected', { path: item })}</p>
                      ))}
                      {generatedProjectQualityMutation.data.security_findings.map((item) => (
                        <p key={`${item.code}-${item.path ?? 'root'}`} className="break-all text-sm text-[color:var(--muted)]">
                          {item.path ? t('projectDetail.qualityGate.securityFindingPath', { message: item.message, path: item.path }) : t('projectDetail.qualityGate.securityFindingDetected', { message: item.message })}
                        </p>
                      ))}
                      {!generatedProjectQualityMutation.data.missing_files.length && !generatedProjectQualityMutation.data.security_findings.length ? (
                        <p className="text-sm text-[color:var(--muted)]">{t('projectDetail.qualityGate.validated')}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-5" data-testid="generated-project-quality-empty-state">
                  <p className="text-sm font-semibold text-[color:var(--text)]">{t('projectDetail.qualityGate.notRunTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('projectDetail.qualityGate.notRunDesc')}</p>
                </div>
              )}
            </Card>

            <Card className="space-y-5 p-5" data-testid="generated-file-explorer-section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.fileExplorer.eyebrow')}</p>
                  <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{t('projectDetail.fileExplorer.title')}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                    {t('projectDetail.fileExplorer.description')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{generatedFilesQuery.data ? t('projectDetail.fileExplorer.filesBadge', { count: String(generatedFilesQuery.data.file_count) }) : t('projectDetail.fileExplorer.notIndexed')}</Badge>
                  <Badge>{generatedFilesQuery.data?.security.status ?? t('projectDetail.fileExplorer.safeState')}</Badge>
                </div>
              </div>

              {generatedFilesQuery.isLoading ? (
                <CardLoading className="p-0 shadow-none" />
              ) : generatedFilesQuery.isError ? (
                generatedFilesNotReady ? (
                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-5" data-testid="generated-files-empty-state">
                    <p className="text-sm font-semibold text-[color:var(--text)]">{t('projectDetail.fileExplorer.notGeneratedTitle')}</p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                      {t('projectDetail.fileExplorer.notGeneratedDesc')}
                    </p>
                  </div>
                ) : (
                  <PageError
                    title={t('projectDetail.fileExplorer.unavailable')}
                    description={getApiErrorMessage(generatedFilesQuery.error, t('projectDetail.fileExplorer.unavailableDetail'))}
                    onRetry={() => void generatedFilesQuery.refetch()}
                    className="p-4"
                  />
                )
              ) : generatedFilesQuery.data ? (
                <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.fileExplorer.fileTree')}</p>
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
                              aria-label={t('projectDetail.fileExplorer.selectFileAria', { path: entry.relative_path })}
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
                        <p className="text-sm text-[color:var(--muted)]">{t('projectDetail.fileExplorer.noFilesIndexed')}</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.fileExplorer.previewState')}</p>
                        <p className="mt-2 break-all text-sm font-semibold text-[color:var(--text)]">
                          {selectedGeneratedPath ?? t('projectDetail.fileExplorer.noFileSelected')}
                        </p>
                      </div>
                      <Badge>{t('projectDetail.fileExplorer.textOnly')}</Badge>
                    </div>

                    <div className="mt-4 min-h-[280px] rounded-lg border border-white/10 bg-black/20 p-4">
                      {!selectedGeneratedPath ? (
                        <p className="text-sm text-[color:var(--muted)]">{t('projectDetail.fileExplorer.selectFile')}</p>
                      ) : selectedFilePreviewQuery.isLoading ? (
                        <CardLoading className="p-0 shadow-none" />
                      ) : selectedFilePreviewQuery.isError ? (
                        <PageError
                          title={t('projectDetail.fileExplorer.previewUnavailable')}
                          description={getApiErrorMessage(selectedFilePreviewQuery.error, t('projectDetail.fileExplorer.previewUnavailableDetail'))}
                          className="p-4"
                        />
                      ) : selectedFilePreviewQuery.data?.preview_supported ? (
                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[color:var(--text)]">
                          {selectedFilePreviewQuery.data.content}
                        </pre>
                      ) : (
                        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
                          <Code2 className="h-8 w-8 text-[color:var(--muted)]" aria-hidden />
                          <p className="text-sm font-semibold text-[color:var(--text)]">{t('projectDetail.fileExplorer.unsupportedTitle')}</p>
                          <p className="max-w-sm text-sm leading-6 text-[color:var(--muted)]">
                            {selectedFilePreviewQuery.data?.unsupported_reason ?? t('projectDetail.fileExplorer.unsupportedDesc')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {isAdmin ? (
              <div className="rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-4" data-testid="git-export-section">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.gitExport.eyebrow')}</p>
                <h3 className="mt-2 text-lg font-semibold text-[color:var(--text)]">{t('projectDetail.gitExport.title')}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                  {t('projectDetail.gitExport.description')}
                </p>
                <div className="mt-5 rounded-[var(--radius-xl)] border border-white/10 bg-black/15 p-4" data-testid="export-readiness">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--text)]">{t('projectDetail.gitExport.exportReadiness')}</p>
                      <p className="mt-1 text-xs text-[color:var(--muted)]">{t('projectDetail.gitExport.exportReadinessDesc')}</p>
                    </div>
                    <Badge>{exportReady ? t('projectDetail.gitExport.ready') : t('projectDetail.gitExport.actionRequired')}</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {exportReadiness.map((item) => (
                      <div key={item.label} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-[color:var(--text)]">
                        <span className={`h-2.5 w-2.5 rounded-full ${item.ready ? 'bg-[color:var(--success)]' : 'bg-[color:var(--warning)]'}`} />
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <label className="grid gap-2 text-sm text-[color:var(--muted)]">{t('projectDetail.gitExport.providerLabel')}<Select value={gitProvider} onChange={(event) => setGitProvider(event.target.value as 'github' | 'gitlab')}><option value="github">GitHub</option><option value="gitlab">GitLab</option></Select></label>
                  <Input aria-label={t('projectDetail.gitExport.namespaceLabel')} placeholder={t('projectDetail.gitExport.namespacePlaceholder')} value={gitNamespace} onChange={(event) => setGitNamespace(event.target.value)} />
                  <Input aria-label={t('projectDetail.gitExport.repoNameLabel')} placeholder={t('projectDetail.gitExport.repoNamePlaceholder')} value={gitRepoName} onChange={(event) => setGitRepoName(event.target.value)} />
                  <Input aria-label={t('projectDetail.gitExport.branchLabel')} placeholder="main" value={gitBranch} onChange={(event) => setGitBranch(event.target.value)} />
                  <label className="grid gap-2 text-sm text-[color:var(--muted)]">{t('projectDetail.gitExport.visibilityLabel')}<Select value={gitVisibility} onChange={(event) => setGitVisibility(event.target.value as 'private' | 'public')}><option value="private">{t('projectDetail.gitExport.private')}</option><option value="public">{t('projectDetail.gitExport.public')}</option></Select></label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  <SummaryRow label={t('projectDetail.gitExport.providerLabel')} value={gitProvider === 'github' ? 'GitHub' : 'GitLab'} />
                  <SummaryRow label={t('projectDetail.gitExport.repositoryLabel')} value={gitRepoName || projectQuery.data.project_name} />
                  <SummaryRow label={t('projectDetail.gitExport.branchLabel')} value={gitBranch || 'main'} />
                  <SummaryRow label={t('projectDetail.gitExport.visibilityLabel')} value={gitVisibility} />
                  <SummaryRow label={t('projectDetail.gitExport.statusLabel')} value={createRepositoryMutation.data?.status ?? (activeGitConnection?.status === 'connected' ? t('projectDetail.gitExport.connected') : t('projectDetail.gitExport.connectionRequired'))} />
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {activeGitConnection?.status !== 'connected' ? <ActionLink href="/settings#integrations" variant="primary">{t('projectDetail.gitExport.connectProvider', { provider: gitProvider === 'github' ? 'GitHub' : 'GitLab' })}</ActionLink> : null}
                  <Button type="button" variant="secondary" disabled={createRepositoryMutation.isPending || activeGitConnection?.status !== 'connected' || !gitNamespace.trim()} onClick={createRepository}>{t('projectDetail.gitExport.createRepository')}</Button>
                  <Button type="button" variant="primary" disabled={gitExportMutation.isPending || !exportReady || !gitNamespace.trim() || createRepositoryMutation.data?.status !== 'created'} onClick={runGitExport}>
                    <GitBranch className="h-4 w-4" aria-hidden />
                    {t('projectDetail.gitExport.exportToProvider', { provider: gitProvider === 'github' ? 'GitHub' : 'GitLab' })}
                  </Button>
                </div>
                {createRepositoryMutation.data ? <p className="mt-4 text-sm text-[color:var(--muted)]">{t('projectDetail.gitExport.repoCreated')} <a className="text-[color:var(--accent)] underline" href={createRepositoryMutation.data.repo_url} target="_blank" rel="noreferrer">{createRepositoryMutation.data.repo_url}</a></p> : null}
                {createRepositoryMutation.isError ? <PageError title={t('projectDetail.gitExport.repositoryCreationFailed')} description={getApiErrorMessage(createRepositoryMutation.error, t('projectDetail.gitExport.repositoryCreationFailedDetail'))} className="mt-4 p-4" /> : null}
                {gitExportMutation.data ? (
                  <p className="mt-4 text-sm text-[color:var(--muted)]">
                    {t('projectDetail.gitExport.exportStatus')} <strong className="text-[color:var(--text)]">{gitExportMutation.data.status}</strong>
                    {gitExportMutation.data.repo_url ? ` · ${gitExportMutation.data.repo_url}` : ''}
                    {gitExportMutation.data.failure_reason ? ` · ${gitExportMutation.data.failure_reason}` : ''}
                  </p>
                ) : null}
                {gitExportMutation.data?.blockers.map((blocker) => (
                  <div key={blocker.code} className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_7%,transparent)] p-4">
                    <p className="font-semibold text-[color:var(--text)]">{blocker.problem}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">{blocker.reason}</p>
                    <ActionLink href={blocker.action_href} variant="secondary" className="mt-3">{blocker.action_label}</ActionLink>
                  </div>
                ))}
                {gitExportMutation.isError ? (
                  <PageError title={t('projectDetail.gitExport.exportUnavailable')} description={getApiErrorMessage(gitExportMutation.error, t('projectDetail.gitExport.exportUnavailableDetail'))} className="mt-4 p-4" />
                ) : null}
              </div>
              ) : (
                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('settings.integrations.restrictedEyebrow')}</p>
                  <h3 className="mt-2 text-lg font-semibold text-[color:var(--text)]">{t('settings.integrations.restrictedTitle')}</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                    {t('settings.integrations.restrictedDescription')}
                  </p>
                </div>
              )}

              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4" data-testid="generated-download-section">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.download.eyebrow')}</p>
                    <h3 className="mt-2 text-lg font-semibold text-[color:var(--text)]">{t('projectDetail.download.title')}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                      {t('projectDetail.download.description')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{preparedDownload ? formatBytes(preparedDownload.zip_size_bytes) : t('projectDetail.download.noZip')}</Badge>
                    <Badge>{preparedDownload ? t('projectDetail.download.filesBadge', { count: String(preparedDownload.file_count) }) : t('projectDetail.download.notPrepared')}</Badge>
                    <Badge>{preparedDownload?.security.status ?? generatedFilesQuery.data?.security.status ?? t('projectDetail.download.safeState')}</Badge>
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
                    {prepareDownloadMutation.isPending ? t('projectDetail.download.preparing') : t('projectDetail.download.prepare')}
                  </Button>
                  {preparedDownload ? (
                    <button
                      type="button"
                      onClick={() => void downloadAuthenticated(
                        apiEndpoints.localGeneration.download(projectId ?? ''),
                        `${projectId ?? 'ldcn-project'}.zip`,
                      )}
                      className="focus-ring micro-interaction inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[color:var(--text)] hover:bg-white/10"
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      {t('projectDetail.download.downloadZip')}
                    </button>
                  ) : null}
                </div>

                {prepareDownloadMutation.isError ? (
                  <PageError
                    title={t('projectDetail.download.unavailable')}
                    description={getApiErrorMessage(prepareDownloadMutation.error, t('projectDetail.download.unavailableDetail'))}
                    className="mt-4 p-4"
                  />
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    [t('projectDetail.download.filesIndexed'), generatedFilesQuery.isSuccess],
                    [t('projectDetail.download.zipPrepared'), Boolean(preparedDownload)],
                    [t('projectDetail.download.downloadReady'), Boolean(preparedDownload)],
                    [t('projectDetail.download.previewBlocked'), previewBlocked],
                  ].map(([label, ready]) => (
                    <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-sm font-semibold text-[color:var(--text)]">{label}</p>
                      <p className="mt-1 text-xs text-[color:var(--muted)]">{ready ? t('projectDetail.download.ready') : t('projectDetail.download.waiting')}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <VisualizationCockpit
              payload={engineeringPayload}
              offlineMessage={t('projectDetail.visualization.offlineMessage')}
            />

            <ArchitecturalGraphCanvas
              payload={architecturalGraphPayload}
              snapshot={projectQuery.data.architectural_graph_snapshot ?? null}
              title={t('projectDetail.graph.title')}
              offlineMessage={t('projectDetail.graph.offlineMessage')}
            />
          </div>

          <div className="grid gap-4">
            <ComplexityRadar
              title={t('projectDetail.complexityRadar.title')}
              score={projectQuery.data.blueprint_snapshot.complexity_profile.overall_score}
              axes={[
                { label: t('projectDetail.complexityRadar.axisLearningCurve'), value: projectQuery.data.blueprint_snapshot.complexity_profile.learning_curve === 'low' ? 26 : projectQuery.data.blueprint_snapshot.complexity_profile.learning_curve === 'medium' ? 54 : 82 },
                { label: t('projectDetail.complexityRadar.axisEffort'), value: projectQuery.data.blueprint_snapshot.complexity_profile.implementation_effort === 'low' ? 28 : projectQuery.data.blueprint_snapshot.complexity_profile.implementation_effort === 'medium' ? 56 : 84 },
                { label: t('projectDetail.complexityRadar.axisInfrastructure'), value: projectQuery.data.blueprint_snapshot.complexity_profile.infrastructure_cost === 'low' ? 30 : projectQuery.data.blueprint_snapshot.complexity_profile.infrastructure_cost === 'medium' ? 58 : 86 },
                { label: t('projectDetail.complexityRadar.axisMaintenance'), value: projectQuery.data.blueprint_snapshot.complexity_profile.maintenance_cost === 'low' ? 28 : projectQuery.data.blueprint_snapshot.complexity_profile.maintenance_cost === 'medium' ? 55 : 82 },
                { label: t('projectDetail.complexityRadar.axisRisk'), value: projectQuery.data.blueprint_snapshot.complexity_profile.risk_level === 'low' ? 20 : projectQuery.data.blueprint_snapshot.complexity_profile.risk_level === 'medium' ? 48 : 80 },
              ]}
            />

            <EngineeringReadinessPanel
              readiness={engineeringReadinessQuery.data ?? null}
              team={teamProfileQuery.data ?? null}
              delivery={deliveryEstimateQuery.data ?? null}
              isLoading={engineeringReadinessQuery.isLoading || teamProfileQuery.isLoading || deliveryEstimateQuery.isLoading}
              errorMessage={
                engineeringReadinessQuery.isError || teamProfileQuery.isError || deliveryEstimateQuery.isError
                  ? t('projectDetail.engineeringReadiness.offlineMessage')
                  : null
              }
            />

            <DeploymentPathSurface
              title={t('projectDetail.gatekeeperSurface.title')}
              steps={[
                {
                  label: t('projectDetail.gatekeeperSurface.decisionStep'),
                  detail: formatStatus(projectQuery.data.gatekeeper_snapshot.decision),
                  tone:
                    projectQuery.data.gatekeeper_snapshot.decision === 'blocked'
                      ? 'danger'
                      : projectQuery.data.gatekeeper_snapshot.decision === 'approved_with_warnings'
                        ? 'warning'
                        : 'success',
                },
                {
                  label: t('projectDetail.gatekeeperSurface.checksStep'),
                  detail: t('projectDetail.gatekeeperSurface.checksEvaluated', { count: projectQuery.data.gatekeeper_snapshot.checks.length }),
                  tone: 'accent',
                },
                {
                  label: t('projectDetail.gatekeeperSurface.blockersAndWarnings'),
                  detail: t('projectDetail.gatekeeperSurface.blockersWarningsSummary', { blockers: projectQuery.data.gatekeeper_snapshot.blockers.length, warnings: projectQuery.data.gatekeeper_snapshot.warnings.length }),
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
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.selectedModules')}</p>
              <div className="flex flex-wrap gap-2">
                {projectQuery.data.selected_business_modules.length ? (
                  projectQuery.data.selected_business_modules.map((item) => <Badge key={item}>{item}</Badge>)
                ) : (
                  <p className="text-sm text-[color:var(--muted)]">{t('projectDetail.none')}</p>
                )}
              </div>

              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.selectedEndpoints')}</p>
              <div className="flex flex-wrap gap-2">
                {projectQuery.data.selected_endpoints.length ? (
                  projectQuery.data.selected_endpoints.map((item) => <Badge key={item}>{item}</Badge>)
                ) : (
                  <p className="text-sm text-[color:var(--muted)]">{t('projectDetail.none')}</p>
                )}
              </div>

              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('projectDetail.selectedCapabilities')}</p>
              <div className="flex flex-wrap gap-2">
                {projectQuery.data.selected_capabilities.length ? (
                  projectQuery.data.selected_capabilities.map((item) => <Badge key={item}>{item}</Badge>)
                ) : (
                  <p className="text-sm text-[color:var(--muted)]">{t('projectDetail.none')}</p>
                )}
              </div>
            </Card>

            <ActionLink href="/projects" variant="secondary" className="w-fit">
              {t('projectDetail.backToProjects')}
            </ActionLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
