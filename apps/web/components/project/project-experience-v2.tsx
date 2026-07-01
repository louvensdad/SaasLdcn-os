'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Code2,
  Database,
  Download,
  FileCode2,
  FileText,
  GitBranch,
  Layers3,
  Monitor,
  Package,
  Rocket,
  Server,
  ShieldCheck,
  Smartphone,
  Tablet,
  TerminalSquare,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CardLoading } from '@/components/feedback/loading-system';
import { PageError } from '@/components/feedback/error-system';
import { useProject } from '@/hooks/use-projects';
import { useGeneratedFiles } from '@/hooks/use-generated-files';
import { useGeneratedFileContent } from '@/hooks/use-generated-file-content';
import { useGeneratedProjectQuality } from '@/hooks/use-generated-project-quality';
import { usePrepareDownload } from '@/hooks/use-prepare-download';
import { useGitProviderConnection } from '@/hooks/use-git-providers';
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

const DEVICE_MODES: readonly { id: DeviceMode; label: string; icon: LucideIcon }[] = [
  { id: 'desktop', label: 'Desktop', icon: Monitor },
  { id: 'tablet', label: 'Tablet', icon: Tablet },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
];

const JOURNEY_STEPS = [
  ['Ideia', 'done'],
  ['PromptMaster', 'done'],
  ['Architect', 'done'],
  ['Engineering Review', 'done'],
  ['Meta-Fabrica', 'done'],
  ['Laboratorio', 'current'],
  ['Deploy', 'pending'],
] as const;

const INTRO_STAGES = ['Contracts', 'Backend', 'Frontend', 'Security', 'Testing', 'Architecture', 'Laboratory', 'Deploy Ready'] as const;

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

function deriveCategory(project: Project) {
  const raw = [project.archetype_id, ...project.selected_business_modules, project.blueprint_snapshot.project_requirements?.business_context ?? '']
    .join(' ')
    .toLowerCase();
  if (includesAny(raw, ['clinic', 'medical', 'health', 'hospital', 'pacient'])) return 'Saude / Operacao Clinica';
  if (includesAny(raw, ['market', 'commerce', 'cart', 'order', 'delivery'])) return 'Marketplace / Comercio';
  if (includesAny(raw, ['bank', 'finance', 'payment', 'pix', 'invoice'])) return 'Financas / Banco Digital';
  if (includesAny(raw, ['erp', 'stock', 'inventory', 'warehouse'])) return 'ERP / Operacao';
  return project.archetype_id || 'Produto digital';
}

function domainSignature(project: Project) {
  const category = deriveCategory(project).toLowerCase();
  if (category.includes('saude')) return { title: 'clinical command surface', chips: ['agenda', 'pacientes', 'prontuario', 'triagem'] };
  if (category.includes('marketplace')) return { title: 'commerce operations grid', chips: ['catalogo', 'pedidos', 'checkout', 'entrega'] };
  if (category.includes('financas')) return { title: 'financial trust layer', chips: ['contas', 'pix', 'extratos', 'risco'] };
  if (category.includes('erp')) return { title: 'enterprise resource map', chips: ['estoque', 'pedidos', 'relatorios', 'faturamento'] };
  return { title: 'software architecture field', chips: ['frontend', 'backend', 'dados', 'deploy'] };
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

function technologyVerification(project: Project, filesData?: GeneratedProjectFilesResponse | null, quality?: GeneratedProjectQualityResponse | null): VerificationItem[] {
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
    { id: stack.language.id, label: stack.language.name, group: 'Stack', evidence: fromFiles([languageExt]), status: 'pending' },
    { id: stack.framework.id, label: stack.framework.name, group: 'Stack', evidence: [...fromFiles([stack.framework.id, stack.framework.name, 'package.json', 'pom.xml', 'requirements.txt']), ...evidenceFromCheck(stack.framework.id)], status: 'pending' },
    { id: 'docker', label: 'Docker', group: 'DevOps', evidence: fromFiles(['Dockerfile', 'docker-compose', 'compose.yaml']), status: 'pending' },
    { id: 'tests', label: 'Tests', group: 'Quality', evidence: fromFiles(['test', 'spec', '__tests__']), status: 'pending' },
    { id: 'openapi', label: 'OpenAPI / Swagger', group: 'API', evidence: fromFiles(['openapi', 'swagger']), status: 'pending' },
    ...project.selected_capabilities.map((capability) => ({ id: capability, label: capability, group: 'Capabilities', evidence: fromFiles([capability, capability.replaceAll('_', '-')]), status: 'pending' as VerificationStatus })),
    ...project.blueprint_snapshot.infrastructure_profile.selected_component_ids.map((component) => ({ id: component, label: component, group: 'Infrastructure', evidence: filePaths.filter((path) => includesAny(path, [component])).slice(0, 6), status: 'pending' as VerificationStatus })),
  ];
  return items.map((item) => ({ ...item, status: status(item.evidence) }));
}

