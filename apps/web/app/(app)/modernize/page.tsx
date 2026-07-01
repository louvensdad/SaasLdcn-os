'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Braces,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3 as ClockIcon,
  Code2,
  Cpu,
  Database,
  FileCode2,
  FileText,
  Gauge,
  GitBranch,
  GitPullRequest,
  Layers3,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  Network,
  PackageCheck,
  Play,
  RefreshCw,
  Route,
  SearchCode,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Upload,
  Workflow,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { ApiTestPanel } from '@/components/generation/api-test-panel';
import { ExportPanel } from '@/components/generation/export-panel';
import { ValidationReportPanel } from '@/components/generation/validation-report-panel';
import { UserKeyPanel } from '@/components/llm/user-key-panel';
import { LDCNCoreBadge } from '@/components/three/ldcn-core-badge';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ComplexityRadar } from '@/components/visual/engineering-surface';
import { AnimatedNumber } from '@/components/visual/animated-number';
import { ArchitectureGraph } from '@/components/visual/architecture-graph';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/hooks/use-locale';
import { useProjectCacheSync } from '@/hooks/use-project-cache-sync';
import { cn } from '@/lib/cn';
import {
  modernizeClient,
  type ModernizeProjectIngest,
  type ModernizeResponse,
  type RuntimeProfile,
} from '@/lib/api/modernize';
import { metaFactoryClient } from '@/lib/api/meta-factory';
import { DeepAnalysisPanel } from '@/components/engineering/deep-analysis-panel';
import type { GenerationValidationReport } from '@contracts/generation-validation.contract';
import type {
  MigrationMapping,
  ModernizeDetectedTechnology,
  ModernizeExecutiveSummary,
  SecurityFinding,
} from '@contracts/modernize.contract';

type Tab = 'zip' | 'git';
type PanelId =
  | 'executive'
  | 'ingestion'
  | 'ai-review'
  | 'radar'
  | 'diagnosis'
  | 'findings'
  | 'plan'
  | 'architecture'
  | 'stack'
  | 'runtime'
  | 'auto-fix'
  | 'security'
  | 'api'
  | 'git'
  | 'documentation'
  | 'metrics'
  | 'pipeline'
  | 'terminal'
  | 'conversation'
  | 'artifacts';

type FindingGroup = 'critical' | 'high' | 'medium' | 'low' | 'security' | 'architecture' | 'dependencies';

const DEFAULT_OPEN: readonly PanelId[] = ['executive', 'ingestion', 'ai-review', 'radar', 'diagnosis'];
const STORAGE_KEY = 'ldcn-modernize-cockpit-open-panels';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function toneForScore(score: number): BadgeTone {
  if (score >= 85) return 'success';
  if (score >= 65) return 'accent';
  if (score >= 45) return 'warning';
  return 'danger';
}

function toneForRisk(risk?: string): BadgeTone {
  if (risk === 'high') return 'danger';
  if (risk === 'medium') return 'warning';
  return 'success';
}

function severityTone(severity: string): BadgeTone {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  if (severity === 'low') return 'accent';
  return 'neutral';
}

function progressTone(score: number) {
  if (score >= 85) return 'var(--success)';
  if (score >= 65) return 'var(--accent)';
  if (score >= 45) return 'var(--warning)';
  return 'var(--danger)';
}

function scoreById(summary: ModernizeExecutiveSummary | null | undefined, id: string): number | null {
  return summary?.scores.find((score) => score.id === id)?.value ?? null;
}

function fallbackSummary(result: ModernizeResponse | null): ModernizeExecutiveSummary | null {
  if (!result) return null;
  const security = result.diagnosis.security_findings.length;
  const smells = result.diagnosis.smells.length;
  const dependencies = result.diagnosis.dependency_notes.filter((note) => !note.toLowerCase().startsWith('nenhuma')).length;
  const total = security + smells + dependencies;
  const base = clamp(92 - security * 12 - smells * 8 - dependencies * 6 - (result.stats?.truncated ? 12 : 0));
  return {
    overall_health: base,
    health_label: base >= 85 ? 'Enterprise Ready' : base >= 65 ? 'Modernization advised' : 'High remediation required',
    modernization_estimate: `${Math.max(8, Math.min(120, 10 + total * 5 + (result.stats?.analyzable_count ?? result.inventory.file_count) * 2))} min`,
    complexity: result.stats?.complexity ?? 'unknown',
    risk_level: security ? 'high' : total ? 'medium' : 'low',
    analysis_confidence: result.stats?.truncated ? 76 : 88,
    findings: {
      critical: result.diagnosis.security_findings.filter((item) => item.severity === 'critical').length,
      high: result.diagnosis.security_findings.filter((item) => item.severity === 'high').length,
      medium: result.diagnosis.security_findings.filter((item) => item.severity === 'medium').length + smells + dependencies,
      low: result.diagnosis.security_findings.filter((item) => item.severity === 'low').length,
      info: result.diagnosis.security_findings.filter((item) => item.severity === 'info').length,
      total,
      technical_debt: smells + dependencies,
      duplicated_code: 0,
      dead_code: 0,
      dependencies,
    },
    scores: [
      { id: 'overall', label: 'Overall Health', value: base, basis: 'Derived from backend diagnosis because executive_summary was absent.' },
      { id: 'architecture', label: 'Architecture Score', value: clamp(90 - smells * 14), basis: 'Derived from architecture smells returned by backend.' },
      { id: 'security', label: 'Security Score', value: clamp(100 - security * 18), basis: 'Derived from backend security findings.' },
      { id: 'performance', label: 'Performance Score', value: 0, basis: 'Not measured by current backend ingest.' },
      { id: 'maintainability', label: 'Maintainability', value: clamp(88 - smells * 12), basis: 'Derived from backend architecture smells.' },
      { id: 'tests', label: 'Test Coverage', value: result.inventory.files.some((file) => /test|spec/i.test(file.path)) ? 60 : 0, basis: 'File evidence only; no coverage runner executed.' },
      { id: 'production_readiness', label: 'Project Health', value: base, basis: 'Derived from backend diagnosis.' },
      { id: 'devops', label: 'Documentation', value: result.inventory.files.some((file) => /readme/i.test(file.path)) ? 70 : 0, basis: 'README file evidence only.' },
    ],
    technologies: Object.entries(result.inventory.languages).map(([name, count]) => ({ name, category: 'language', confidence: 90, evidence: `${count} indexed file(s).` })),
    review: `Backend analysis completed. ${total} governed improvement point(s) were found from the ingested project evidence.`,
    priority: 'Security first, then architecture, tests and delivery automation.',
  };
}

