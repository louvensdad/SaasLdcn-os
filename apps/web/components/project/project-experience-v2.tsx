'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Code2,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  GitBranch,
  GitPullRequestArrow,
  Layers3,
  Maximize2,
  Minimize2,
  Monitor,
  Package,
  Play,
  RefreshCw,
  Rocket,
  Server,
  ShieldCheck,
  Smartphone,
  Square,
  Tablet,
  TerminalSquare,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { ArchitecturalGraphCanvas } from '@/components/architectural-graph/architectural-graph-canvas';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { ProjectDeleteButton } from '@/components/project/project-delete-button';
import { useProject } from '@/hooks/use-projects';
import { useGeneratedFiles } from '@/hooks/use-generated-files';
import { useGeneratedFileContent } from '@/hooks/use-generated-file-content';
import { useGeneratedProjectQuality } from '@/hooks/use-generated-project-quality';
import { usePrepareDownload } from '@/hooks/use-prepare-download';
import { useGitProviderConnection } from '@/hooks/use-git-providers';
import { livePreviewClient, type ConsoleLogEntry, type LivePreviewSession } from '@/lib/api/live-preview';
import { useLocale } from '@/hooks/use-locale';
import { useAuthStore } from '@/stores/use-auth-store';
import { useLDCNStore } from '@/stores/use-ldcn-store';
import { ApiClientError, downloadAuthenticated } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/errors';
import { apiEndpoints } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import type {
  GeneratedProjectFilesResponse,
  GeneratedProjectQualityResponse,
  Project,
} from '@/lib/api/types';

type GeneratedProjectFileEntry = GeneratedProjectFilesResponse['files'][number];

type DeviceMode = 'desktop' | 'tablet' | 'mobile';
type VerificationStatus = 'verified' | 'missing' | 'pending';
type TwinNodeKind = 'client' | 'frontend' | 'gateway' | 'backend' | 'cache' | 'queue' | 'database' | 'storage' | 'cloud';

interface VerificationItem {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly status: VerificationStatus;
  readonly evidence: readonly string[];
}

interface TwinNode {
  readonly id: string;
  readonly label: string;
  readonly kind: TwinNodeKind;
  readonly technology: string;
  readonly responsibility: string;
  readonly dependencies: readonly string[];
  readonly files: readonly string[];
  readonly logs: readonly string[];
}