function buildTwin(project: Project, filesData?: GeneratedProjectFilesResponse | null): TwinNode[] {
  const files = filesData?.files ?? [];
  const infra = project.blueprint_snapshot.infrastructure_profile.selected_component_ids;
  const has = (needles: readonly string[]) => fileEvidence(files, needles);
  const nodes: TwinNode[] = [
    { id: 'client', label: 'Cliente', kind: 'client', technology: 'Browser / Usuario', responsibility: 'Entrada de uso do produto.', dependencies: ['frontend'], files: [], logs: ['Sem log de cliente conectado.'] },
    { id: 'frontend', label: 'Frontend', kind: 'frontend', technology: project.technology_graph.framework.name, responsibility: 'Interface, rotas e experiencia do usuario.', dependencies: ['backend'], files: has(['app/', 'pages/', 'components/', 'src/']), logs: ['Logs frontend ainda nao conectados.'] },
    { id: 'gateway', label: 'Gateway', kind: 'gateway', technology: 'HTTP/API boundary', responsibility: 'Contrato entre UI e servicos.', dependencies: ['backend'], files: has(['route', 'router', 'controller', 'api']), logs: ['Nenhuma fonte de gateway configurada.'] },
    { id: 'backend', label: 'Backend', kind: 'backend', technology: project.technology_graph.runtime.name, responsibility: 'Regras, casos de uso e persistencia.', dependencies: infra, files: has(['service', 'controller', 'repository', 'main.', 'app.']), logs: ['Logs backend ainda nao conectados.'] },
  ];
  if (infra.some((item) => includesAny(item, ['redis', 'cache']))) nodes.push({ id: 'redis', label: 'Redis', kind: 'cache', technology: 'Redis', responsibility: 'Cache, sessoes ou filas leves.', dependencies: ['backend'], files: has(['redis']), logs: ['Redis nao possui log conectado.'] });
  if (infra.some((item) => includesAny(item, ['rabbit', 'kafka', 'queue', 'sqs']))) nodes.push({ id: 'queue', label: 'Fila', kind: 'queue', technology: infra.find((item) => includesAny(item, ['rabbit', 'kafka', 'queue', 'sqs'])) ?? 'Queue', responsibility: 'Processamento assincrono.', dependencies: ['backend'], files: has(['queue', 'rabbit', 'kafka']), logs: ['Mensageria nao possui log conectado.'] });
  const database = infra.find((item) => includesAny(item, ['postgres', 'mysql', 'sqlite', 'mongo', 'database', 'db']));
  if (database) nodes.push({ id: 'database', label: 'Banco', kind: 'database', technology: database, responsibility: 'Persistencia transacional.', dependencies: ['backend'], files: has(['migration', 'schema', 'entity', database]), logs: ['Logs de banco nao conectados.'] });
  const storage = infra.find((item) => includesAny(item, ['storage', 's3', 'blob']));
  if (storage) nodes.push({ id: 'storage', label: 'Storage', kind: 'storage', technology: storage, responsibility: 'Arquivos e objetos.', dependencies: ['backend'], files: has(['storage', 's3', 'blob']), logs: ['Storage nao possui log conectado.'] });
  const cloud = infra.find((item) => includesAny(item, ['aws', 'azure', 'gcp', 'vercel', 'netlify', 'railway', 'render', 'fly']));
  nodes.push({ id: 'cloud', label: 'Cloud', kind: 'cloud', technology: cloud ?? 'Nao definido', responsibility: 'Hospedagem e entrega.', dependencies: ['frontend', 'backend'], files: has(['vercel', 'netlify', 'railway', 'render', 'Dockerfile', 'compose']), logs: ['Cloud logs aguardam integracao.'] });
  return nodes;
}

