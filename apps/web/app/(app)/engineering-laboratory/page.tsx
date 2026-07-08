'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bot,
  Braces,
  CheckCircle2,
  Cloud,
  Code2,
  Cpu,
  Database,
  Download,
  FileCode2,
  FlaskConical,
  GitBranch,
  Layers3,
  Package,
  Play,
  Search,
  ServerCog,
  ShieldAlert,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react';

import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LlmProviderInline } from '@/components/llm/llm-gated-action';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';
import {
  engineeringLabClient,
  type EngineeringLabModule,
  type EngineeringLabOverview,
  type EngineeringLabTerminalResponse,
} from '@/lib/api/engineering-lab';

const MODULES = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { id: 'api-explorer', label: 'API Explorer', icon: Braces },
  { id: 'security', label: 'Security Center', icon: ShieldAlert },
  { id: 'quality', label: 'Code Quality', icon: Code2 },
  { id: 'architecture', label: 'Architecture', icon: GitBranch },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'performance', label: 'Performance', icon: Cpu },
  { id: 'tests', label: 'Tests', icon: FlaskConical },
  { id: 'dependencies', label: 'Dependencies', icon: Package },
  { id: 'devops', label: 'DevOps', icon: ServerCog },
  { id: 'ai-assistant', label: 'AI Assistant', icon: Bot },
  { id: 'export', label: 'Export', icon: FileCode2 },
] as const;

export default function EngineeringLaboratoryPage() {
  return (
    <Suspense fallback={<CardLoading className="h-96" />}>
      <EngineeringLaboratoryInner />
    </Suspense>
  );
}

function EngineeringLaboratoryInner() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId') ?? '';
  const [projectId, setProjectId] = useState(initialProjectId);
  const [loadedProjectId, setLoadedProjectId] = useState(initialProjectId);
  const [activeModule, setActiveModule] = useState('overview');
  const [overview, setOverview] = useState<EngineeringLabOverview | null>(null);
  const [loading, setLoading] = useState(Boolean(initialProjectId));
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState('git status --short');
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalRuns, setTerminalRuns] = useState<EngineeringLabTerminalResponse[]>([]);

  useEffect(() => {
    if (!initialProjectId) return;
    void load(initialProjectId);
  }, [initialProjectId]);

  async function load(id = projectId.trim()) {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await engineeringLabClient.overview(id);
      setOverview(result);
      setLoadedProjectId(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar o laboratorio.');
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }

  async function runTerminal() {
    if (!loadedProjectId || !command.trim()) return;
    setTerminalBusy(true);
    setError(null);
    try {
      const result = await engineeringLabClient.runTerminal(loadedProjectId, command.trim());
      setTerminalRuns((current) => [result, ...current].slice(0, 8));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Comando recusado pelo backend.');
    } finally {
      setTerminalBusy(false);
    }
  }

  const moduleMap = useMemo(() => new Map(overview?.modules.map((item) => [item.id, item]) ?? []), [overview]);
  const activeStatus = moduleMap.get(activeModule);

  return (
    <div className="min-h-[calc(100vh-8rem)] space-y-5 pb-24">
      <section className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--surface)_88%,black),color-mix(in_srgb,var(--surface-2)_84%,var(--accent)_16%))] p-5 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] opacity-70" />
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
              <Layers3 className="h-3.5 w-3.5" aria-hidden />
              {t('lab.badge')}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--text)] md:text-5xl">
                {t('lab.title')}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--muted)] md:text-base">
                {t('lab.subtitle')}
              </p>
            </div>
          </div>
          <div className="w-full max-w-xl rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-black/30 p-3 backdrop-blur">
            <label className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{t('lab.projectId')}</label>
            <div className="mt-2 flex gap-2">
              <Input
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                placeholder={t('lab.projectIdPlaceholder')}
                className="font-mono"
              />
              <Button type="button" variant="primary" loading={loading} onClick={() => void load()}>
                {t('lab.analyze')}
              </Button>
            </div>
            <p className="mt-2 text-xs text-[color:var(--muted-2)]">
              {t('lab.projectIdHint')}
            </p>
          </div>
        </div>
      </section>

      {error ? <PageError title={t('lab.unavailable')} description={error} onRetry={() => void load()} /> : null}
      {loading ? <CardLoading className="h-96" /> : null}

      {!loading && !overview ? (
        <Card className="grid min-h-80 place-items-center text-center">
          <div className="max-w-md space-y-3">
            <Search className="mx-auto h-8 w-8 text-[color:var(--accent)]" aria-hidden />
            <h2 className="text-lg font-semibold text-[color:var(--text)]">{t('lab.noProject')}</h2>
            <p className="text-sm leading-6 text-[color:var(--muted)]">
              {t('lab.noProjectHint')}
            </p>
          </div>
        </Card>
      ) : null}

      {overview ? (
        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-2 rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_76%,transparent)] p-2 xl:sticky xl:top-24 xl:h-[calc(100vh-8rem)] xl:overflow-auto">
            {MODULES.map((item) => {
              const Icon = item.icon;
              const status = moduleMap.get(item.id)?.status ?? 'not_configured';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  className={cn(
                    'focus-ring flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm transition',
                    activeModule === item.id
                      ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[color:var(--text)]'
                      : 'text-[color:var(--muted)] hover:bg-white/5 hover:text-[color:var(--text)]',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <StatusDot status={status} />
                </button>
              );
            })}
          </aside>

          <main className="min-w-0 space-y-5">
            <TelemetryStrip overview={overview} />
            <ModuleBanner module={activeStatus} />
            {activeModule === 'overview' ? <OverviewPanel overview={overview} /> : null}
            {activeModule === 'terminal' ? (
              <TerminalPanel
                command={command}
                busy={terminalBusy}
                runs={terminalRuns}
                onCommandChange={setCommand}
                onRun={() => void runTerminal()}
              />
            ) : null}
            {activeModule === 'api-explorer' ? <ApiExplorerPanel overview={overview} /> : null}
            {activeModule === 'security' ? <SecurityPanel overview={overview} /> : null}
            {activeModule === 'quality' ? <QualityPanel overview={overview} /> : null}
            {activeModule === 'architecture' ? <ArchitecturePanel overview={overview} /> : null}
            {activeModule === 'database' ? <EvidencePanel title={t('lab.database')} items={overview.databases} empty="Nenhum banco detectado nos arquivos." icon={Database} /> : null}
            {activeModule === 'performance' ? <UnavailablePanel label="Performance" reason="Benchmark real exige ferramenta e alvo configurados. Nenhum P95/P99 foi inventado." /> : null}
            {activeModule === 'tests' ? <TestsPanel overview={overview} /> : null}
            {activeModule === 'dependencies' ? <DependenciesPanel overview={overview} /> : null}
            {activeModule === 'devops' ? <DevOpsPanel overview={overview} /> : null}
            {activeModule === 'ai-assistant' ? (
              <section className="rounded-2xl border border-[color:var(--border)] bg-card/60 p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Bot className="h-5 w-5 text-[color:var(--accent)]" />
                    {t('lab.aiAssistant')}
                  </h2>
                  <LlmProviderInline />
                </div>
                <p className="text-sm text-[color:var(--muted)]">
                  {t('lab.aiAssistantHint')}
                </p>
              </section>
            ) : null}
            {activeModule === 'export' ? <ExportPanel overview={overview} /> : null}
          </main>
        </div>
      ) : null}
    </div>
  );
}