interface DerivedMetrics {
  readonly files: number;
  readonly endpoints: number;
  readonly controllers: number;
  readonly services: number;
  readonly entities: number;
  readonly repositories: number;
  readonly components: number;
  readonly pages: number;
  readonly routes: number;
  readonly migrations: number;
  readonly containers: number;
  readonly pipelines: number;
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

function buildDeviceModes(t: Translator): readonly { id: DeviceMode; label: string; icon: LucideIcon }[] {
  return [
    { id: 'desktop', label: t('projectXp.device.desktop'), icon: Monitor },
    { id: 'tablet', label: t('projectXp.device.tablet'), icon: Tablet },
    { id: 'mobile', label: t('projectXp.device.mobile'), icon: Smartphone },
  ];
}

function journeyLabels(t: (key: string) => string) {
  return [
    t('projectXp.journey.step.idea'),
    t('workflow.stages.promptMaster'),
    t('navigation.architect.label'),
    t('navigation.engineeringReview.label'),
    t('navigation.metaFactory.label'),
    t('navigation.engineeringLaboratory.label'),
    t('roadmap.filters.deploy'),
  ] as const;
}

// project.status only has coarse stage granularity (no separate "prompt master
// done" vs "architect done" states), so a status maps to the step the project
// is now WORKING ON (steps before it are done) rather than a 1:1 step index.
const STATUS_STAGE_INDEX: Partial<Record<Project['status'], number>> = {
  draft: 1,
  blueprint_ready: 3,
  gatekeeper_approved: 4,
  ready_for_generation: 4,
  generation_blocked: 4,
  generated: 5,
  failed: 1,
};

// Real journey progress derived from the project's own state (status +
// whether generated files/deploy-readiness were actually observed), instead
// of a constant that always rendered the same "done/done/done/current/pending"
// regardless of the project's actual stage.
function deriveJourneySteps(t: (key: string) => string, project: Project, generated: boolean, deployReady: boolean) {
  const labels = journeyLabels(t);
  const reached = deployReady ? labels.length : generated ? 5 : (STATUS_STAGE_INDEX[project.status] ?? 1);
  return labels.map((label, index) => [label, index < reached ? 'done' : index === reached ? 'current' : 'pending'] as const);
}

function introStages(t: (key: string) => string) {
  return [
    t('roadmap.groups.contracts'),
    t('roadmap.filters.backend'),
    t('roadmap.filters.frontend'),
    t('roadmap.filters.security'),
    t('projectXp.intro.stage.testing'),
    t('roadmap.filters.architecture'),
    t('projectXp.intro.stage.laboratory'),
    t('projectXp.intro.stage.deployReady'),
  ] as const;
}

function formatStatus(status: string) {
  return status.replaceAll('_', ' ');
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function includesAny(value: string, needles: readonly string[]) {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function fileEvidence(files: readonly GeneratedProjectFileEntry[], needles: readonly string[]) {
  return files
    .filter((file) => includesAny(file.relative_path, needles))
    .map((file) => file.relative_path)
    .slice(0, 6);
}

function pickPreviewFile(files: readonly GeneratedProjectFileEntry[]) {
  return files.find((file) => file.preview_supported && /(?:app\/page|pages\/index|index\.html|README\.md)/i.test(file.relative_path))
    ?? files.find((file) => file.preview_supported)
    ?? null;
}

function deriveCategory(t: Translator, project: Project) {
  const raw = [project.archetype_id, ...project.selected_business_modules, project.blueprint_snapshot.project_requirements?.business_context ?? '']
    .join(' ')
    .toLowerCase();
  if (includesAny(raw, ['clinic', 'medical', 'health', 'hospital', 'pacient'])) return t('projectXp.category.health');
  if (includesAny(raw, ['market', 'commerce', 'cart', 'order', 'delivery'])) return t('projectXp.category.marketplace');
  if (includesAny(raw, ['bank', 'finance', 'payment', 'pix', 'invoice'])) return t('projectXp.category.finance');
  if (includesAny(raw, ['erp', 'stock', 'inventory', 'warehouse'])) return t('projectXp.category.erp');
  return project.archetype_id || t('projectXp.category.digitalProduct');
}

function domainSignature(t: Translator, project: Project) {
  const category = deriveCategory(t, project).toLowerCase();
  if (category.includes(t('projectXp.category.health').toLowerCase())) return { title: t('projectXp.signature.health.title'), chips: [t('projectXp.signature.chip.agenda'), t('projectXp.signature.chip.patients'), t('projectXp.signature.chip.records'), t('projectXp.signature.chip.triage')] };
  if (category.includes(t('projectXp.category.marketplace').toLowerCase())) return { title: t('projectXp.signature.marketplace.title'), chips: [t('projectXp.signature.chip.catalog'), t('projectXp.signature.chip.orders'), t('projectXp.signature.chip.checkout'), t('projectXp.signature.chip.delivery')] };
  if (category.includes(t('projectXp.category.finance').toLowerCase())) return { title: t('projectXp.signature.finance.title'), chips: [t('projectXp.signature.chip.accounts'), t('projectXp.signature.chip.pix'), t('projectXp.signature.chip.statements'), t('projectXp.signature.chip.risk')] };
  if (category.includes(t('projectXp.category.erp').toLowerCase())) return { title: t('projectXp.signature.erp.title'), chips: [t('projectXp.signature.chip.stock'), t('projectXp.signature.chip.orders'), t('projectXp.signature.chip.reports'), t('projectXp.signature.chip.billing')] };
  return { title: t('projectXp.signature.default.title'), chips: [t('projectXp.signature.chip.frontend'), t('projectXp.signature.chip.backend'), t('projectXp.signature.chip.data'), t('projectXp.signature.chip.deploy')] };
}

function deriveMetrics(project: Project, filesData?: GeneratedProjectFilesResponse | null): DerivedMetrics {
  const files = filesData?.files ?? [];
  return {
    files: filesData?.file_count ?? 0,
    endpoints: project.selected_endpoints.length,
    controllers: fileEvidence(files, ['controller']).length,
    services: fileEvidence(files, ['service']).length,
    entities: fileEvidence(files, ['entity', 'model', 'schema']).length,
    repositories: fileEvidence(files, ['repository', 'repo']).length,
    components: fileEvidence(files, ['component', 'components/']).length,
    pages: fileEvidence(files, ['page.tsx', 'pages/', 'app/']).length,
    routes: fileEvidence(files, ['route.ts', 'routes', 'router']).length,
    migrations: fileEvidence(files, ['migration', 'migrations']).length,
    containers: fileEvidence(files, ['Dockerfile', 'compose']).length,
    pipelines: fileEvidence(files, ['.github/workflows', 'gitlab-ci', 'azure-pipelines']).length,
  };
}

function technologyVerification(t: Translator, project: Project, filesData?: GeneratedProjectFilesResponse | null, quality?: GeneratedProjectQualityResponse | null): VerificationItem[] {
  const files = filesData?.files ?? [];
  const filePaths = files.map((file) => file.relative_path);
  const checks = quality?.checks ?? [];
  const evidenceFromCheck = (id: string) => checks.filter((check) => check.id.includes(id) && check.status === 'passed').flatMap((check) => check.paths);
  const hasFiles = files.length > 0;
  const fromFiles = (needles: readonly string[]) => fileEvidence(files, needles);
  const status = (evidence: readonly string[]) => evidence.length > 0 ? 'verified' : hasFiles ? 'missing' : 'pending';
  const stack = project.technology_graph;
  const languageExt = stack.language.id === 'typescript' ? '.ts' : stack.language.id === 'python' ? '.py' : stack.language.id === 'java' ? '.java' : `.${stack.language.id}`;
  const items: VerificationItem[] = [
    { id: stack.language.id, label: stack.language.name, group: t('projectXp.verificationGroup.stack'), evidence: fromFiles([languageExt]), status: 'pending' },
    { id: stack.framework.id, label: stack.framework.name, group: t('projectXp.verificationGroup.stack'), evidence: [...fromFiles([stack.framework.id, stack.framework.name, 'package.json', 'pom.xml', 'requirements.txt']), ...evidenceFromCheck(stack.framework.id)], status: 'pending' },
    { id: 'docker', label: 'Docker', group: t('projectXp.verificationGroup.devops'), evidence: fromFiles(['Dockerfile', 'docker-compose', 'compose.yaml']), status: 'pending' },
    { id: 'tests', label: t('projectXp.verificationLabel.tests'), group: t('projectXp.verificationGroup.quality'), evidence: fromFiles(['test', 'spec', '__tests__']), status: 'pending' },
    { id: 'openapi', label: 'OpenAPI / Swagger', group: t('projectXp.verificationGroup.api'), evidence: fromFiles(['openapi', 'swagger']), status: 'pending' },
    ...project.selected_capabilities.map((capability) => ({ id: capability, label: capability, group: t('projectXp.verificationGroup.capabilities'), evidence: fromFiles([capability, capability.replaceAll('_', '-')]), status: 'pending' as VerificationStatus })),
    ...project.blueprint_snapshot.infrastructure_profile.selected_component_ids.map((component) => ({ id: component, label: component, group: t('projectXp.verificationGroup.infrastructure'), evidence: filePaths.filter((path) => includesAny(path, [component])).slice(0, 6), status: 'pending' as VerificationStatus })),
  ];
  return items.map((item) => ({ ...item, status: status(item.evidence) }));
}

function buildTwin(t: Translator, project: Project, filesData?: GeneratedProjectFilesResponse | null): TwinNode[] {
  const files = filesData?.files ?? [];
  const infra = project.blueprint_snapshot.infrastructure_profile.selected_component_ids;
  const has = (needles: readonly string[]) => fileEvidence(files, needles);
  const nodes: TwinNode[] = [
    { id: 'client', label: t('projectXp.twin.label.client'), kind: 'client', technology: t('projectXp.twin.tech.browserUser'), responsibility: t('projectXp.twin.responsibility.client'), dependencies: ['frontend'], files: [], logs: [t('projectXp.twin.log.client')] },
    { id: 'frontend', label: t('projectXp.twin.label.frontend'), kind: 'frontend', technology: project.technology_graph.framework.name, responsibility: t('projectXp.twin.responsibility.frontend'), dependencies: ['backend'], files: has(['app/', 'pages/', 'components/', 'src/']), logs: [t('projectXp.twin.log.frontend')] },
    { id: 'gateway', label: t('projectXp.twin.label.gateway'), kind: 'gateway', technology: t('projectXp.twin.tech.httpBoundary'), responsibility: t('projectXp.twin.responsibility.gateway'), dependencies: ['backend'], files: has(['route', 'router', 'controller', 'api']), logs: [t('projectXp.twin.log.gateway')] },
    { id: 'backend', label: t('projectXp.twin.label.backend'), kind: 'backend', technology: project.technology_graph.runtime.name, responsibility: t('projectXp.twin.responsibility.backend'), dependencies: infra, files: has(['service', 'controller', 'repository', 'main.', 'app.']), logs: [t('projectXp.twin.log.backend')] },
  ];
  if (infra.some((item) => includesAny(item, ['redis', 'cache']))) nodes.push({ id: 'redis', label: t('projectXp.twin.label.redis'), kind: 'cache', technology: 'Redis', responsibility: t('projectXp.twin.responsibility.redis'), dependencies: ['backend'], files: has(['redis']), logs: [t('projectXp.twin.log.redis')] });
  if (infra.some((item) => includesAny(item, ['rabbit', 'kafka', 'queue', 'sqs']))) nodes.push({ id: 'queue', label: t('projectXp.twin.label.queue'), kind: 'queue', technology: infra.find((item) => includesAny(item, ['rabbit', 'kafka', 'queue', 'sqs'])) ?? t('projectXp.twin.tech.queueFallback'), responsibility: t('projectXp.twin.responsibility.queue'), dependencies: ['backend'], files: has(['queue', 'rabbit', 'kafka']), logs: [t('projectXp.twin.log.queue')] });
  const database = infra.find((item) => includesAny(item, ['postgres', 'mysql', 'sqlite', 'mongo', 'database', 'db']));
  if (database) nodes.push({ id: 'database', label: t('projectXp.twin.label.database'), kind: 'database', technology: database, responsibility: t('projectXp.twin.responsibility.database'), dependencies: ['backend'], files: has(['migration', 'schema', 'entity', database]), logs: [t('projectXp.twin.log.database')] });
  const storage = infra.find((item) => includesAny(item, ['storage', 's3', 'blob']));
  if (storage) nodes.push({ id: 'storage', label: t('projectXp.twin.label.storage'), kind: 'storage', technology: storage, responsibility: t('projectXp.twin.responsibility.storage'), dependencies: ['backend'], files: has(['storage', 's3', 'blob']), logs: [t('projectXp.twin.log.storage')] });
  const cloud = infra.find((item) => includesAny(item, ['aws', 'azure', 'gcp', 'vercel', 'netlify', 'railway', 'render', 'fly']));
  nodes.push({ id: 'cloud', label: t('projectXp.twin.label.cloud'), kind: 'cloud', technology: cloud ?? t('projectXp.twin.tech.undefined'), responsibility: t('projectXp.twin.responsibility.cloud'), dependencies: ['frontend', 'backend'], files: has(['vercel', 'netlify', 'railway', 'render', 'Dockerfile', 'compose']), logs: [t('projectXp.twin.log.cloud')] });
  return nodes;
}

function panelGroups(t: Translator, project: Project, quality?: GeneratedProjectQualityResponse | null) {
  const checks = quality?.checks ?? [];
  return [
    { title: t('projectXp.panelTitle.architecture'), icon: Layers3, items: [project.technology_graph.architecture.name, t('projectXp.panelItem.modules', { count: project.selected_business_modules.length }), t('projectXp.panelItem.capabilities', { count: project.selected_capabilities.length })] },
    { title: t('projectXp.panelTitle.security'), icon: ShieldCheck, items: quality ? [t('projectXp.panelItem.securityFindings', { count: quality.security_findings.length }), t('projectXp.panelItem.missingFiles', { count: quality.missing_files.length })] : [t('projectXp.panelItem.gateNotRun')] },
    { title: t('projectXp.panelTitle.performance'), icon: Activity, items: [t('projectXp.panelItem.benchmarkNotConfigured'), t('projectXp.panelItem.p95Unavailable')] },
    { title: t('projectXp.panelTitle.cloud'), icon: Cloud, items: project.blueprint_snapshot.infrastructure_profile.selected_component_ids },
    { title: t('projectXp.panelTitle.database'), icon: Database, items: project.blueprint_snapshot.infrastructure_profile.selected_component_ids.filter((item) => includesAny(item, ['postgres', 'mysql', 'sqlite', 'mongo', 'database', 'db'])) },
    { title: t('projectXp.panelTitle.frontend'), icon: Monitor, items: [project.technology_graph.framework.name, t('projectXp.panelItem.endpointsPlanned', { count: project.selected_endpoints.length })] },
    { title: t('projectXp.panelTitle.backend'), icon: Server, items: [project.technology_graph.runtime.name, ...checks.filter((check) => check.category === 'structure').slice(0, 2).map((check) => check.label)] },
    { title: t('projectXp.panelTitle.devops'), icon: TerminalSquare, items: [t('projectXp.panelItem.secureDownload'), t('projectXp.panelItem.gitExport')] },
    { title: t('projectXp.panelTitle.observability'), icon: Activity, items: project.selected_capabilities.filter((capability) => includesAny(capability, ['observability', 'logs', 'metrics'])) },
  ];
}

function documentationFiles(filesData?: GeneratedProjectFilesResponse | null) {
  return (filesData?.files ?? []).filter((file) => /readme|openapi|swagger|docs|adr|diagram|changelog|database/i.test(file.relative_path));
}

function statusTone(status: VerificationStatus): BadgeTone {
  if (status === 'verified') return 'success';
  if (status === 'missing') return 'danger';
  return 'warning';
}

function verificationLabel(t: Translator, status: VerificationStatus) {
  if (status === 'verified') return t('projectXp.verification.verified');
  if (status === 'missing') return t('projectXp.verification.notFound');
  return t('projectXp.verification.awaitingFiles');
}

export function ProjectExperienceV2({ projectId }: { readonly projectId: string | null }) {
  const { t } = useLocale();
  const projectQuery = useProject(projectId);
  const generatedFilesQuery = useGeneratedFiles(projectId);
  const qualityMutation = useGeneratedProjectQuality(projectId);
  const prepareDownloadMutation = usePrepareDownload(projectId);
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const githubConnection = useGitProviderConnection('github', isAdmin);
  const gitlabConnection = useGitProviderConnection('gitlab', isAdmin);
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedTwinId, setSelectedTwinId] = useState('frontend');
  const [introVisible, setIntroVisible] = useState(false);
  const [qualityStarted, setQualityStarted] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);

  const DEVICE_MODES = useMemo(() => buildDeviceModes(t), [t]);
  const generatedFiles = useMemo(() => generatedFilesQuery.data?.files ?? [], [generatedFilesQuery.data?.files]);
  const selectedPreview = useGeneratedFileContent(projectId, selectedPath);
  const quality = qualityMutation.data;
  const project = projectQuery.data;

  useEffect(() => {
    if (navigator.webdriver) return;
    if (!projectId) return;
    const key = `ldcn-project-intro-${projectId}`;
    if (sessionStorage.getItem(key)) return;
    setIntroVisible(true);
    sessionStorage.setItem(key, 'seen');
    const timer = window.setTimeout(() => setIntroVisible(false), 2200);
    return () => window.clearTimeout(timer);
  }, [projectId]);

  useEffect(() => {
    if (!generatedFiles.length) {
      setSelectedPath(null);
      return;
    }
    if (selectedPath && generatedFiles.some((file) => file.relative_path === selectedPath)) return;
    setSelectedPath(pickPreviewFile(generatedFiles)?.relative_path ?? generatedFiles[0]?.relative_path ?? null);
  }, [generatedFiles, selectedPath]);

  useEffect(() => {
    if (!generatedFilesQuery.isSuccess || !generatedFilesQuery.data.file_count || qualityStarted || qualityMutation.isPending || qualityMutation.data) return;
    setQualityStarted(true);
    qualityMutation.mutate();
  }, [generatedFilesQuery.data, generatedFilesQuery.isSuccess, qualityMutation, qualityStarted]);

  useEffect(() => {
    if (!project) return;
    setPresenceState(project.readiness_status === 'blocked' ? 'blocked' : project.readiness_status === 'failed' ? 'warning' : 'observing');
    setContext({
      route: `/projects/${project.project_id}`,
      page_title: project.project_name,
      current_phase: 'Project Experience V2',
      status: project.readiness_status === 'blocked' ? 'blocked' : 'observing',
      summary: 'Project Experience V2: live preview, technology verification, architecture twin and deploy path.',
      project_id: project.project_id,
      pipeline: {
        route: `/projects/${project.project_id}`,
        phase: 'Project Experience V2',
        status: project.readiness_status === 'blocked' ? 'blocked' : project.readiness_status === 'failed' ? 'degraded' : 'ready',
        readiness_label: formatStatus(project.readiness_status),
        project_id: project.project_id,
        detail: 'Project experience organized around preview, verification, architecture and deploy.',
      },
      suggestions: [],
    });
  }, [project, setContext, setPresenceState]);

  const derived = useMemo(() => {
    if (!project) return null;
    const twin = buildTwin(t, project, generatedFilesQuery.data);
    return {
      category: deriveCategory(t, project),
      signature: domainSignature(t, project),
      metrics: deriveMetrics(project, generatedFilesQuery.data),
      verification: technologyVerification(t, project, generatedFilesQuery.data, quality),
      twin,
      selectedTwin: twin.find((node) => node.id === selectedTwinId) ?? twin[0],
      panels: panelGroups(t, project, quality),
      docs: documentationFiles(generatedFilesQuery.data),
    };
  }, [generatedFilesQuery.data, project, quality, selectedTwinId, t]);

  if (projectQuery.isLoading) return <CardLoading className="h-96" />;
  if (projectQuery.isError || !project || !derived) {
    return <PageError title={t('projectXp.unavailable')} description={getApiErrorMessage(projectQuery.error, t('projectDetail.unavailableDetail'))} onRetry={() => void projectQuery.refetch()} />;
  }

  const filesUnavailable = generatedFilesQuery.error instanceof ApiClientError;
  const previewContent = selectedPreview.data?.preview_supported ? selectedPreview.data.content : null;
  const previewFrameClass = { desktop: 'max-w-5xl aspect-[16/9]', tablet: 'max-w-2xl aspect-[4/3]', mobile: 'max-w-sm aspect-[9/16]' }[device];
  const generated = Boolean(generatedFilesQuery.data?.file_count);
  const deployReady = Boolean(quality?.passed && generatedFilesQuery.data?.security.status !== 'blocked');

  return (
    <div className="space-y-8 pb-16">
      {introVisible ? <CinematicIntro projectName={project.project_name} /> : null}
      <ProjectHeroV2 project={project} category={derived.category} signature={derived.signature} generated={generated} deployReady={deployReady} quality={quality} />

      <section id="live-preview" className="scroll-mt-24 space-y-4">
        <SectionTitle eyebrow="01" title={t('projectXp.preview.title')} description={t('projectXp.preview.descriptionFull')} />
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-[color:var(--border)] p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {DEVICE_MODES.map((mode) => {
                const Icon = mode.icon;
                return (
                  <button key={mode.id} type="button" onClick={() => setDevice(mode.id)} className={cn('focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm', device === mode.id ? 'border-[color:var(--accent)] text-[color:var(--accent)]' : 'border-[color:var(--border)] text-[color:var(--muted)]')}>
                    <Icon className="h-4 w-4" aria-hidden />{mode.label}
                  </button>
                );
              })}
            </div>
            <Badge tone={generated ? 'success' : 'warning'}>{generated ? t('projectXp.preview.filesIndexed', { count: generatedFiles.length }) : t('projectXp.preview.notGenerated')}</Badge>
          </div>
          {filesUnavailable ? (
            <InlineState title={t('projectXp.preview.unavailable')} detail={getApiErrorMessage(generatedFilesQuery.error, t('projectXp.preview.filesNotFound'))} />
          ) : generated ? (
            <div className="grid gap-0 xl:grid-cols-[300px_minmax(0,1fr)]">
              <FileRail files={generatedFiles} selectedPath={selectedPath} onSelect={setSelectedPath} />
              <div className="bg-[#05070a] p-4 md:p-8">
                <div className={cn('mx-auto overflow-hidden rounded-[28px] border border-white/15 bg-black shadow-2xl transition-all', previewFrameClass)}>
                  <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-2 text-xs ds-text-secondary">
                    <span>{selectedPath ?? t('projectXp.preview.noFileSelected')}</span>
                    <span>{selectedPreview.data?.content_type ?? t('projectXp.preview.loadingContentType')}</span>
                  </div>
                  {selectedPreview.isLoading ? (
                    <div className="grid h-full place-items-center text-sm ds-text-muted">{t('projectXp.preview.loading')}</div>
                  ) : previewContent ? (
                    selectedPath?.endsWith('.html') ? <iframe title={t('projectXp.preview.iframeTitle')} srcDoc={previewContent} className="h-full w-full bg-white" /> : <pre id="code" className="h-full overflow-auto p-5 text-xs leading-relaxed ds-text-primary">{previewContent}</pre>
                  ) : (
                    <div className="grid h-full place-items-center p-8 text-center text-sm ds-text-muted">{t('projectXp.preview.blocked')}</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <InlineState title={t('projectXp.preview.noIndex')} detail={t('projectXp.preview.noIndexDetail')} />
          )}
        </Card>
      </section>

      <section id="live-preview-runtime" className="scroll-mt-24 space-y-4">
        <SectionTitle
          eyebrow="01b"
          title={t('livePreview.sectionTitle')}
          description={t('livePreview.sectionDescription')}
        />
        <LivePreviewPanel projectId={project.project_id} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
        <div className="space-y-5">
          <SectionTitle eyebrow="02" title={t('projectXp.tech.title')} description={t('projectXp.tech.descriptionFull')} />
          <Card className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{derived.verification.map((item) => <VerificationRow key={`${item.group}-${item.id}`} item={item} />)}</div></Card>
        </div>
        <div className="space-y-5">
          <SectionTitle eyebrow="03" title={t('projectXp.health.title')} description={t('projectXp.health.descriptionFull')} />
          <Card className="grid gap-3 sm:grid-cols-2">
            <Metric label={t('projectXp.metric.files')} value={derived.metrics.files} />
            <Metric label={t('projectXp.metric.endpoints')} value={derived.metrics.endpoints} />
            <Metric label={t('projectXp.metric.warnings')} value={quality?.warnings.length ?? t('projectXp.metric.notChecked')} />
            <Metric label={t('projectXp.metric.qualityChecks')} value={quality?.checks.length ?? t('projectXp.metric.notChecked')} />
            <Metric label={t('projectXp.metric.tests')} value={derived.metrics.routes || t('projectXp.metric.notDetected')} />
            <Metric label={t('projectXp.metric.containers')} value={derived.metrics.containers} />
          </Card>
        </div>
      </section>

      <section className="space-y-5">
        <SectionTitle eyebrow="04" title={t('projectXp.arch.title')} description={t('projectXp.arch.descriptionFull')} />
        <Card className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-x-auto pb-3">
            <div className="flex min-w-[820px] items-center gap-3">
              {derived.twin.map((node, index) => (
                <div key={node.id} className="flex items-center gap-3">
                  <button type="button" onClick={() => setSelectedTwinId(node.id)} className={cn('focus-ring grid h-28 w-36 place-items-center rounded-[var(--radius-lg)] border p-3 text-center transition', selectedTwinId === node.id ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]' : 'border-[color:var(--border)] bg-white/[0.03] hover:bg-white/[0.06]')}>
                    <TwinIcon kind={node.kind} /><span className="mt-2 text-sm font-semibold text-[color:var(--text)]">{node.label}</span><span className="mt-1 line-clamp-1 text-xs text-[color:var(--muted)]">{node.technology}</span>
                  </button>
                  {index < derived.twin.length - 1 ? <ChevronRight className="h-5 w-5 text-[color:var(--muted-2)]" aria-hidden /> : null}
                </div>
              ))}
            </div>
          </div>
          <TwinDetails node={derived.selectedTwin} />
        </Card>
        {project.architectural_graph_snapshot ? (
          <ArchitecturalGraphCanvas
            snapshot={project.architectural_graph_snapshot}
            payload={null}
            title={t('projectDetail.graph.title')}
            offlineMessage={t('projectDetail.graph.offlineMessage')}
          />
        ) : null}
      </section>

      <section className="space-y-5">
        <SectionTitle eyebrow="05" title={t('projectXp.dashboard.title')} description={t('projectXp.dashboard.descriptionFull')} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{derived.panels.map((panel) => <DashboardPanel key={panel.title} {...panel} />)}</div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-5 border-[color-mix(in_srgb,var(--accent)_30%,var(--border))]">
          <SectionTitle eyebrow="06" title={t('projectXp.lab.title')} description={t('projectXp.lab.descriptionFull')} compact />
          <p className="text-sm leading-6 text-[color:var(--muted)]">{t('projectXp.lab.description')}</p>
          <LinkButton href={`/engineering-laboratory?projectId=${project.project_id}`} icon={TerminalSquare} large>{t('projectXp.lab.open')}</LinkButton>
        </Card>
        <Card id="deploy" className="space-y-5 scroll-mt-24">
          <SectionTitle eyebrow="07" title={t('projectXp.deploy.title')} description={t('projectXp.deploy.descriptionFull')} compact />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DeployItem label={t('projectXp.deployItem.github')} ready={githubConnection.data?.status === 'connected'} detail={githubConnection.data?.status ?? t('projectXp.deploy.connectInSettings')} />
            <DeployItem label={t('projectXp.deployItem.gitlab')} ready={gitlabConnection.data?.status === 'connected'} detail={gitlabConnection.data?.status ?? t('projectXp.deploy.connectInSettings')} />
            <DeployItem label={t('projectXp.deployItem.docker')} ready={derived.metrics.containers > 0} detail={derived.metrics.containers > 0 ? t('projectXp.deploy.artifactDetected') : t('projectXp.deploy.dockerfileMissing')} />
            {['AWS', 'Azure', 'Google', 'Railway', 'Render', 'Fly', 'Vercel', 'Netlify'].map((provider) => <DeployItem key={provider} label={provider} ready={derived.verification.some((item) => item.id.toLowerCase().includes(provider.toLowerCase()) && item.status === 'verified')} detail={t('projectXp.deploy.awaitingEvidence')} />)}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="primary" disabled={!generated || prepareDownloadMutation.isPending} onClick={() => prepareDownloadMutation.mutate()}><Download className="h-4 w-4" aria-hidden />{t('projectXp.deploy.prepareZip')}</Button>
            {prepareDownloadMutation.data ? <button type="button" onClick={() => void downloadAuthenticated(apiEndpoints.localGeneration.download(project.project_id), `${project.project_id}.zip`)} className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-[color:var(--text)]"><Download className="h-4 w-4" aria-hidden />{t('projectXp.deploy.downloadZip')}</button> : null}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="space-y-5"><SectionTitle eyebrow="08" title={t('projectXp.docs.title')} description={t('projectXp.docs.descriptionFull')} compact />{derived.docs.length ? <FileList files={derived.docs} /> : <InlineState title={t('projectXp.docs.notFound')} detail={t('projectXp.docs.notFoundDetail')} compact />}</Card>
        <Card className="space-y-5"><SectionTitle eyebrow="09" title={t('projectXp.logs.title')} description={t('projectXp.logs.descriptionFull')} compact /><LogLine label={t('projectXp.logs.projectCreated')} value={project.created_at} /><LogLine label={t('projectXp.logs.projectUpdated')} value={project.updated_at} /><LogLine label={t('projectXp.logs.fileIndex')} value={generated ? t('projectXp.logs.filesCount', { count: generatedFiles.length }) : t('projectXp.logs.noFilesIndexed')} /><LogLine label={t('projectXp.logs.qualityGate')} value={quality ? (quality.passed ? t('projectXp.logs.gatePassed') : t('projectXp.logs.gateFailed')) : t('projectXp.logs.gateNotRun')} /><p className="text-xs text-[color:var(--muted)]">{t('projectXp.logs.pendingSources')}</p></Card>
      </section>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle eyebrow="AI" title={t('projectXp.ai.title')} description={t('projectXp.ai.descriptionFull')} compact /><Button type="button" variant="secondary" onClick={() => setExplanationOpen((value) => !value)}><Bot className="h-4 w-4" />{t('projectXp.ai.explain')}</Button></div>
        {explanationOpen ? <DeterministicExplanation project={project} verification={derived.verification} /> : null}
      </Card>

      <Card className="flex flex-col gap-5 border-[color-mix(in_srgb,var(--danger)_32%,var(--border))] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="type-eyebrow text-[color:var(--danger)]">{t('projects.delete.zone')}</p>
          <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{t('projects.delete.zoneTitle')}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">{t('projects.delete.zoneDescription')}</p>
        </div>
        <ProjectDeleteButton projectId={project.project_id} projectName={project.project_name} onDeleted={() => window.location.assign('/projects')} />
      </Card>
    </div>
  );
}

function ProjectHeroV2({ project, category, signature, generated, deployReady, quality }: { readonly project: Project; readonly category: string; readonly signature: { title: string; chips: readonly string[] }; readonly generated: boolean; readonly deployReady: boolean; readonly quality?: GeneratedProjectQualityResponse | null }) {
  const { t } = useLocale();
  return (
    <section className="surface-accent relative overflow-hidden rounded-[var(--radius-xl)] p-5 md:p-8">
      <CinematicBackground signature={signature} />
      <div className="relative z-10 grid gap-8 xl:grid-cols-[1.05fr_0.95fr] xl:items-end">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2"><Badge tone="accent">{category}</Badge><Badge tone={project.status === 'generated' ? 'success' : 'warning'}>{formatStatus(project.status)}</Badge><Badge tone={deployReady ? 'success' : 'warning'}>{deployReady ? t('projectXp.hero.deployReady') : t('projectXp.hero.deployPending')}</Badge></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--accent)]">{t('projectXp.hero.eyebrow')}</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-[color:var(--text)] md:text-6xl">{project.project_name}</h1><p className="mt-4 max-w-2xl text-base leading-7 ds-text-secondary">{t('projectXp.hero.description')}</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><HeroDatum label={t('projectXp.hero.stack')} value={`${project.technology_graph.language.name} / ${project.technology_graph.framework.name}`} /><HeroDatum label={t('projectXp.hero.build')} value={quality ? (quality.passed ? t('projectXp.hero.buildValidated') : t('projectXp.hero.buildFailed')) : generated ? t('projectXp.hero.buildChecking') : t('projectXp.hero.buildNoArtifacts')} /><HeroDatum label={t('projectXp.hero.confidence')} value={t('projectXp.hero.notInformedM')} /><HeroDatum label={t('projectXp.hero.company')} value={t('projectXp.hero.notInformedF')} /></div>
          <div className="flex flex-wrap gap-3"><AnchorButton href="#live-preview" icon={Monitor}>{t('projectXp.hero.openPreview')}</AnchorButton><AnchorButton href="#code" icon={Code2}>{t('projectXp.hero.openCode')}</AnchorButton><LinkButton href={`/engineering-laboratory?projectId=${project.project_id}`} icon={TerminalSquare}>{t('projectXp.lab.open')}</LinkButton><LinkButton href={`/meta-factory?projectId=${project.project_id}`} icon={Layers3}>{t('projectXp.hero.openMetaFactory')}</LinkButton><LinkButton href={`/change-requests?projectId=${project.project_id}`} icon={GitPullRequestArrow}>{t('projectXp.hero.openChangeRequests')}</LinkButton><LinkButton href="/settings#integrations" icon={GitBranch}>{t('projectXp.hero.openGitHub')}</LinkButton><AnchorButton href="#deploy" icon={Rocket}>{t('projectXp.hero.openDeploy')}</AnchorButton></div>
        </div>
        <JourneyConsole project={project} generated={generated} deployReady={deployReady} />
      </div>
    </section>
  );
}

function CinematicIntro({ projectName }: { readonly projectName: string }) {
  const { t } = useLocale();
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-md"><div className="w-full max-w-xl space-y-5 px-6"><p className="text-center text-xs font-semibold uppercase tracking-[0.45em] text-[color:var(--accent)]">{t('projectXp.intro.engine')}</p><h2 className="text-center text-3xl font-semibold text-[color:var(--text)]">{t('projectXp.intro.loading')}</h2><p className="text-center text-sm ds-text-secondary">{projectName}</p><div className="space-y-2">{introStages(t).map((stage, index) => <div key={stage} className="grid grid-cols-[110px_1fr] items-center gap-3 text-xs ds-text-secondary"><span>{stage}</span><span className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-3)]"><span className="block h-full rounded-full bg-[color:var(--accent)]" style={{ width: `${30 + index * 9}%` }} /></span></div>)}</div></div></div>;
}

function CinematicBackground({ signature }: { readonly signature: { title: string; chips: readonly string[] } }) {
  return <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_28%),radial-gradient(circle_at_80%_10%,color-mix(in_srgb,var(--success)_14%,transparent),transparent_24%)]" /><div className="absolute right-8 top-8 hidden w-[420px] rotate-[-4deg] rounded-[32px] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-5 shadow-2xl xl:block"><p className="text-xs uppercase tracking-[0.28em] ds-text-muted">{signature.title}</p><div className="mt-5 grid grid-cols-2 gap-3">{signature.chips.map((chip) => <div key={chip} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-3)] p-4 text-sm ds-text-secondary">{chip}</div>)}</div></div></div>;
}