function panelGroups(project: Project, quality?: GeneratedProjectQualityResponse | null) {
  const checks = quality?.checks ?? [];
  return [
    { title: 'Arquitetura', icon: Layers3, items: [project.technology_graph.architecture.name, `${project.selected_business_modules.length} modulos`, `${project.selected_capabilities.length} capacidades`] },
    { title: 'Seguranca', icon: ShieldCheck, items: quality ? [`${quality.security_findings.length} achados`, `${quality.missing_files.length} arquivos ausentes`] : ['Quality gate ainda nao executado'] },
    { title: 'Performance', icon: Activity, items: ['Benchmark nao configurado', 'P95/P99 indisponiveis'] },
    { title: 'Cloud', icon: Cloud, items: project.blueprint_snapshot.infrastructure_profile.selected_component_ids },
    { title: 'Banco', icon: Database, items: project.blueprint_snapshot.infrastructure_profile.selected_component_ids.filter((item) => includesAny(item, ['postgres', 'mysql', 'sqlite', 'mongo', 'database', 'db'])) },
    { title: 'Frontend', icon: Monitor, items: [project.technology_graph.framework.name, `${project.selected_endpoints.length} endpoints planejados`] },
    { title: 'Backend', icon: Server, items: [project.technology_graph.runtime.name, ...checks.filter((check) => check.category === 'structure').slice(0, 2).map((check) => check.label)] },
    { title: 'DevOps', icon: TerminalSquare, items: ['Download seguro', 'Git export quando provider conectado'] },
    { title: 'Observabilidade', icon: Activity, items: project.selected_capabilities.filter((capability) => includesAny(capability, ['observability', 'logs', 'metrics'])) },
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

function verificationLabel(status: VerificationStatus) {
  if (status === 'verified') return 'Verificado';
  if (status === 'missing') return 'Nao encontrado';
  return 'Aguardando arquivos';
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
    const twin = buildTwin(project, generatedFilesQuery.data);
    return {
      category: deriveCategory(project),
      signature: domainSignature(project),
      metrics: deriveMetrics(project, generatedFilesQuery.data),
      verification: technologyVerification(project, generatedFilesQuery.data, quality),
      twin,
      selectedTwin: twin.find((node) => node.id === selectedTwinId) ?? twin[0],
      panels: panelGroups(project, quality),
      docs: documentationFiles(generatedFilesQuery.data),
    };
  }, [generatedFilesQuery.data, project, quality, selectedTwinId]);

  if (projectQuery.isLoading) return <CardLoading className="h-96" />;
  if (projectQuery.isError || !project || !derived) {
    return <PageError title="Projeto indisponivel" description={getApiErrorMessage(projectQuery.error, t('projectDetail.unavailableDetail'))} onRetry={() => void projectQuery.refetch()} />;
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
        <SectionTitle eyebrow="01" title="Live Project Preview" description="Preview seguro dos arquivos realmente gerados. Quando nao ha runtime de preview, a pagina mostra o artefato indexado em vez de simular uma aplicacao." />
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
            <Badge tone={generated ? 'success' : 'warning'}>{generated ? `${generatedFiles.length} arquivos indexados` : 'preview nao gerado'}</Badge>
          </div>
          {filesUnavailable ? (
            <InlineState title="Preview indisponivel" detail={getApiErrorMessage(generatedFilesQuery.error, 'Arquivos gerados nao foram encontrados.')} />
          ) : generated ? (
            <div className="grid gap-0 xl:grid-cols-[300px_minmax(0,1fr)]">
              <FileRail files={generatedFiles} selectedPath={selectedPath} onSelect={setSelectedPath} />
              <div className="bg-[#05070a] p-4 md:p-8">
                <div className={cn('mx-auto overflow-hidden rounded-[28px] border border-white/15 bg-black shadow-2xl transition-all', previewFrameClass)}>
                  <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-slate-400">
                    <span>{selectedPath ?? 'sem arquivo selecionado'}</span>
                    <span>{selectedPreview.data?.content_type ?? 'loading'}</span>
                  </div>
                  {selectedPreview.isLoading ? (
                    <div className="grid h-full place-items-center text-sm text-slate-500">Carregando preview real...</div>
                  ) : previewContent ? (
                    selectedPath?.endsWith('.html') ? <iframe title="Generated HTML preview" srcDoc={previewContent} className="h-full w-full bg-white" /> : <pre id="code" className="h-full overflow-auto p-5 text-xs leading-relaxed text-slate-100">{previewContent}</pre>
                  ) : (
                    <div className="grid h-full place-items-center p-8 text-center text-sm text-slate-500">Preview bloqueado para arquivo binario, grande ou sensivel. Nenhum conteudo foi fabricado.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <InlineState title="Projeto ainda sem preview indexado" detail="Gere o projeto ou conecte um artefato real para habilitar desktop, tablet e mobile." />
          )}
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
        <div className="space-y-5">
          <SectionTitle eyebrow="02" title="Technology Verified" description="Matriz automatica baseada nos arquivos gerados e no quality gate. Ausencias ficam visiveis." />
          <Card className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{derived.verification.map((item) => <VerificationRow key={`${item.group}-${item.id}`} item={item} />)}</div></Card>
        </div>
        <div className="space-y-5">
          <SectionTitle eyebrow="03" title="Project Health" description="Indicadores derivados. Sem score manual." />
          <Card className="grid gap-3 sm:grid-cols-2">
            <Metric label="Arquivos" value={derived.metrics.files} />
            <Metric label="Endpoints" value={derived.metrics.endpoints} />
            <Metric label="Warnings" value={quality?.warnings.length ?? 'nao verificado'} />
            <Metric label="Quality checks" value={quality?.checks.length ?? 'nao verificado'} />
            <Metric label="Testes" value={derived.metrics.routes || 'nao detectado'} />
            <Metric label="Containers" value={derived.metrics.containers} />
          </Card>
        </div>
      </section>

      <section className="space-y-5">
        <SectionTitle eyebrow="04" title="Architecture Experience" description="Digital twin clicavel derivado do blueprint e dos arquivos indexados." />
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
      </section>

      <section className="space-y-5">
        <SectionTitle eyebrow="05" title="Engineering Dashboard" description="Paineis compactos por dominio, substituindo a pagina infinita de cards." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{derived.panels.map((panel) => <DashboardPanel key={panel.title} {...panel} />)}</div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-5 border-[color-mix(in_srgb,var(--accent)_30%,var(--border))]">
          <SectionTitle eyebrow="06" title="Laboratory" description="A continuacao natural da jornada de engenharia." compact />
          <p className="text-sm leading-6 text-[color:var(--muted)]">Abra o laboratorio para terminal real, Security Center, API Explorer, quality, arquitetura, logs e exportacoes tecnicas.</p>
          <LinkButton href={`/engineering-laboratory?projectId=${project.project_id}`} icon={TerminalSquare} large>Abrir Laboratorio</LinkButton>
        </Card>
        <Card id="deploy" className="space-y-5 scroll-mt-24">
          <SectionTitle eyebrow="07" title="Deploy Center" description="Somente provedores suportados aparecem habilitados." compact />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DeployItem label="GitHub" ready={githubConnection.data?.status === 'connected'} detail={githubConnection.data?.status ?? 'conectar em Settings'} />
            <DeployItem label="GitLab" ready={gitlabConnection.data?.status === 'connected'} detail={gitlabConnection.data?.status ?? 'conectar em Settings'} />
            <DeployItem label="Docker" ready={derived.metrics.containers > 0} detail={derived.metrics.containers > 0 ? 'artefato detectado' : 'Dockerfile ausente'} />
            {['AWS', 'Azure', 'Google', 'Railway', 'Render', 'Fly', 'Vercel', 'Netlify'].map((provider) => <DeployItem key={provider} label={provider} ready={derived.verification.some((item) => item.id.toLowerCase().includes(provider.toLowerCase()) && item.status === 'verified')} detail="aguardando evidencia" />)}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="primary" disabled={!generated || prepareDownloadMutation.isPending} onClick={() => prepareDownloadMutation.mutate()}><Download className="h-4 w-4" aria-hidden />Preparar ZIP seguro</Button>
            {prepareDownloadMutation.data ? <button type="button" onClick={() => void downloadAuthenticated(apiEndpoints.localGeneration.download(project.project_id), `${project.project_id}.zip`)} className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-[color:var(--text)]"><Download className="h-4 w-4" aria-hidden />Download ZIP</button> : null}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="space-y-5"><SectionTitle eyebrow="08" title="Documentation" description="Documentos detectados no projeto gerado." compact />{derived.docs.length ? <FileList files={derived.docs} /> : <InlineState title="Documentacao nao encontrada" detail="README, OpenAPI, ADR, diagrams ou changelog nao foram encontrados nos artefatos indexados." compact />}</Card>
        <Card className="space-y-5"><SectionTitle eyebrow="09" title="Logs" description="Eventos reais disponiveis e fontes ainda nao conectadas." compact /><LogLine label="Project created" value={project.created_at} /><LogLine label="Project updated" value={project.updated_at} /><LogLine label="File index" value={generated ? `${generatedFiles.length} arquivos` : 'sem arquivos indexados'} /><LogLine label="Quality gate" value={quality ? (quality.passed ? 'passed' : 'failed') : 'nao executado'} /><p className="text-xs text-[color:var(--muted)]">Logs em tempo real de backend, frontend, Docker, banco e cloud ainda precisam de fontes conectadas.</p></Card>
      </section>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle eyebrow="AI" title="IA explica o projeto" description="Sem chave configurada nesta tela, a explicacao usa modo deterministico e declara isso." compact /><Button type="button" variant="secondary" onClick={() => setExplanationOpen((value) => !value)}><Bot className="h-4 w-4" />Explicar Projeto</Button></div>
        {explanationOpen ? <DeterministicExplanation project={project} verification={derived.verification} /> : null}
      </Card>
    </div>
  );
}

function ProjectHeroV2({ project, category, signature, generated, deployReady, quality }: { readonly project: Project; readonly category: string; readonly signature: { title: string; chips: readonly string[] }; readonly generated: boolean; readonly deployReady: boolean; readonly quality?: GeneratedProjectQualityResponse | null }) {
  return (
    <section className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[linear-gradient(140deg,#061016,#101827_48%,#0b1016)] p-5 shadow-2xl md:p-8">
      <CinematicBackground signature={signature} />
      <div className="relative z-10 grid gap-8 xl:grid-cols-[1.05fr_0.95fr] xl:items-end">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2"><Badge tone="accent">{category}</Badge><Badge tone={project.status === 'generated' ? 'success' : 'warning'}>{formatStatus(project.status)}</Badge><Badge tone={deployReady ? 'success' : 'warning'}>{deployReady ? 'Pronto para deploy' : 'Deploy pendente'}</Badge></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--accent)]">LDCN Engine / Project Experience V2</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-white md:text-6xl">{project.project_name}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">Software gerado com blueprint, arquitetura, gatekeeper e verificacao baseada nos artefatos reais disponiveis.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><HeroDatum label="Stack" value={`${project.technology_graph.language.name} / ${project.technology_graph.framework.name}`} /><HeroDatum label="Build" value={quality ? (quality.passed ? 'validado' : 'falhou') : generated ? 'verificando' : 'sem artefatos'} /><HeroDatum label="Confidence" value="nao informado" /><HeroDatum label="Empresa" value="nao informada" /></div>
          <div className="flex flex-wrap gap-3"><AnchorButton href="#live-preview" icon={Monitor}>Abrir Preview</AnchorButton><AnchorButton href="#code" icon={Code2}>Abrir Codigo</AnchorButton><LinkButton href={`/engineering-laboratory?projectId=${project.project_id}`} icon={TerminalSquare}>Abrir Laboratorio</LinkButton><LinkButton href={`/meta-factory?projectId=${project.project_id}`} icon={Layers3}>Abrir Meta-Fabrica</LinkButton><LinkButton href="/settings#integrations" icon={GitBranch}>Abrir GitHub</LinkButton><AnchorButton href="#deploy" icon={Rocket}>Abrir Deploy</AnchorButton></div>
        </div>
        <JourneyConsole project={project} generated={generated} deployReady={deployReady} />
      </div>
    </section>
  );
}

function CinematicIntro({ projectName }: { readonly projectName: string }) {
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-[#03070b]/95 backdrop-blur-md"><div className="w-full max-w-xl space-y-5 px-6"><p className="text-center text-xs font-semibold uppercase tracking-[0.45em] text-[color:var(--accent)]">LDCN ENGINE</p><h2 className="text-center text-3xl font-semibold text-white">Loading Project</h2><p className="text-center text-sm text-slate-400">{projectName}</p><div className="space-y-2">{INTRO_STAGES.map((stage, index) => <div key={stage} className="grid grid-cols-[110px_1fr] items-center gap-3 text-xs text-slate-400"><span>{stage}</span><span className="h-2 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-[color:var(--accent)]" style={{ width: `${30 + index * 9}%` }} /></span></div>)}</div></div></div>;
}

function CinematicBackground({ signature }: { readonly signature: { title: string; chips: readonly string[] } }) {
  return <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_28%),radial-gradient(circle_at_80%_10%,color-mix(in_srgb,var(--success)_14%,transparent),transparent_24%)]" /><div className="absolute right-8 top-8 hidden w-[420px] rotate-[-4deg] rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl xl:block"><p className="text-xs uppercase tracking-[0.28em] text-slate-500">{signature.title}</p><div className="mt-5 grid grid-cols-2 gap-3">{signature.chips.map((chip) => <div key={chip} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">{chip}</div>)}</div></div></div>;
}

function JourneyConsole({ project, generated, deployReady }: { readonly project: Project; readonly generated: boolean; readonly deployReady: boolean }) {
  return <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/35 p-5 backdrop-blur"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Engineering Timeline</p><Badge tone={deployReady ? 'success' : 'warning'}>{deployReady ? 'deploy ready' : 'in progress'}</Badge></div><div className="mt-5 space-y-3">{JOURNEY_STEPS.map(([label, state]) => <div key={label} className="flex items-center gap-3"><span className={cn('grid h-7 w-7 place-items-center rounded-full border', state === 'done' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300' : state === 'current' ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--accent)]' : 'border-white/15 text-slate-500')}>{state === 'done' ? <CheckCircle2 className="h-4 w-4" /> : state === 'current' ? <Activity className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}</span><span className="text-sm text-slate-200">{label}</span></div>)}</div><div className="mt-5 grid grid-cols-2 gap-3 text-xs text-slate-400"><span>Readiness: {formatStatus(project.readiness_status)}</span><span>Arquivos: {generated ? 'indexados' : 'pendente'}</span></div></div>;
}

function HeroDatum({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-[var(--radius-lg)] border border-white/10 bg-white/[0.04] p-3"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-semibold text-white">{value}</p></div>;
}

function SectionTitle({ eyebrow, title, description, compact = false }: { readonly eyebrow: string; readonly title: string; readonly description: string; readonly compact?: boolean }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.26em] text-[color:var(--accent)]">{eyebrow}</p><h2 className={cn('font-semibold text-[color:var(--text)]', compact ? 'mt-1 text-xl' : 'mt-2 text-2xl md:text-3xl')}>{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">{description}</p></div>;
}

function AnchorButton({ href, icon: Icon, children }: { readonly href: string; readonly icon: LucideIcon; readonly children: ReactNode }) {
  return <a href={href} className="focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"><Icon className="h-4 w-4" />{children}</a>;
}

function LinkButton({ href, icon: Icon, children, large = false }: { readonly href: string; readonly icon: LucideIcon; readonly children: ReactNode; readonly large?: boolean }) {
  return <Link href={href} className={cn('focus-ring inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[image:var(--accent-gradient)] font-semibold text-white shadow-lg', large ? 'w-full px-5 py-4 text-base' : 'px-4 py-2 text-sm')}><Icon className="h-4 w-4" />{children}</Link>;
}

function FileRail({ files, selectedPath, onSelect }: { readonly files: readonly GeneratedProjectFileEntry[]; readonly selectedPath: string | null; readonly onSelect: (path: string) => void }) {
  return <div className="max-h-[540px] overflow-auto border-r border-[color:var(--border)] p-3">{files.map((file) => <button key={file.relative_path} type="button" onClick={() => onSelect(file.relative_path)} className={cn('focus-ring mb-1 flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-xs', selectedPath === file.relative_path ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--accent)]' : 'text-[color:var(--muted)] hover:bg-white/5')} aria-label={`Selecionar arquivo gerado ${file.relative_path}`}><FileCode2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{file.relative_path}</span></button>)}</div>;
}

function VerificationRow({ item }: { readonly item: VerificationItem }) {
  return <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/[0.03] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-[color:var(--muted-2)]">{item.group}</p><p className="mt-1 text-sm font-semibold text-[color:var(--text)]">{item.label}</p></div><Badge tone={statusTone(item.status)}>{verificationLabel(item.status)}</Badge></div>{item.evidence.length ? <p className="mt-2 truncate font-mono text-xs text-[color:var(--muted)]">{item.evidence[0]}</p> : <p className="mt-2 text-xs text-[color:var(--muted)]">Sem evidencia real encontrada.</p>}</div>;
}

function Metric({ label, value }: { readonly label: string; readonly value: string | number }) {
  return <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3"><p className="text-xs uppercase tracking-wide text-[color:var(--muted)]">{label}</p><p className="mt-1 font-mono text-xl font-semibold text-[color:var(--text)]">{value}</p></div>;
}

function TwinIcon({ kind }: { readonly kind: TwinNodeKind }) {
  const Icon = kind === 'database' ? Database : kind === 'cloud' ? Cloud : kind === 'frontend' ? Monitor : kind === 'backend' ? Server : kind === 'cache' || kind === 'queue' ? Package : kind === 'storage' ? FileText : Layers3;
  return <Icon className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />;
}

function TwinDetails({ node }: { readonly node: TwinNode }) {
  return <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-black/10 p-4"><p className="text-xs uppercase tracking-wide text-[color:var(--muted)]">No selecionado</p><h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">{node.label}</h3><p className="mt-2 text-sm text-[color:var(--muted)]">{node.responsibility}</p><KeyValue label="Tecnologia" value={node.technology} /><KeyValue label="Dependencias" value={node.dependencies.join(', ') || 'nenhuma'} /><KeyValue label="Arquivos" value={node.files.join(', ') || 'sem evidencia'} mono /><KeyValue label="Logs" value={node.logs.join(' ')} /></div>;
}

function KeyValue({ label, value, mono = false }: { readonly label: string; readonly value: string; readonly mono?: boolean }) {
  return <div className="mt-3"><p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-2)]">{label}</p><p className={cn('mt-1 text-sm text-[color:var(--text)]', mono && 'font-mono text-xs')}>{value}</p></div>;
}

function DashboardPanel({ title, icon: Icon, items }: { readonly title: string; readonly icon: LucideIcon; readonly items: readonly string[] }) {
  const visible = items.filter(Boolean);
  return <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_64%,transparent)] p-4" open><summary className="flex cursor-pointer list-none items-center gap-3"><Icon className="h-5 w-5 text-[color:var(--accent)]" /><span className="font-semibold text-[color:var(--text)]">{title}</span></summary><div className="mt-3 flex flex-wrap gap-2">{visible.length ? visible.map((item) => <Badge key={item}>{item}</Badge>) : <span className="text-sm text-[color:var(--muted)]">Sem evidencia configurada.</span>}</div></details>;
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
  const missing = verification.filter((item) => item.status === 'missing');
  return <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-black/10 p-4"><Badge tone="warning">Modo deterministico</Badge><p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">A arquitetura combina {project.technology_graph.framework.name}, {project.technology_graph.runtime.name} e {project.technology_graph.architecture.name} porque estes itens estao no blueprint salvo. As vantagens e limitacoes abaixo foram derivadas de selecoes e evidencias, nao de um LLM.</p><div className="mt-4 grid gap-3 md:grid-cols-2"><KeyValue label="Padroes" value={[project.technology_graph.architecture.name, ...project.selected_capabilities].join(', ')} /><KeyValue label="Melhorias futuras" value={missing.length ? missing.map((item) => item.label).join(', ') : 'Nenhuma ausencia detectada pela verificacao atual.'} /></div></div>;
}