function TelemetryStrip({ overview }: { readonly overview: EngineeringLabOverview }) {
  const metrics = [
    ['Health Score', `${overview.health_score}%`],
    ['Arquivos', overview.file_count.toLocaleString('pt-BR')],
    ['Linhas', overview.line_count.toLocaleString('pt-BR')],
    ['Dependencias', overview.dependency_count.toLocaleString('pt-BR')],
    ['Build', overview.build],
    ['Coverage', overview.coverage],
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {metrics.map(([label, value]) => (
        <div key={label} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_72%,transparent)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted-2)]">{label}</p>
          <p className="mt-2 truncate font-mono text-xl font-semibold text-[color:var(--text)]">{value}</p>
        </div>
      ))}
    </section>
  );
}

function ModuleBanner({ module }: { readonly module?: EngineeringLabModule }) {
  if (!module) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_55%,transparent)] px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-[color:var(--text)]">{module.label}</p>
        <p className="text-xs text-[color:var(--muted)]">{module.summary}</p>
      </div>
      <StatusBadge status={module.status} />
    </div>
  );
}

function OverviewPanel({ overview }: { readonly overview: EngineeringLabOverview }) {
  const { t } = useLocale();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">{t('lab.project')}</h2>
        <KeyValue label="Nome" value={overview.project_name} />
        <KeyValue label="Stack" value={overview.stack} />
        <KeyValue label="Linguagem principal" value={overview.primary_language} />
        <KeyValue label="Path" value={overview.project_path} mono />
        <KeyValue label="Ultima analise" value={overview.last_analysis} mono />
      </Card>
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">{t('lab.languages')}</h2>
        {Object.entries(overview.languages).length ? Object.entries(overview.languages).map(([language, count]) => (
          <div key={language}>
            <div className="flex justify-between text-sm">
              <span>{language}</span>
              <span className="font-mono">{count}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[color:var(--border)]">
              <div className="h-full rounded-full bg-[color:var(--accent)]" style={{ width: `${Math.min(100, (count / overview.file_count) * 100)}%` }} />
            </div>
          </div>
        )) : <p className="text-sm text-[color:var(--muted)]">{t('lab.noLanguages')}</p>}
      </Card>
    </div>
  );
}