function JourneyConsole({ project, generated, deployReady }: { readonly project: Project; readonly generated: boolean; readonly deployReady: boolean }) {
  const { t } = useLocale();
  return <div className="rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-5 backdrop-blur"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.28em] ds-text-secondary">{t('projectXp.journey.title')}</p><Badge tone={deployReady ? 'success' : 'warning'}>{deployReady ? t('projectXp.journey.deployReady') : t('projectXp.journey.inProgress')}</Badge></div><div className="mt-5 space-y-3">{deriveJourneySteps(t, project, generated, deployReady).map(([label, state]) => <div key={label} className="flex items-center gap-3"><span className={cn('grid h-7 w-7 place-items-center rounded-full border', state === 'done' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : state === 'current' ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--accent)]' : 'border-[color:var(--border)] ds-text-muted')}>{state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : state === 'current' ? <Activity className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}</span><span className="text-sm ds-text-primary">{label}</span></div>)}</div><div className="mt-5 grid grid-cols-2 gap-3 text-xs ds-text-secondary"><span>{t('projectXp.journey.readiness')} {formatStatus(project.readiness_status)}</span><span>{t('projectXp.journey.files')} {generated ? t('projectXp.journey.indexed') : t('projectXp.journey.pending')}</span></div></div>;
}

function HeroDatum({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-3"><p className="text-xs uppercase tracking-wide ds-text-muted">{label}</p><p className="mt-1 truncate text-sm font-semibold text-[color:var(--text)]">{value}</p></div>;
}

function SectionTitle({ eyebrow, title, description, compact = false }: { readonly eyebrow: string; readonly title: string; readonly description: string; readonly compact?: boolean }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.26em] text-[color:var(--accent)]">{eyebrow}</p><h2 className={cn('font-semibold text-[color:var(--text)]', compact ? 'mt-1 text-xl' : 'mt-2 text-2xl md:text-3xl')}>{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">{description}</p></div>;
}