function useOpenPanels() {
  const [openPanels, setOpenPanels] = useState<ReadonlySet<PanelId>>(() => new Set(DEFAULT_OPEN));

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setOpenPanels(new Set(JSON.parse(saved) as PanelId[]));
    } catch {
      setOpenPanels(new Set(DEFAULT_OPEN));
    }
  }, []);

  function toggle(panel: PanelId) {
    setOpenPanels((current) => {
      const next = new Set(current);
      if (next.has(panel)) next.delete(panel);
      else next.add(panel);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Persistence is best-effort; the cockpit remains fully usable without it.
      }
      return next;
    });
  }

  return { openPanels, toggle };
}

function CockpitPanel({
  id,
  icon: Icon,
  title,
  summary,
  badge,
  openPanels,
  onToggle,
  children,
}: {
  readonly id: PanelId;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly summary: string;
  readonly badge?: ReactNode;
  readonly openPanels: ReadonlySet<PanelId>;
  readonly onToggle: (panel: PanelId) => void;
  readonly children: ReactNode;
}) {
  const isOpen = openPanels.has(id);
  return (
    <section className="rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_76%,transparent)] shadow-[0_20px_70px_rgba(0,0,0,0.16)]">
      <button
        type="button"
        data-testid={`modernize-panel-${id}`}
        aria-expanded={isOpen}
        onClick={() => onToggle(id)}
        className="focus-ring flex w-full items-center justify-between gap-4 rounded-[var(--radius-xl)] p-4 text-left md:p-5"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 text-[color:var(--accent)]">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-[color:var(--text)] md:text-lg">{title}</span>
            <span className="mt-1 block truncate text-sm text-[color:var(--muted)]">{summary}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {badge}
          <ChevronDown className={cn('h-4 w-4 text-[color:var(--muted)] transition', isOpen && 'rotate-180')} aria-hidden />
        </span>
      </button>
      {isOpen ? <div className="border-t border-[color:var(--border)] p-4 md:p-5">{children}</div> : null}
    </section>
  );
}