function TerminalPanel({
  command,
  busy,
  runs,
  onCommandChange,
  onRun,
}: {
  readonly command: string;
  readonly busy: boolean;
  readonly runs: readonly EngineeringLabTerminalResponse[];
  readonly onCommandChange: (value: string) => void;
  readonly onRun: () => void;
}) {
  const { t } = useLocale();
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-[color:var(--border)] bg-black/30 p-4 md:flex-row">
        <Input value={command} onChange={(event) => onCommandChange(event.target.value)} className="font-mono" />
        <Button type="button" variant="primary" loading={busy} onClick={onRun}>
          <Play className="h-4 w-4" aria-hidden />
          {t('lab.run')}
        </Button>
      </div>
      <div className="min-h-96 bg-[#05070a] p-4 font-mono text-xs ds-text-primary">
        {runs.length === 0 ? (
          <p className="ds-text-muted">{t('lab.waitingCommand')}</p>
        ) : runs.map((run) => (
          <div key={`${run.command}-${run.duration_ms}-${run.exit_code}`} className="mb-5 border-b border-white/10 pb-4 last:border-0">
            <div className="mb-2 flex flex-wrap items-center gap-3 ds-text-secondary">
              <span>$ {run.command}</span>
              <span>{`exit ${run.exit_code}`}</span>
              <span>{`${run.duration_ms}ms`}</span>
              <span className="truncate">{run.cwd}</span>
            </div>
            {run.output.map((chunk, index) => (
              <pre key={index} className={cn('whitespace-pre-wrap', chunk.kind === 'stderr' ? 'text-rose-300' : 'ds-text-primary')}>{chunk.text}</pre>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ApiExplorerPanel({ overview }: { readonly overview: EngineeringLabOverview }) {
  const { t } = useLocale();
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">{t('lab.endpoints')}</h2>
      {overview.api_endpoints.length ? (
        <div className="space-y-2">
          {overview.api_endpoints.map((endpoint, index) => (
            <div key={`${endpoint.method}-${endpoint.path}-${index}`} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
              <span className="rounded bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-2 py-1 font-mono text-xs text-[color:var(--accent)]">{endpoint.method}</span>
              <span className="font-mono text-sm">{endpoint.path}</span>
              <span className="ml-auto truncate text-xs text-[color:var(--muted)]">{endpoint.source}</span>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-[color:var(--muted)]">{t('lab.noEndpoints')}</p>}
    </Card>
  );
}

function SecurityPanel({ overview }: { readonly overview: EngineeringLabOverview }) {
  const { t } = useLocale();
  const findings = overview.diagnosis.security_findings;
  return (
    <Card className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="h-5 w-5 text-[color:var(--warning)]" />{t('lab.securityCenter')}</h2>
      {findings.length ? findings.map((finding) => (
        <IssueRow key={`${finding.code}-${finding.path}-${finding.line ?? 0}`} severity={finding.severity} title={finding.message} detail={`${finding.path}${finding.line ? `:${finding.line}` : ''}`} />
      )) : <p className="text-sm text-[color:var(--muted)]">{t('lab.noSecurityFindings')}</p>}
    </Card>
  );
}

function QualityPanel({ overview }: { readonly overview: EngineeringLabOverview }) {
  const { t } = useLocale();
  const smells = overview.diagnosis.smells;
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">{t('lab.codeQuality')}</h2>
      {smells.length ? smells.map((smell) => (
        <IssueRow key={smell.code} severity="medium" title={smell.message} detail={smell.related_paths.join(', ') || smell.code} />
      )) : <p className="text-sm text-[color:var(--muted)]">{t('lab.noSmells')}</p>}
    </Card>
  );
}

function ArchitecturePanel({ overview }: { readonly overview: EngineeringLabOverview }) {
  const { t } = useLocale();
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">{t('lab.architectureGraph')}</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{t('lab.nodes')}</p>
          {overview.architecture_nodes.map((node) => <Pill key={node.id} label={node.label} />)}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{t('lab.edges')}</p>
          {overview.architecture_edges.length ? overview.architecture_edges.map((edge) => (
            <Pill key={`${edge.source}-${edge.target}`} label={`${edge.source} -> ${edge.target} (${edge.label})`} />
          )) : <p className="text-sm text-[color:var(--muted)]">{t('lab.noEdges')}</p>}
        </div>
      </div>
    </Card>
  );
}

function TestsPanel({ overview }: { readonly overview: EngineeringLabOverview }) {
  const { t } = useLocale();
  return <EvidencePanel title={t('lab.tests')} items={[overview.coverage]} empty="Nenhuma suite de testes detectada." icon={FlaskConical} />;
}

function DependenciesPanel({ overview }: { readonly overview: EngineeringLabOverview }) {
  const { t } = useLocale();
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">{t('lab.dependencies')}</h2>
      {overview.dependencies.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {overview.dependencies.map((dependency) => (
            <div key={`${dependency.source}-${dependency.name}`} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
              <p className="font-mono text-sm text-[color:var(--text)]">{dependency.name}</p>
              <p className="mt-1 text-xs text-[color:var(--muted)]">{dependency.version ?? 'sem versao'} - {dependency.source}</p>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-[color:var(--muted)]">{t('lab.noManifests')}</p>}
    </Card>
  );
}

function DevOpsPanel({ overview }: { readonly overview: EngineeringLabOverview }) {
  const { t } = useLocale();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <EvidencePanel title={t('lab.containers')} items={overview.containers} empty="Sem Dockerfile ou compose." icon={Package} />
      <EvidencePanel title={t('lab.cloud')} items={overview.cloud} empty="Sem provider cloud detectado." icon={Cloud} />
      <EvidencePanel title={t('lab.build')} items={[overview.build]} empty="Build nao configurado." icon={ServerCog} />
    </div>
  );
}

function ExportPanel({ overview }: { readonly overview: EngineeringLabOverview }) {
  const { t } = useLocale();
  const summary = {
    project_id: overview.project_id,
    health_score: overview.health_score,
    security_findings: overview.diagnosis.security_findings.length,
    code_smells: overview.diagnosis.smells.length,
    api_endpoints: overview.api_endpoints.length,
  };

  function downloadFullReport() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(overview, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${overview.project_id}-engineering-lab-report.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('lab.export')}</h2>
        <Button onClick={downloadFullReport} className="h-9">
          <Download className="h-4 w-4" /> Baixar relatorio completo (JSON)
        </Button>
      </div>
      <p className="text-sm text-[color:var(--muted)]">{t('lab.exportHint')}</p>
      <pre className="max-h-72 overflow-auto rounded-[var(--radius-md)] bg-black/40 p-4 text-xs">{JSON.stringify(summary, null, 2)}</pre>
    </Card>
  );
}

function EvidencePanel({ title, items, empty, icon: Icon }: { readonly title: string; readonly items: readonly string[]; readonly empty: string; readonly icon: LucideIcon }) {
  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5 text-[color:var(--accent)]" />{title}</h2>
      {items.length && items.some(Boolean) ? items.filter(Boolean).map((item) => <Pill key={item} label={item} />) : <p className="text-sm text-[color:var(--muted)]">{empty}</p>}
    </Card>
  );
}

function UnavailablePanel({ label, reason }: { readonly label: string; readonly reason: string }) {
  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="h-5 w-5 text-[color:var(--warning)]" />{label}</h2>
      <p className="text-sm leading-6 text-[color:var(--muted)]">{reason}</p>
    </Card>
  );
}

function KeyValue({ label, value, mono = false }: { readonly label: string; readonly value: string; readonly mono?: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{label}</p>
      <p className={cn('mt-1 break-words text-sm text-[color:var(--text)]', mono && 'font-mono')}>{value || '-'}</p>
    </div>
  );
}

function IssueRow({ severity, title, detail }: { readonly severity: string; readonly title: string; readonly detail: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-medium text-[color:var(--text)]">{title}</p>
        <span className="rounded-full border border-[color:var(--border)] px-2 py-1 text-xs uppercase text-[color:var(--muted)]">{severity}</span>
      </div>
      <p className="mt-2 font-mono text-xs text-[color:var(--muted)]">{detail || 'sem arquivo relacionado'}</p>
    </div>
  );
}

function Pill({ label }: { readonly label: string }) {
  return <span className="mr-2 inline-flex rounded-full border border-[color:var(--border)] px-3 py-1 text-xs text-[color:var(--muted)]">{label}</span>;
}

function StatusDot({ status }: { readonly status: string }) {
  const color = status === 'ready' ? 'bg-emerald-400' : status === 'unsupported' ? 'bg-rose-400' : 'bg-amber-400';
  return <span className={cn('h-2 w-2 rounded-full', color)} aria-hidden />;
}

function StatusBadge({ status }: { readonly status: string }) {
  const label = status === 'ready' ? 'Real' : status === 'unsupported' ? 'Nao suportado' : 'Nao configurado';
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
      {status === 'ready' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
      {label}
    </span>
  );
}