function AnchorButton({ href, icon: Icon, children }: { readonly href: string; readonly icon: LucideIcon; readonly children: ReactNode }) {
  return <a href={href} className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 py-2 text-sm font-semibold text-[color:var(--text)] hover:bg-[color:var(--control-hover)]"><Icon className="h-4 w-4" />{children}</a>;
}

function LinkButton({ href, icon: Icon, children, large = false }: { readonly href: string; readonly icon: LucideIcon; readonly children: ReactNode; readonly large?: boolean }) {
  return <Link href={href} className={cn('focus-ring inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[image:var(--accent-gradient)] font-semibold text-[color:var(--accent-foreground)] shadow-lg', large ? 'w-full px-5 py-4 text-base' : 'px-4 py-2 text-sm')}><Icon className="h-4 w-4" />{children}</Link>;
}

function FileRail({ files, selectedPath, onSelect }: { readonly files: readonly GeneratedProjectFileEntry[]; readonly selectedPath: string | null; readonly onSelect: (path: string) => void }) {
  const { t } = useLocale();
  return <div className="max-h-[540px] overflow-auto border-r border-[color:var(--border)] p-3">{files.map((file) => <button key={file.relative_path} type="button" onClick={() => onSelect(file.relative_path)} className={cn('focus-ring mb-1 flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-xs', selectedPath === file.relative_path ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--accent)]' : 'text-[color:var(--muted)] hover:bg-white/5')} aria-label={t('projectXp.fileRail.selectAria', { path: file.relative_path })}><FileCode2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{file.relative_path}</span></button>)}</div>;
}

function buildLivePreviewDeviceModes(t: Translator) {
  return [
    { id: 'desktop' as const, label: t('projectXp.device.desktop'), icon: Monitor, width: '100%' },
    { id: 'tablet' as const, label: t('projectXp.device.tablet'), icon: Tablet, width: '768px' },
    { id: 'mobile' as const, label: t('livePreview.device.mobile'), icon: Smartphone, width: '390px' },
  ];
}

function LivePreviewPanel({ projectId }: { readonly projectId: string }) {
  const { t } = useLocale();
  const LIVE_PREVIEW_DEVICE_MODES = useMemo(() => buildLivePreviewDeviceModes(t), [t]);
  const [session, setSession] = useState<LivePreviewSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [path, setPath] = useState('/');
  const [pathInput, setPathInput] = useState('/');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleLogEntry[]>([]);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [restartingFrontend, setRestartingFrontend] = useState(false);
  const [restartingBackend, setRestartingBackend] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // React state is always freshly null on mount -- without this, a page
    // refresh (or navigating back to this tab) always showed "not running"
    // even when the real session was still alive server-side, and clicking
    // "start" again would tear down and restart a perfectly healthy runtime
    // for no reason.
    let cancelled = false;
    livePreviewClient
      .getByProject(projectId)
      .then((existing) => {
        if (!cancelled) setSession(existing);
      })
      .catch(() => {
        // 404 (no active session for this project) is the expected,
        // common outcome -- stay in the "not running" state.
      })
      .finally(() => {
        if (!cancelled) setRecovering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!consoleOpen || session?.status !== 'running') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const entries = await livePreviewClient.console(session.session_id);
        if (!cancelled) setConsoleEntries(entries);
      } catch {
        // best-effort -- the inspector browser may not be available yet
      }
    };
    void poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [consoleOpen, session?.session_id, session?.status]);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    };
  }, [screenshotUrl]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const result = await livePreviewClient.start(projectId);
      setSession(result);
      setPath('/');
      setPathInput('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('livePreview.errors.startFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!session?.session_id) return;
    setBusy(true);
    try {
      await livePreviewClient.stop(session.session_id);
    } catch {
      // best-effort -- the session may already be gone (idle-reaped)
    } finally {
      setSession(null);
      setConsoleOpen(false);
      setConsoleEntries([]);
      setBusy(false);
    }
  }

  function refresh() {
    setRefreshNonce((value) => value + 1);
    if (session?.session_id) void livePreviewClient.reload(session.session_id).catch(() => {});
  }

  function navigateTo(nextPath: string) {
    const normalized = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
    setPath(normalized);
    setPathInput(normalized);
    setRefreshNonce((value) => value + 1);
    if (session?.session_id) void livePreviewClient.navigate(session.session_id, normalized).catch(() => {});
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current?.requestFullscreen();
    }
  }

  function openExternal() {
    if (!session || session.status !== 'running' || !session.preview_url) return;
    // Fire-and-forget: the real navigation must never wait on (or be blocked
    // by) this bookkeeping call -- popup blockers only allow window.open()
    // synchronously within the click handler, so an awaited request here
    // would silently turn every click into a blocked popup.
    void livePreviewClient.recordExternalOpen(session.session_id).catch(() => {});
    window.open(session.preview_url, '_blank', 'noopener,noreferrer');
  }

  async function restartFrontend() {
    if (!session?.session_id || restartingFrontend) return;
    setRestartingFrontend(true);
    setError(null);
    try {
      const result = await livePreviewClient.restartFrontend(session.session_id);
      setSession(result);
      setRefreshNonce((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('livePreview.errors.restartFrontendFailed'));
    } finally {
      setRestartingFrontend(false);
    }
  }

  async function restartBackend() {
    if (!session?.session_id || restartingBackend) return;
    setRestartingBackend(true);
    setError(null);
    try {
      const result = await livePreviewClient.restartBackend(session.session_id);
      setSession(result);
      setRefreshNonce((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('livePreview.errors.restartBackendFailed'));
    } finally {
      setRestartingBackend(false);
    }
  }

  async function captureScreenshot() {
    if (!session?.session_id) return;
    setScreenshotBusy(true);
    try {
      const blob = await livePreviewClient.screenshot(session.session_id);
      setScreenshotUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('livePreview.errors.screenshotFailed'));
    } finally {
      setScreenshotBusy(false);
    }
  }

  if (recovering) {
    return (
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <RefreshCw className="h-8 w-8 animate-spin text-[color:var(--muted)]" aria-hidden />
        <p className="text-sm text-[color:var(--muted)]">{t('livePreview.recovering')}</p>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <Rocket className="h-8 w-8 text-[color:var(--accent)]" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-[color:var(--text)]">{t('livePreview.notRunning')}</p>
          <p className="mt-1 max-w-md text-sm text-[color:var(--muted)]">{t('livePreview.notRunningHint')}</p>
        </div>
        {error ? <p className="text-sm text-[color:var(--danger)]">{error}</p> : null}
        <Button type="button" variant="primary" loading={busy} onClick={() => void start()}>
          <Play className="h-4 w-4" aria-hidden />{t('livePreview.start')}
        </Button>
      </Card>
    );
  }

  if (session.status === 'unsupported') {
    return (
      <Card className="space-y-3 p-6">
        <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-[color:var(--warning)]" aria-hidden /><p className="text-sm font-semibold text-[color:var(--text)]">{t('livePreview.unsupported')}</p></div>
        <p className="text-sm text-[color:var(--muted)]">{session.reason}</p>
        <Button type="button" variant="secondary" onClick={() => setSession(null)}>{t('livePreview.back')}</Button>
      </Card>
    );
  }

  if (session.status === 'failed') {
    return (
      <Card className="space-y-3 border-[color-mix(in_srgb,var(--danger)_32%,var(--border))] p-6">
        <div className="flex items-center gap-2"><XCircle className="h-5 w-5 text-[color:var(--danger)]" aria-hidden /><p className="text-sm font-semibold text-[color:var(--text)]">{t('livePreview.failed')}</p></div>
        <pre className="max-h-48 overflow-auto rounded-[var(--radius-md)] bg-black/30 p-3 text-xs text-[color:var(--muted)]">{session.reason}</pre>
        <Button type="button" variant="secondary" loading={busy} onClick={() => void start()}><RefreshCw className="h-4 w-4" aria-hidden />{t('livePreview.retry')}</Button>
      </Card>
    );
  }

  const previewOrigin = (session.preview_url ?? '').replace(/\/$/, '');
  const iframeSrc = previewOrigin ? `${previewOrigin}${path}` : '';
  const activeDevice = LIVE_PREVIEW_DEVICE_MODES.find((mode) => mode.id === deviceMode) ?? LIVE_PREVIEW_DEVICE_MODES[0];

  return (
    <div ref={containerRef}>
    <Card className={cn('overflow-hidden p-0', fullscreen && 'bg-[color:var(--surface-2)]')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] p-4">
        <div className="flex items-center gap-2">
          <Badge tone="success">{t('livePreview.liveBadge')}</Badge>
          <span className="font-mono text-xs text-[color:var(--muted)]">{session.session_id}</span>
        </div>
        <div className="flex items-center gap-1">
          {LIVE_PREVIEW_DEVICE_MODES.map((mode) => (
            <Button
              key={mode.id}
              type="button"
              variant={mode.id === deviceMode ? 'soft' : 'ghost'}
              className="px-2.5 py-2"
              title={mode.label}
              aria-pressed={mode.id === deviceMode}
              onClick={() => setDeviceMode(mode.id)}
            >
              <mode.icon className="h-4 w-4" aria-hidden />
            </Button>
          ))}
          <Button type="button" variant="ghost" className="px-2.5 py-2" title={t('livePreview.consoleTitle')} aria-pressed={consoleOpen} onClick={() => setConsoleOpen((value) => !value)}>
            <TerminalSquare className="h-4 w-4" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" className="px-2.5 py-2" title={t('livePreview.captureScreenshot')} loading={screenshotBusy} onClick={() => void captureScreenshot()}>
            <Camera className="h-4 w-4" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" className="px-2.5 py-2" title={t('livePreview.fullscreen')} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="px-2.5 py-2"
            title={t('livePreview.restartFrontend')}
            loading={restartingFrontend}
            disabled={session.status !== 'running'}
            onClick={() => void restartFrontend()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="px-2.5 py-2"
            title={t('livePreview.restartBackend')}
            loading={restartingBackend}
            disabled={session.status !== 'running'}
            onClick={() => void restartBackend()}
          >
            <Server className="h-4 w-4" aria-hidden />
          </Button>
          {/* "Ver frontend no navegador": enabled ONLY once the backend has
              already health-checked the session into "running" with a real
              preview_url (see live_preview_service.py's _wait_ready gate) --
              never enabled off the mere existence of a URL string. */}
          <Button
            type="button"
            variant="soft"
            title={session.status === 'running' ? undefined : t('livePreview.openExternalHintStarting')}
            disabled={session.status !== 'running' || !session.preview_url}
            onClick={openExternal}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />{t('livePreview.openExternal')}
          </Button>
          <Button type="button" variant="secondary" loading={busy} onClick={() => void stop()}><Square className="h-4 w-4" aria-hidden />{t('livePreview.stop')}</Button>
        </div>
      </div>
      <form
        className="flex items-center gap-2 border-b border-[color:var(--border)] bg-black/10 p-2"
        onSubmit={(event) => {
          event.preventDefault();
          navigateTo(pathInput);
        }}
      >
        <Button type="button" variant="ghost" className="px-2.5 py-2" title={t('livePreview.reload')} onClick={refresh}>
          <RefreshCw className="h-4 w-4" aria-hidden />
        </Button>
        <span className="truncate rounded-[var(--radius-sm)] bg-black/20 px-2 py-1 font-mono text-xs text-[color:var(--muted)]">{previewOrigin}</span>
        <input
          type="text"
          value={pathInput}
          onChange={(event) => setPathInput(event.target.value)}
          placeholder={t('livePreview.pathPlaceholder')}
          aria-label={t('livePreview.pathAriaLabel')}
          className="focus-ring min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-transparent px-2 py-1 font-mono text-xs text-[color:var(--text)]"
        />
      </form>
      {error ? <p className="border-b border-[color:var(--border)] p-2 text-xs text-[color:var(--danger)]">{error}</p> : null}
      <div className="flex justify-center bg-black/20 p-4">
        <iframe
          key={refreshNonce}
          title={t('livePreview.iframeTitle')}
          src={iframeSrc}
          style={{ width: activeDevice.width, maxWidth: '100%' }}
          className={cn('bg-white transition-[width]', fullscreen ? 'h-[calc(100vh-160px)]' : 'h-[720px]')}
        />
      </div>
      {consoleOpen ? (
        <div className="max-h-56 overflow-auto border-t border-[color:var(--border)] bg-black/40 p-3 font-mono text-xs">
          {consoleEntries.length === 0 ? (
            <p className="text-[color:var(--muted)]">{t('livePreview.consoleEmpty')}</p>
          ) : (
            consoleEntries.map((entry, index) => (
              <p key={`${entry.at}-${index}`} className={cn(entry.type === 'error' || entry.type === 'pageerror' ? 'text-[color:var(--danger)]' : 'text-[color:var(--warning)]')}>
                <span className="text-[color:var(--muted-2)]">[{entry.at}]</span> {entry.text}
              </p>
            ))
          )}
        </div>
      ) : null}
      {screenshotUrl ? (
        <div className="border-t border-[color:var(--border)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-[color:var(--text)]">{t('livePreview.screenshotCaptured')}</p>
            <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setScreenshotUrl(null)}>{t('livePreview.close')}</Button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- a captured screenshot is an opaque blob URL, not an optimizable static asset */}
          <img src={screenshotUrl} alt={t('livePreview.screenshotAlt')} className="max-h-96 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] object-contain" />
        </div>
      ) : null}
    </Card>
    </div>
  );
}