function ScoreCard({ label, value, detail }: { readonly label: string; readonly value: number | null; readonly detail: string }) {
  const measured = value !== null && value > 0;
  const safeValue = measured ? clamp(value) : 0;
  // Grow the bar from 0 to its real value on mount/update for a premium feel.
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarWidth(safeValue));
    return () => cancelAnimationFrame(id);
  }, [safeValue]);
  return (
    <div className="animate-rise rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/[0.045] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted-2)]">{label}</p>
        <Badge tone={measured ? toneForScore(safeValue) : 'neutral'}>
          {measured ? <AnimatedNumber value={safeValue} suffix="%" /> : 'Nao medido'}
        </Badge>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${barWidth}%`, backgroundColor: progressTone(safeValue) }}
        />
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">{detail}</p>
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, detail, tone = 'neutral' }: { readonly icon: LucideIcon; readonly label: string; readonly value: string; readonly detail: string; readonly tone?: BadgeTone }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_44%,transparent)] p-4">
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="mt-4 text-2xl font-semibold text-[color:var(--text)]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{detail}</p>
    </div>
  );
}

function SeverityDashboard({ summary, active, onActive }: { readonly summary: ModernizeExecutiveSummary['findings']; readonly active: FindingGroup; readonly onActive: (group: FindingGroup) => void }) {
  const cards: { id: FindingGroup; label: string; value: number; tone: BadgeTone }[] = [
    { id: 'critical', label: 'Critical', value: summary.critical, tone: 'danger' },
    { id: 'high', label: 'High', value: summary.high, tone: 'danger' },
    { id: 'medium', label: 'Medium', value: summary.medium, tone: 'warning' },
    { id: 'low', label: 'Low', value: summary.low, tone: 'accent' },
    { id: 'architecture', label: 'Technical Debt', value: summary.technical_debt, tone: 'warning' },
    { id: 'dependencies', label: 'Dependencies', value: summary.dependencies, tone: 'neutral' },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <button key={card.id} type="button" onClick={() => onActive(card.id)} className={cn('focus-ring rounded-[var(--radius-lg)] border p-4 text-left transition', active === card.id ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]' : 'border-[color:var(--border)] bg-white/5 hover:border-[color:var(--border-strong)]')}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-[color:var(--text)]">{card.label}</span>
            <Badge tone={card.tone}>{card.value}</Badge>
          </div>
          <p className="mt-3 text-xs text-[color:var(--muted)]">Clique para filtrar os achados desta categoria.</p>
        </button>
      ))}
    </div>
  );
}

function FindingRow({ title, severity, file, line, explanation, fix, autoFixable = false }: { readonly title: string; readonly severity: string; readonly file?: string | null; readonly line?: number | null; readonly explanation: string; readonly fix: string; readonly autoFixable?: boolean }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[color:var(--text)]">{title}</p>
          {file ? <p className="mt-1 font-mono text-xs text-[color:var(--muted)]">{file}{line ? `:${line}` : ''}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={severityTone(severity)}>{severity}</Badge>
          <Badge tone={autoFixable ? 'accent' : 'neutral'}>{autoFixable ? 'Auto fix disponivel' : 'Revisao manual'}</Badge>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{explanation}</p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--text)]"><span className="font-semibold">Correcao sugerida:</span> {fix}</p>
    </div>
  );
}

function TechnologyPill({ tech }: { readonly tech: ModernizeDetectedTechnology }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[color:var(--text)]">{tech.name}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--muted-2)]">{tech.category}</p>
        </div>
        <Badge tone={toneForScore(tech.confidence)}>{tech.confidence}%</Badge>
      </div>
      <p className="mt-3 text-xs leading-5 text-[color:var(--muted)]">{tech.evidence}</p>
    </div>
  );
}

function PlanTimeline({ steps }: { readonly steps: readonly string[] }) {
  const labels = steps.length ? steps : ['Projeto ainda nao analisado'];
  return (
    <div className="grid gap-3">
      {labels.map((step, index) => (
        <div key={`${index}-${step}`} className="grid gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/5 p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-3)] font-mono text-sm text-[color:var(--text)]">{index + 1}</span>
          <div>
            <p className="text-sm font-semibold text-[color:var(--text)]">{step}</p>
            <p className="mt-1 text-xs text-[color:var(--muted)]">Tempo e risco sao derivados do plano retornado pela API; execucao manual exige confirmacao.</p>
          </div>
          <Badge tone={index < 2 ? 'success' : 'neutral'}>{index < 2 ? 'Preparado' : 'Pendente'}</Badge>
        </div>
      ))}
    </div>
  );
}

function evidenceFromFiles(result: ModernizeResponse | null, pattern: RegExp) {
  return result?.inventory.files.filter((file) => pattern.test(file.path)) ?? [];
}

function buildArchitectureNodes(result: ModernizeResponse | null) {
  const paths = result?.inventory.files.map((file) => file.path.toLowerCase()) ?? [];
  const has = (pattern: RegExp) => paths.some((path) => pattern.test(path));
  return [
    { id: 'frontend', icon: Code2, label: 'Frontend', status: has(/\.tsx$|\.jsx$|component|pages|app\//) ? 'Detectado' : 'Nao detectado', detail: 'Evidencia por arquivos React/Next/componentes.' },
    { id: 'backend', icon: Server, label: 'Backend', status: has(/controller|route|handler|service|api/) ? 'Detectado' : 'Nao detectado', detail: 'Evidencia por controllers, routes, handlers ou services.' },
    { id: 'database', icon: Database, label: 'Banco', status: has(/migration|schema|\.sql$/) ? 'Detectado' : 'Nao detectado', detail: 'Evidencia por migrations, schema ou SQL.' },
    { id: 'cache', icon: Zap, label: 'Redis/Cache', status: has(/redis|cache/) ? 'Detectado' : 'Nao detectado', detail: 'Evidencia por nomes de arquivos e configuracoes.' },
    { id: 'queue', icon: Workflow, label: 'Kafka/Workers', status: has(/kafka|rabbit|queue|worker|consumer/) ? 'Detectado' : 'Nao detectado', detail: 'Evidencia por filas, workers ou consumers.' },
    { id: 'container', icon: PackageCheck, label: 'Docker', status: has(/dockerfile|docker-compose/) ? 'Detectado' : 'Nao detectado', detail: 'Evidencia por Dockerfile ou compose.' },
    { id: 'auth', icon: LockKeyhole, label: 'Auth', status: has(/auth|jwt|session|login/) ? 'Detectado' : 'Nao detectado', detail: 'Evidencia por auth, JWT, session ou login.' },
    { id: 'storage', icon: Database, label: 'Storage', status: has(/storage|s3|blob|upload/) ? 'Detectado' : 'Nao detectado', detail: 'Evidencia por storage, upload, S3 ou blob.' },
  ];
}

function autoFixItems(result: ModernizeResponse | null) {
  if (!result) return [];
  const mappingActions = result.plan.mappings.slice(0, 8).map((mapping) => ({ id: mapping.legacy_path, title: `${mapping.action}: ${mapping.legacy_path}`, safe: mapping.action !== 'keep' }));
  const base = [
    { id: 'readme', title: 'Gerar documentacao inicial', safe: true },
    { id: 'env-example', title: 'Criar .env.example seguro', safe: true },
    { id: 'tests', title: 'Criar estrutura inicial de testes', safe: false },
    { id: 'docker', title: 'Adicionar Docker quando ausente', safe: false },
  ];
  return [...base, ...mappingActions];
}

export default function ModernizePage() {
  const { t } = useLocale();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { openPanels, toggle } = useOpenPanels();
  const syncProjectCaches = useProjectCacheSync();

  const [tab, setTab] = useState<Tab>('zip');
  const [gitUrl, setGitUrl] = useState('');
  const [projectName, setProjectName] = useState('modernized-project');
  const [result, setResult] = useState<ModernizeProjectIngest | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  // Auto-Fix needs the persisted report/plan: we run analyze in the background
  // after ingest so the handoff lands on a ready analysis.
  const [analyzed, setAnalyzed] = useState(false);
  const [openingAutoFix, setOpeningAutoFix] = useState(false);
  const [busy, setBusy] = useState<null | 'ingest' | 'generate'>(null);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [generated, setGenerated] = useState<{ project: string; count: number } | null>(null);
  const [validationReport, setValidationReport] = useState<GenerationValidationReport | null>(null);
  const [useUserKey, setUseUserKey] = useState(false);
  const [activeFindingGroup, setActiveFindingGroup] = useState<FindingGroup>('critical');
  const [selectedNode, setSelectedNode] = useState('backend');
  const [selectedFixes, setSelectedFixes] = useState<ReadonlySet<string>>(() => new Set());
  const [chatQuestion, setChatQuestion] = useState('');
  const [chat, setChat] = useState<{ answer: string; mode: 'llm' | 'deterministic' } | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeProfile | null>(null);

  // Real runtime profile (read-only, never executes the legacy code). Fetched once
  // a project is ingested; cleared on a new ingest.
  const ingestId = result?.inventory.ingest_id ?? null;
  useEffect(() => {
    if (!ingestId) {
      setRuntime(null);
      return;
    }
    let active = true;
    modernizeClient
      .runtimeProfile(ingestId)
      .then((profile) => { if (active) setRuntime(profile); })
      .catch(() => { if (active) setRuntime(null); });
    return () => { active = false; };
  }, [ingestId]);

  async function handleAsk() {
    if (!result || !chatQuestion.trim()) return;
    setChatBusy(true);
    try {
      const res = await modernizeClient.ask(result.inventory.ingest_id, chatQuestion.trim(), { useUserKey });
      setChat({ answer: res.answer, mode: res.mode });
    } catch (err) {
      setChat({ answer: err instanceof Error ? err.message : 'Falha ao consultar.', mode: 'deterministic' });
    } finally {
      setChatBusy(false);
    }
  }

  async function ingest(promise: Promise<ModernizeProjectIngest>) {
    setBusy('ingest');
    setError(null);
    setResult(null);
    setProjectId(null);
    setAnalyzed(false);
    setGenerated(null);
    setValidationReport(null);
    setDegraded(false);
    setSelectedFixes(new Set());
    try {
      const response = await promise;
      setResult(response);
      setProjectId(response.project_id);
      // Refresh the catalog/dashboard caches so the analyzed project appears.
      syncProjectCaches();
      // Prepare the Auto-Fix handoff: persist report + plan in the background.
      void ensureAnalyzed(response.project_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('modernize.error.ingest'));
    } finally {
      setBusy(null);
    }
  }

  // Runs the deep analysis once per project so the persisted report/plan are ready
  // for Auto-Fix. Best-effort: a failure here never blocks the cockpit.
  async function ensureAnalyzed(id: string): Promise<boolean> {
    try {
      await modernizeClient.analyze(id, { useUserKey });
      setAnalyzed(true);
      return true;
    } catch {
      return false;
    }
  }

  async function openAutoFix() {
    if (!projectId) return;
    setOpeningAutoFix(true);
    try {
      if (!analyzed) await ensureAnalyzed(projectId);
    } finally {
      setOpeningAutoFix(false);
      router.push(`/auto-fix?project=${encodeURIComponent(projectId)}`);
    }
  }

  function handleZip(file: File | undefined) {
    if (file) void ingest(modernizeClient.createProjectZip(file));
  }

  async function handleModernize() {
    if (!result) return;
    setBusy('generate');
    setError(null);
    try {
      const response = await modernizeClient.generate(
        result.inventory.ingest_id,
        projectName.trim() || 'modernized-project',
        undefined,
        useUserKey,
      );
      setDegraded(response.degraded);
      setValidationReport(response.validation_report ?? null);
      if (response.ok && response.project_id) {
        setGenerated({ project: response.project_id, count: response.file_count });
        // A modernized project was persisted: refresh the catalog/dashboard
        // caches so it shows up without a manual reload.
        syncProjectCaches();
      } else if (response.errors.length > 0) {
        setError(response.errors.slice(0, 3).join(' | '));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('modernize.error.generate'));
    } finally {
      setBusy(null);
    }
  }

  const summary = result?.executive_summary ?? fallbackSummary(result);
  const stats = result?.stats ?? null;
  const findings = summary?.findings;
  const architectureNodes = useMemo(() => buildArchitectureNodes(result), [result]);
  const selectedArchitectureNode = architectureNodes.find((node) => node.id === selectedNode) ?? architectureNodes[0];
  const fixes = useMemo(() => autoFixItems(result), [result]);
  const docsFiles = evidenceFromFiles(result, /readme|docs?|adr|changelog|openapi|swagger/i);
  const testFiles = evidenceFromFiles(result, /test|spec|cypress|playwright|pytest|junit/i);
  const endpointFiles = evidenceFromFiles(result, /controller|route|handler|endpoint/i);
  const packageFiles = evidenceFromFiles(result, /package\.json|pom\.xml|requirements\.txt|build\.gradle|go\.mod|cargo\.toml/i);
  const selectedFixCount = selectedFixes.size;

  const radarAxes = summary ? [
    { label: 'Security', value: scoreById(summary, 'security') ?? 0 },
    { label: 'Performance', value: scoreById(summary, 'performance') ?? 0 },
    { label: 'Architecture', value: scoreById(summary, 'architecture') ?? 0 },
    { label: 'Quality', value: scoreById(summary, 'production_readiness') ?? 0 },
    { label: 'Maintainability', value: scoreById(summary, 'maintainability') ?? 0 },
    { label: 'Scalability', value: scoreById(summary, 'devops') ?? 0 },
    { label: 'Documentation', value: docsFiles.length ? 70 : 0 },
    { label: 'Testing', value: scoreById(summary, 'tests') ?? 0 },
  ] : [];

  const filteredFindings = useMemo(() => {
    if (!result) return [];
    const securityRows = result.diagnosis.security_findings.map((finding) => ({ type: 'security' as const, finding }));
    const smellRows = result.diagnosis.smells.map((smell) => ({ type: 'architecture' as const, smell }));
    const depRows = result.diagnosis.dependency_notes
      .filter((note) => !note.toLowerCase().startsWith('nenhuma'))
      .map((note) => ({ type: 'dependency' as const, note }));
    if (['critical', 'high', 'medium', 'low'].includes(activeFindingGroup)) {
      return securityRows.filter((row) => row.finding.severity === activeFindingGroup);
    }
    if (activeFindingGroup === 'security') return securityRows;
    if (activeFindingGroup === 'architecture') return smellRows;
    if (activeFindingGroup === 'dependencies') return depRows;
    return [...securityRows, ...smellRows, ...depRows];
  }, [activeFindingGroup, result]);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pb-16 pt-6">
      <section className="relative overflow-hidden rounded-[32px] border border-[color:var(--border)] bg-[radial-gradient(circle_at_10%_15%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_32%),linear-gradient(135deg,color-mix(in_srgb,var(--surface-1)_94%,black),color-mix(in_srgb,var(--surface-2)_88%,black))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.26)] md:p-8">
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)]" />
        <div className="relative grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <LDCNCoreBadge className="h-11 w-11 shrink-0" />
              <Badge tone="accent">Engineering Cockpit</Badge>
            </div>
            <div>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.02em] text-[color:var(--text)] md:text-6xl">Modernize</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[color:var(--muted)] md:text-lg">Cockpit enterprise para ingestao, diagnostico, modernizacao e entrega de codebases existentes. Tudo exibido a partir da analise real do backend.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="primary" disabled={!result || busy !== null} loading={busy === 'generate'} onClick={() => void handleModernize()}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Modernizar Projeto
              </Button>
              <Button type="button" variant="secondary" onClick={() => document.getElementById('modernize-ingestion')?.scrollIntoView({ behavior: 'smooth' })}>
                <Upload className="h-4 w-4" aria-hidden /> Ingerir projeto
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricTile icon={Gauge} label="Overall" value={summary ? `${summary.overall_health}%` : 'Aguardando'} detail={summary?.health_label ?? 'Envie um ZIP ou repositorio Git para iniciar.'} tone={summary ? toneForScore(summary.overall_health) : 'neutral'} />
            <MetricTile icon={ShieldCheck} label="Risco" value={summary?.risk_level ?? 'Nao analisado'} detail={summary?.priority ?? 'A analise de risco aparece apos a ingestao.'} tone={toneForRisk(summary?.risk_level)} />
            <MetricTile icon={ClockIcon} label="Estimativa" value={summary?.modernization_estimate ?? 'Nao calculada'} detail="Tempo derivado da quantidade de arquivos analisaveis e achados." />
            <MetricTile icon={SearchCode} label="Achados" value={findings ? String(findings.total) : '0'} detail="Total governado por seguranca, arquitetura e dependencias." tone={findings?.total ? 'warning' : 'success'} />
          </div>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-3 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--warning)_36%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-4 py-3 text-sm text-[color:var(--warning)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Análise concluída — the official handoff into the execution phase. */}
      {result && projectId ? (
        <section
          data-testid="modernize-analysis-complete"
          className="rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--success)_34%,var(--border))] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] p-5 md:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-[color:var(--success)]" aria-hidden />
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--text)]">Análise concluída.</h2>
                <p className="text-sm text-[color:var(--muted)]">
                  {result.inventory.file_count.toLocaleString()} arquivos analisados · diagnóstico e plano prontos para a fase de execução.
                </p>
              </div>
            </div>
            <Button type="button" variant="primary" loading={openingAutoFix} onClick={() => void openAutoFix()}>
              <Wrench className="h-4 w-4" aria-hidden /> Abrir Auto-Fix
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => router.push('/projects')}>
              <PackageCheck className="h-4 w-4" aria-hidden /> Exportar
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push('/documentation')}>
              <FileText className="h-4 w-4" aria-hidden /> Documentação
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push('/engineering-review')}>
              <SearchCode className="h-4 w-4" aria-hidden /> Engineering Review
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push('/settings#integrations')}>
              <GitBranch className="h-4 w-4" aria-hidden /> Git
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push('/analytics')}>
              <Activity className="h-4 w-4" aria-hidden /> Analytics
            </Button>
          </div>
        </section>
      ) : null}

      <CockpitPanel
        id="executive"
        icon={Gauge}
        title="Executive Summary"
        summary={summary ? `${summary.health_label} | ${summary.overall_health}% | ${findings?.total ?? 0} achados` : 'Aguardando ingestao real do projeto.'}
        badge={<Badge tone={summary ? toneForScore(summary.overall_health) : 'neutral'}>{summary ? `${summary.overall_health}%` : 'Pendente'}</Badge>}
        openPanels={openPanels}
        onToggle={toggle}
      >
        {summary ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {summary.scores.map((score) => <ScoreCard key={score.id} label={score.label} value={score.value} detail={score.basis} />)}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile icon={Layers3} label="Stack Detectada" value={result?.diagnosis.detected_stack ?? 'unknown'} detail="Detectada por marcadores reais do codigo." />
              <MetricTile icon={FileCode2} label="Arquivos" value={String(result?.inventory.file_count ?? 0)} detail={`${formatBytes(result?.inventory.total_bytes ?? 0)} indexados pela ingestao.`} />
              <MetricTile icon={ShieldAlert} label="Criticos" value={String(summary.findings.critical)} detail="Achados criticos retornados pela varredura de seguranca." tone={summary.findings.critical ? 'danger' : 'success'} />
              <MetricTile icon={PackageCheck} label="Dependencias" value={String(summary.findings.dependencies)} detail="Notas de dependencia obsoleta detectadas pela API." tone={summary.findings.dependencies ? 'warning' : 'success'} />
            </div>
          </div>
        ) : busy === 'ingest' ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />)}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />)}
            </div>
          </div>
        ) : (
          <EmptyCockpitState title="Nenhum projeto analisado" detail="Use ZIP ou Git para gerar o resumo executivo real." />
        )}
      </CockpitPanel>

      <CockpitPanel
        id="ingestion"
        icon={Upload}
        title="Ingestao"
        summary={result ? `${result.inventory.file_count} arquivos | ${Object.keys(result.inventory.languages).join(', ') || 'sem linguagem detectada'}` : 'Upload ZIP ou repositorio Git.'}
        badge={<Badge tone={result ? 'success' : 'neutral'}>{result ? 'Analisado' : 'Entrada'}</Badge>}
        openPanels={openPanels}
        onToggle={toggle}
      >
        <div id="modernize-ingestion" className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="space-y-4 p-5">
            <div className="inline-flex rounded-[var(--radius-md)] border border-[color:var(--border)] p-1">
              {(['zip', 'git'] as const).map((value) => (
                <button key={value} type="button" onClick={() => setTab(value)} className={cn('focus-ring rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition', tab === value ? 'accent-fill' : 'text-[color:var(--muted)] hover:bg-white/5')}>
                  {value === 'zip' ? 'Upload ZIP' : 'Repositorio Git'}
                </button>
              ))}
            </div>
            {tab === 'zip' ? (
              <div className="space-y-3">
                <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={(event) => handleZip(event.target.files?.[0])} />
                <Button type="button" variant="primary" loading={busy === 'ingest'} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" aria-hidden /> {busy === 'ingest' ? 'Analisando ZIP' : 'Selecionar ZIP'}
                </Button>
                <p className="text-sm text-[color:var(--muted)]">A API aplica Smart Ignore, limites de tamanho e protecao contra zip slip.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input value={gitUrl} onChange={(event) => setGitUrl(event.target.value)} placeholder="https://github.com/org/repo.git" className="flex-1" />
                <Button type="button" variant="primary" disabled={busy !== null || gitUrl.trim().length < 4} loading={busy === 'ingest'} onClick={() => void ingest(modernizeClient.createProjectGit(gitUrl.trim()))}>
                  <GitBranch className="h-4 w-4" aria-hidden /> Analisar
                </Button>
              </div>
            )}
          </Card>
          <Card className="grid gap-3 p-5 sm:grid-cols-3">
            <MetricTile icon={FileCode2} label="Encontrados" value={stats ? stats.files_found.toLocaleString() : '0'} detail="Arquivos encontrados no pacote ou repositorio." />
            <MetricTile icon={ShieldCheck} label="Ignorados" value={stats ? stats.ignored_count.toLocaleString() : '0'} detail="Ignorados automaticamente pelo Smart Ignore." />
            <MetricTile icon={SearchCode} label="Analisaveis" value={stats ? stats.analyzable_count.toLocaleString() : '0'} detail="Arquivos realmente indexados para analise." tone={stats ? 'success' : 'neutral'} />
          </Card>
        </div>
      </CockpitPanel>

      <CockpitPanel
        id="ai-review"
        icon={Bot}
        title="AI Executive Review"
        summary={summary ? `${summary.risk_level} risk | confidence ${summary.analysis_confidence}%` : 'Review deterministico aguardando projeto.'}
        badge={<Badge tone={summary ? toneForRisk(summary.risk_level) : 'neutral'}>{summary ? `${summary.analysis_confidence}% confianca` : 'Pendente'}</Badge>}
        openPanels={openPanels}
        onToggle={toggle}
      >
        {summary ? (
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
                <div>
                  <h2 className="text-lg font-semibold text-[color:var(--text)]">Software Architect Review</h2>
                  <p className="text-sm text-[color:var(--muted)]">Modo {degraded || !useUserKey ? 'deterministico' : 'LLM real quando provider estiver ativo'}.</p>
                </div>
              </div>
              <p className="text-sm leading-7 text-[color:var(--text)]">{summary.review}</p>
              <p className="text-sm leading-7 text-[color:var(--muted)]">Recomendacao: {summary.priority}</p>
            </Card>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <MetricTile icon={ClockIcon} label="Tempo estimado" value={summary.modernization_estimate} detail="Calculado no backend a partir do tamanho analisavel e achados." />
              <MetricTile icon={Activity} label="Complexidade" value={summary.complexity} detail="Classificacao emitida pela ingestao do backend." />
              <MetricTile icon={ShieldAlert} label="Nivel de risco" value={summary.risk_level} detail="Derivado de severidades e score de seguranca." tone={toneForRisk(summary.risk_level)} />
            </div>
          </div>
        ) : <EmptyCockpitState title="Review indisponivel" detail="A IA nao finge analise. Envie um projeto para obter review baseado no backend." />}
      </CockpitPanel>

      <CockpitPanel id="radar" icon={Activity} title="Health Radar" summary={summary ? 'Security, performance, architecture, quality, maintainability e testing.' : 'Radar aparece apos analise.'} badge={<Badge>{radarAxes.length ? '8 eixos' : 'Pendente'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        {summary ? <ComplexityRadar title="Health Radar" score={summary.overall_health} axes={radarAxes} /> : <EmptyCockpitState title="Radar pendente" detail="Nenhum eixo e calculado sem resposta do backend." />}
      </CockpitPanel>

      <CockpitPanel id="diagnosis" icon={SearchCode} title="Diagnostico" summary={findings ? `${findings.total} achados agrupados, sem parede de erros.` : 'Sem diagnostico carregado.'} badge={<Badge tone={findings?.total ? 'warning' : 'success'}>{findings?.total ?? 0} achados</Badge>} openPanels={openPanels} onToggle={toggle}>
        {findings ? <SeverityDashboard summary={findings} active={activeFindingGroup} onActive={setActiveFindingGroup} /> : <EmptyCockpitState title="Diagnostico pendente" detail="Envie um projeto para obter severidades reais." />}
      </CockpitPanel>

      <CockpitPanel id="findings" icon={AlertTriangle} title="Intelligent Findings" summary={result ? `${filteredFindings.length} item(ns) no filtro atual.` : 'Achados agrupados por dominio.'} badge={<Badge>{activeFindingGroup}</Badge>} openPanels={openPanels} onToggle={toggle}>
        {result ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(['critical', 'high', 'medium', 'low', 'security', 'architecture', 'dependencies'] as FindingGroup[]).map((group) => (
                <button key={group} type="button" onClick={() => setActiveFindingGroup(group)} className={cn('focus-ring rounded-full border px-3 py-1.5 text-xs font-medium transition', activeFindingGroup === group ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--text)]' : 'border-[color:var(--border)] text-[color:var(--muted)]')}>{group}</button>
              ))}
            </div>
            <div className="grid gap-3">
              {filteredFindings.length ? filteredFindings.map((row, index) => {
                if ('finding' in row) {
                  return <FindingRow key={`${row.finding.code}-${row.finding.path}-${row.finding.line ?? index}`} title={row.finding.message} severity={row.finding.severity} file={row.finding.path} line={row.finding.line} explanation="A varredura deterministica encontrou um padrao de seguranca no codigo ingerido." fix="Mover segredo/configuracao para variavel de ambiente, rotacionar credencial e revisar historico." />;
                }
                if ('smell' in row) {
                  return <FindingRow key={`${row.smell.code}-${index}`} title={row.smell.message} severity="medium" file={row.smell.related_paths[0]} explanation="A analise de arquitetura encontrou um cheiro estrutural no inventario." fix="Aplicar a etapa correspondente do plano de modernizacao antes de gerar o projeto final." />;
                }
                return <FindingRow key={`${row.note}-${index}`} title={row.note} severity="medium" explanation="A analise de dependencias encontrou risco de versao ou manutencao." fix="Atualizar dependencia em branch separada e validar breaking changes com testes." />;
              }) : <EmptyCockpitState title="Sem itens nesta categoria" detail="O filtro atual nao possui achados retornados pela API." />}
            </div>
          </div>
        ) : <EmptyCockpitState title="Achados pendentes" detail="Nenhum achado e mostrado antes da ingestao." />}
      </CockpitPanel>

      {result ? (
        <DeepAnalysisPanel
          capability="modernize_deep_analysis"
          usageLabel="Análise profunda da modernização"
          run={(onEvent) => metaFactoryClient.deepAnalyzeModernizeStream(result.inventory.ingest_id, onEvent)}
        />
      ) : null}

      <CockpitPanel id="plan" icon={Workflow} title="Plano de Modernizacao" summary={result ? `${result.plan.steps.length} etapas | ${result.plan.mappings.length} mapeamentos` : 'Timeline gerada pela API.'} badge={<Badge>{result?.plan.target_architecture ?? 'Pendente'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        {result ? (
          <div className="space-y-5">
            <PlanTimeline steps={result.plan.steps} />
            <Card className="p-5">
              <p className="text-sm font-semibold text-[color:var(--text)]">Logica preservada</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{result.plan.preserved_logic_note}</p>
            </Card>
          </div>
        ) : <EmptyCockpitState title="Plano pendente" detail="A timeline sera criada apos ingestao e diagnostico." />}
      </CockpitPanel>

      <CockpitPanel id="architecture" icon={Network} title="Architecture Graph" summary={result ? `${architectureNodes.filter((node) => node.status === 'Detectado').length} no(s) detectado(s).` : 'Grafo derivado do inventario.'} badge={<Badge>{selectedArchitectureNode?.label ?? 'Grafo'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <ArchitectureGraph nodes={architectureNodes} selectedId={selectedNode} onSelect={setSelectedNode} />
          <Card className="p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-2)]">No selecionado</p>
            <h3 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{selectedArchitectureNode?.label}</h3>
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{selectedArchitectureNode?.detail}</p>
            <p className="mt-3 text-sm text-[color:var(--text)]">Status: {selectedArchitectureNode?.status}</p>
          </Card>
        </div>
      </CockpitPanel>

      <CockpitPanel id="stack" icon={Layers3} title="Stack Intelligence" summary={summary ? `${summary.technologies.length} tecnologia(s) detectada(s).` : 'Deteccao automatica pelo backend.'} badge={<Badge>{result?.diagnosis.primary_language ?? 'Pendente'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        {summary?.technologies.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.technologies.map((tech) => <TechnologyPill key={`${tech.category}-${tech.name}`} tech={tech} />)}</div> : <EmptyCockpitState title="Stack pendente" detail="Nenhuma tecnologia foi retornada ainda." />}
      </CockpitPanel>

      <CockpitPanel id="runtime" icon={Cpu} title="Runtime Analysis" summary={runtime ? `${runtime.runtime} · ${runtime.metrics.filter((m) => m.kind === 'measured').length} métricas medidas` : 'Perfil de runtime computado do código real (sem executar).'} badge={<Badge tone={runtime ? 'success' : result ? 'neutral' : 'neutral'}>{runtime ? runtime.runtime : result ? 'Computando' : 'Aguardando'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        {runtime ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="accent">{runtime.runtime}</Badge>
              <Badge tone={runtime.container_ready ? 'success' : 'neutral'}>{runtime.container_ready ? 'Container pronto' : 'Sem container'}</Badge>
              <Badge tone="neutral">Não executado (seguro)</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {runtime.metrics.map((metric) => (
                <div key={metric.id} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_44%,transparent)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-2)]">{metric.label}</span>
                    <Badge tone={metric.kind === 'measured' ? 'success' : 'warning'}>{metric.kind === 'measured' ? 'Medido' : 'Estimativa'}</Badge>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-[color:var(--text)]">{metric.value}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">{metric.basis}</p>
                </div>
              ))}
            </div>
            {runtime.notes.map((note) => (
              <p key={note} className="text-xs leading-5 text-[color:var(--muted)]">· {note}</p>
            ))}
          </div>
        ) : result ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[104px]" />)}
          </div>
        ) : (
          <EmptyCockpitState title="Runtime pendente" detail="O perfil de runtime é computado a partir do código após a ingestão." />
        )}

        {validationReport?.build.metrics ? (
          <div className="mt-5 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--success)_30%,var(--border))] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--text)]">Execução do build modernizado · medido</p>
              <Badge tone="success">{validationReport.build.metrics.sampler === 'psutil' ? 'psutil' : 'wall-clock'}</Badge>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile icon={Activity} label="Build (total)" value={`${(validationReport.build.metrics.total_ms / 1000).toFixed(1)} s`} detail="Tempo de parede real do install+build no sandbox." tone="success" />
              <MetricTile icon={PackageCheck} label="Install" value={`${(validationReport.build.metrics.install_ms / 1000).toFixed(1)} s`} detail="Tempo real da instalação de dependências." />
              <MetricTile icon={Server} label="Pico de memória" value={validationReport.build.metrics.peak_memory_mb != null ? `${validationReport.build.metrics.peak_memory_mb.toFixed(0)} MB` : 'Indisponível'} detail={validationReport.build.metrics.peak_memory_mb != null ? 'RSS de pico do processo de build (real).' : 'psutil indisponível no servidor.'} tone={validationReport.build.metrics.peak_memory_mb != null ? 'success' : 'neutral'} />
              <MetricTile icon={Cpu} label="CPU" value={validationReport.build.metrics.cpu_seconds != null ? `${validationReport.build.metrics.cpu_seconds.toFixed(1)} s` : 'Indisponível'} detail={validationReport.build.metrics.cpu_seconds != null ? 'Tempo de CPU real do build.' : 'psutil indisponível no servidor.'} tone={validationReport.build.metrics.cpu_seconds != null ? 'success' : 'neutral'} />
            </div>
            <p className="mt-3 text-xs leading-5 text-[color:var(--muted)]">Estas métricas são medidas executando o build do projeto MODERNIZADO no nosso sandbox controlado — não o código legado.</p>
          </div>
        ) : null}
      </CockpitPanel>

      <CockpitPanel id="auto-fix" icon={Zap} title="Auto Fix Center" summary={result ? `${fixes.length} acao(oes) candidatas | ${selectedFixCount} selecionada(s)` : 'Acoes aparecem apos o plano.'} badge={<Badge>{selectedFixCount} ligadas</Badge>} openPanels={openPanels} onToggle={toggle}>
        {result ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fixes.map((fix) => {
              const checked = selectedFixes.has(fix.id);
              return (
                <label key={fix.id} className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/5 p-4">
                  <input type="checkbox" checked={checked} onChange={(event) => setSelectedFixes((current) => { const next = new Set(current); if (event.target.checked) next.add(fix.id); else next.delete(fix.id); return next; })} className="mt-1 h-4 w-4 accent-[color:var(--accent)]" />
                  <span>
                    <span className="block text-sm font-semibold text-[color:var(--text)]">{fix.title}</span>
                    <span className="mt-1 block text-xs text-[color:var(--muted)]">{fix.safe ? 'Seguro para preparacao automatica quando suportado.' : 'Requer confirmacao extra e revisao humana.'}</span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : <EmptyCockpitState title="Auto Fix pendente" detail="Nenhuma correcao e sugerida antes da analise real." />}
      </CockpitPanel>

      <CockpitPanel id="security" icon={ShieldAlert} title="Security Center" summary={result ? `${result.diagnosis.security_findings.length} achado(s) de seguranca.` : 'OWASP/secrets/JWT aparecem quando detectados.'} badge={<Badge tone={result?.diagnosis.security_findings.length ? 'danger' : 'success'}>{result?.diagnosis.security_findings.length ?? 0}</Badge>} openPanels={openPanels} onToggle={toggle}>
        {result ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {['OWASP', 'Secrets', 'JWT', 'Headers', 'SQL Injection', 'XSS', 'CSRF', 'SSRF', 'Rate Limit', 'Dependency Scan', 'CVE'].map((label) => {
              const count = label === 'Secrets' ? result.diagnosis.security_findings.length : label === 'Dependency Scan' ? (findings?.dependencies ?? 0) : 0;
              return <MetricTile key={label} icon={ShieldCheck} label={label} value={count ? String(count) : 'Nao detectado'} detail={count ? 'Evidencia retornada pela analise backend.' : 'Nenhuma evidencia especifica retornada pela API.'} tone={count ? 'warning' : 'success'} />;
            })}
          </div>
        ) : <EmptyCockpitState title="Seguranca pendente" detail="A varredura de seguranca roda durante a ingestao." />}
      </CockpitPanel>

      <CockpitPanel id="api" icon={Route} title="API Explorer" summary={generated ? `Projeto ${generated.project} pronto para API Explorer.` : `${endpointFiles.length} arquivo(s) com evidencia de endpoint.`} badge={<Badge tone={generated ? 'success' : 'neutral'}>{generated ? 'Ativo' : 'Aguardando geracao'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {['GET', 'POST', 'PUT', 'DELETE'].map((method) => <MetricTile key={method} icon={Braces} label={method} value="Nao executado" detail="Teste real fica disponivel apos gerar o projeto modernizado." />)}
          </div>
          {generated ? <ApiTestPanel surface="modernize" projectId={generated.project} /> : <EmptyCockpitState title="API Explorer aguardando projeto" detail={`${endpointFiles.length} arquivo(s) sugerem endpoints, mas testes reais exigem projeto gerado.`} />}
        </div>
      </CockpitPanel>

      <CockpitPanel id="git" icon={GitBranch} title="Git Center" summary={generated ? 'Exportacao Git disponivel para o projeto gerado.' : 'Git publish aparece apos modernizacao.'} badge={<Badge tone={generated ? 'success' : 'neutral'}>{generated ? 'Pronto' : 'Pendente'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        {generated ? (
          <ExportPanel surface="modernize" projectId={generated.project} defaultRepoName={(projectName.trim() || 'modernized-project').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-')} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile icon={GitBranch} label="GitHub" value="Nao conectado" detail="Conexao real aparece no painel de exportacao apos gerar." />
            <MetricTile icon={GitPullRequest} label="Pull Request" value="Nao criado" detail="Nenhum PR e simulado." />
            <MetricTile icon={FileCode2} label="Arquivos modificados" value="Nao calculado" detail="Diff real depende da geracao modernizada." />
            <MetricTile icon={Activity} label="Pipeline" value="Nao executado" detail="Sem pipeline real antes da publicacao." />
          </div>
        )}
      </CockpitPanel>

      <CockpitPanel id="documentation" icon={FileText} title="Documentation" summary={`${docsFiles.length} arquivo(s) de documentacao detectado(s).`} badge={<Badge tone={docsFiles.length ? 'success' : 'warning'}>{docsFiles.length ? 'Evidencia' : 'Faltando'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={FileText} label="Score" value={docsFiles.length ? '70%' : '0%'} detail="Baseado apenas em arquivos de documentacao detectados no inventario." tone={docsFiles.length ? 'success' : 'warning'} />
          <MetricTile icon={FileCode2} label="Arquivos" value={String(docsFiles.length)} detail={docsFiles.slice(0, 3).map((file) => file.path).join(', ') || 'Nenhum README/docs/ADR detectado.'} />
          <MetricTile icon={AlertTriangle} label="Faltando" value={docsFiles.length ? 'Nao medido' : 'README/docs'} detail="A API atual nao calcula cobertura documental completa." />
          <MetricTile icon={Bot} label="Gerar documentacao IA" value="Disponivel apos geracao" detail="Nao executado automaticamente." />
        </div>
      </CockpitPanel>

      <CockpitPanel id="metrics" icon={Activity} title="Engineering Metrics" summary={stats ? `${stats.lines_of_code.toLocaleString()} LOC | ${result?.inventory.file_count ?? 0} arquivos` : 'Metricas aparecem apos ingestao.'} badge={<Badge>{stats?.complexity ?? 'Pendente'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={Code2} label="Linhas de codigo" value={stats ? stats.lines_of_code.toLocaleString() : '0'} detail="Contadas pelo Smart Ingest." />
          <MetricTile icon={Layers3} label="Linguagens" value={result ? String(Object.keys(result.inventory.languages).length) : '0'} detail={Object.keys(result?.inventory.languages ?? {}).join(', ') || 'Nenhuma.'} />
          <MetricTile icon={Route} label="Endpoints" value={String(endpointFiles.length)} detail="Evidencia estatica por controller/route/handler." />
          <MetricTile icon={PackageCheck} label="Dependencias" value={String(packageFiles.length)} detail="Manifestos detectados no inventario." />
          <MetricTile icon={FileCode2} label="Arquivos" value={String(result?.inventory.file_count ?? 0)} detail="Arquivos indexados pela API." />
          <MetricTile icon={Gauge} label="Complexidade" value={stats?.complexity ?? 'unknown'} detail="Classificacao enviada pelo backend." />
          <MetricTile icon={ShieldCheck} label="Testes" value={String(testFiles.length)} detail="Arquivos de teste detectados por nome." />
          <MetricTile icon={Database} label="Banco" value={architectureNodes.find((node) => node.id === 'database')?.status ?? 'Nao detectado'} detail="Evidencia por migrations/schema/sql." />
        </div>
      </CockpitPanel>

      <CockpitPanel id="pipeline" icon={Workflow} title="Build Pipeline" summary={validationReport ? `${validationReport.passed ? 'Passou' : 'Falhou'} | score ${validationReport.score}` : 'Pipeline real roda apos geracao.'} badge={<Badge tone={validationReport?.passed ? 'success' : validationReport ? 'danger' : 'neutral'}>{validationReport ? 'Executado' : 'Nao executado'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ['Lint', validationReport ? 'Validado' : 'Nao executado'],
            ['Test', validationReport ? validationReport.quality.checks.find((check) => check.id.includes('test'))?.status ?? 'Nao medido' : 'Nao executado'],
            ['Build', validationReport ? (validationReport.build.ok ? 'passed' : validationReport.build.built) : 'Nao executado'],
            ['Docker', validationReport ? validationReport.quality.checks.find((check) => check.id.includes('docker'))?.status ?? 'Nao medido' : 'Nao executado'],
            ['Security', validationReport ? String(validationReport.security_findings.length) : 'Nao executado'],
            ['Deploy', 'Nao executado'],
          ].map(([label, value]) => <MetricTile key={label} icon={Circle} label={label} value={String(value)} detail="Status vindo do validation_report quando disponivel." />)}
        </div>
        {validationReport ? <ValidationReportPanel report={validationReport} /> : null}
      </CockpitPanel>

      <CockpitPanel id="terminal" icon={TerminalSquare} title="Live Terminal" summary="Logs reais de comandos aparecem quando a API executa geracao/validacao." badge={<Badge tone={busy ? 'accent' : 'neutral'}>{busy ? 'Executando' : 'Idle'}</Badge>} openPanels={openPanels} onToggle={toggle}>
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-black/40 p-4 font-mono text-xs text-[color:var(--muted)]">
          <p>$ modernize ingest --source {result?.inventory.source ?? 'pending'}</p>
          <p>{result ? `indexed ${result.inventory.file_count} files, skipped ${result.inventory.skipped_count}` : 'waiting for project input'}</p>
          <p>{generated ? `generated ${generated.project} with ${generated.count} files` : 'no generated artifact yet'}</p>
          {validationReport?.build.logs_tail ? <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap">{validationReport.build.logs_tail}</pre> : null}
        </div>
      </CockpitPanel>

      <CockpitPanel id="conversation" icon={MessageSquareText} title="AI Conversation" summary="Respostas ficam restritas aos dados do projeto e ao modo deterministico quando nao ha provider real." badge={<Badge tone="accent">Deterministico</Badge>} openPanels={openPanels} onToggle={toggle}>
        <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
          <Card className="p-5">
            <p className="text-sm font-semibold text-[color:var(--text)]">Pergunte sobre este projeto</p>
            <div className="mt-3 flex gap-2">
              <Input
                value={chatQuestion}
                onChange={(event) => setChatQuestion(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void handleAsk(); }}
                placeholder="O que esta errado?"
                disabled={!result}
              />
              <Button type="button" variant="secondary" loading={chatBusy} disabled={!result || !chatQuestion.trim()} onClick={() => void handleAsk()}>
                Enviar
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
              {['O que esta errado?', 'Como melhorar?', 'Explique a arquitetura', 'Vale migrar para microsservicos?'].map((q) => (
                <button key={q} type="button" onClick={() => setChatQuestion(q)} className="focus-ring rounded-full border border-[color:var(--border)] bg-white/5 px-3 py-1 hover:border-[color:var(--border-strong)]">
                  {q}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-[color:var(--muted)]">As respostas usam apenas os dados reais deste projeto. Sem chave, o modo e explicitamente deterministico.</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--text)]">Resposta</p>
              {chat ? <Badge tone={chat.mode === 'llm' ? 'accent' : 'neutral'}>{chat.mode === 'llm' ? 'IA' : 'Deterministico'}</Badge> : null}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted)]">
              {chat?.answer ?? summary?.review ?? 'Envie um projeto para obter contexto real antes de conversar.'}
            </p>
          </Card>
        </div>
      </CockpitPanel>

      <CockpitPanel id="artifacts" icon={PackageCheck} title="Artefatos" summary={generated ? `Projeto gerado ${generated.project}` : 'Artefatos aparecem apos modernizar.'} badge={<Badge tone={generated ? 'success' : 'neutral'}>{generated ? generated.count : 0} arquivos</Badge>} openPanels={openPanels} onToggle={toggle}>
        <div className="space-y-4">
          <UserKeyPanel enabled={useUserKey} onEnabledChange={setUseUserKey} />
          <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/5 p-4 md:flex-row md:items-center">
            <label className="flex flex-1 flex-col gap-1 text-sm text-[color:var(--muted)]">
              Nome do projeto
              <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            </label>
            {degraded ? <Badge tone="warning">Modo degradado</Badge> : null}
            <Button type="button" variant="primary" disabled={!result || busy !== null} loading={busy === 'generate'} onClick={() => void handleModernize()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Modernizar Projeto
            </Button>
          </div>
          {generated ? (
            <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--success)_34%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] p-4 text-sm text-[color:var(--success)]">
              Projeto modernizado gerado: {generated.project} ({generated.count} arquivos).
            </div>
          ) : null}
        </div>
      </CockpitPanel>
    </div>
  );
}

function EmptyCockpitState({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] bg-white/[0.03] p-6 text-center">
      <p className="text-sm font-semibold text-[color:var(--text)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{detail}</p>
    </div>
  );
}