function VerificationRow({ item }: { readonly item: VerificationItem }) {
  const { t } = useLocale();
  return <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/[0.03] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-[color:var(--muted-2)]">{item.group}</p><p className="mt-1 text-sm font-semibold text-[color:var(--text)]">{item.label}</p></div><Badge tone={statusTone(item.status)}>{verificationLabel(t, item.status)}</Badge></div>{item.evidence.length ? <p className="mt-2 truncate font-mono text-xs text-[color:var(--muted)]">{item.evidence[0]}</p> : <p className="mt-2 text-xs text-[color:var(--muted)]">{t('projectXp.verification.noEvidence')}</p>}</div>;
}

function Metric({ label, value }: { readonly label: string; readonly value: string | number }) {
  return <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"><p className="text-xs uppercase tracking-wide text-[color:var(--muted)]">{label}</p><p className="mt-1 font-mono text-xl font-semibold text-[color:var(--text)]">{value}</p></div>;
}

function TwinIcon({ kind }: { readonly kind: TwinNodeKind }) {
  const Icon = kind === 'database' ? Database : kind === 'cloud' ? Cloud : kind === 'frontend' ? Monitor : kind === 'backend' ? Server : kind === 'cache' || kind === 'queue' ? Package : kind === 'storage' ? FileText : Layers3;
  return <Icon className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />;
}

function TwinDetails({ node }: { readonly node: TwinNode }) {
  const { t } = useLocale();
  return <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-black/10 p-4"><p className="text-xs uppercase tracking-wide text-[color:var(--muted)]">{t('projectXp.twin.selectedNode')}</p><h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">{node.label}</h3><p className="mt-2 text-sm text-[color:var(--muted)]">{node.responsibility}</p><KeyValue label={t('projectXp.twin.keyLabel.technology')} value={node.technology} /><KeyValue label={t('projectXp.twin.keyLabel.dependencies')} value={node.dependencies.join(', ') || t('projectXp.twin.none')} /><KeyValue label={t('projectXp.twin.keyLabel.files')} value={node.files.join(', ') || t('projectXp.twin.noEvidence')} mono /><KeyValue label={t('projectXp.twin.keyLabel.logs')} value={node.logs.join(' ')} /></div>;
}

function KeyValue({ label, value, mono = false }: { readonly label: string; readonly value: string; readonly mono?: boolean }) {
  return <div className="mt-3"><p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-2)]">{label}</p><p className={cn('mt-1 text-sm text-[color:var(--text)]', mono && 'font-mono text-xs')}>{value}</p></div>;
}

function DashboardPanel({ title, icon: Icon, items }: { readonly title: string; readonly icon: LucideIcon; readonly items: readonly string[] }) {
  const { t } = useLocale();
  const visible = items.filter(Boolean);
  return <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_64%,transparent)] p-4" open><summary className="flex cursor-pointer list-none items-center gap-3"><Icon className="h-5 w-5 text-[color:var(--accent)]" /><span className="font-semibold text-[color:var(--text)]">{title}</span></summary><div className="mt-3 flex flex-wrap gap-2">{visible.length ? visible.map((item) => <Badge key={item}>{item}</Badge>) : <span className="text-sm text-[color:var(--muted)]">{t('projectXp.panel.noEvidence')}</span>}</div></details>;
}

function DeployItem({ label, ready, detail }: { readonly label: string; readonly ready: boolean; readonly detail: string }) {
  return <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-[color:var(--text)]">{label}</p>{ready ? <CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" /> : <XCircle className="h-4 w-4 text-[color:var(--muted)]" />}</div><p className="mt-1 text-xs text-[color:var(--muted)]">{detail}</p></div>;
}

function FileList({ files }: { readonly files: readonly GeneratedProjectFileEntry[] }) {
  return <div className="space-y-2">{files.map((file) => <div key={file.relative_path} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"><span className="truncate font-mono text-xs text-[color:var(--text)]">{file.relative_path}</span><Badge>{formatBytes(file.size_bytes)}</Badge></div>)}</div>;
}

function LogLine({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] py-2 text-sm last:border-0"><span className="text-[color:var(--muted)]">{label}</span><span className="font-mono text-xs text-[color:var(--text)]">{value}</span></div>;
}

function InlineState({ title, detail, compact = false }: { readonly title: string; readonly detail: string; readonly compact?: boolean }) {
  return <div className={cn('grid place-items-center text-center', compact ? 'min-h-28' : 'min-h-72 p-8')}><div className="max-w-md"><AlertTriangle className="mx-auto h-6 w-6 text-[color:var(--warning)]" /><p className="mt-3 font-semibold text-[color:var(--text)]">{title}</p><p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{detail}</p></div></div>;
}

function DeterministicExplanation({ project, verification }: { readonly project: Project; readonly verification: readonly VerificationItem[] }) {
  const { t } = useLocale();
  const missing = verification.filter((item) => item.status === 'missing');
  return <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-black/10 p-4"><Badge tone="warning">{t('projectXp.explain.deterministic')}</Badge><p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{t('projectXp.explain.combinesPrefix')} {project.technology_graph.framework.name}, {project.technology_graph.runtime.name}, {project.technology_graph.architecture.name} — {t('projectXp.explain.combinesSuffix')}</p><div className="mt-4 grid gap-3 md:grid-cols-2"><KeyValue label={t('projectXp.explain.keyLabel.patterns')} value={[project.technology_graph.architecture.name, ...project.selected_capabilities].join(', ')} /><KeyValue label={t('projectXp.explain.keyLabel.futureImprovements')} value={missing.length ? missing.map((item) => item.label).join(', ') : t('projectXp.explain.noGapsDetected')} /></div></div>;
}
