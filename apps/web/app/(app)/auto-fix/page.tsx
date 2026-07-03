'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Database,
  FileWarning,
  GitBranch,
  History,
  Layers3,
  ListChecks,
  Network,
  Package,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportPanel } from '@/components/generation/export-panel';
import { LlmGatedAction } from '@/components/llm/llm-gated-action';
import { PageError } from '@/components/feedback/error-system';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';
import {
  modernizeClient,
  type CodebaseAnalysisReport,
  type CodeDiffSummary,
  type CodeIssue,
  type ModernizationPlan,
  type ModernizeProjectSummary,
  type RefactorResult,
  type RevalidationReport,
} from '@/lib/api/modernize';

// Finding categories the analysis emits (security/architecture/dependency) plus
// the richer set an LLM-enriched analysis may add. Unknown categories fall back
// to a titled chip so nothing is hidden.
const CATEGORY_META: Record<string, { labelKey: string; icon: LucideIcon }> = {
  security: { labelKey: 'autoFix.cat.security', icon: ShieldAlert },
  architecture: { labelKey: 'autoFix.cat.architecture', icon: Network },
  dependency: { labelKey: 'autoFix.cat.dependency', icon: Package },
  dependencies: { labelKey: 'autoFix.cat.dependency', icon: Package },
  performance: { labelKey: 'autoFix.cat.performance', icon: Zap },
  tests: { labelKey: 'autoFix.cat.tests', icon: ListChecks },
  database: { labelKey: 'autoFix.cat.database', icon: Database },
  frontend: { labelKey: 'autoFix.cat.frontend', icon: Layers3 },
  backend: { labelKey: 'autoFix.cat.backend', icon: Boxes },
  devops: { labelKey: 'autoFix.cat.devops', icon: Workflow },
};

function severityTone(severity: string): BadgeTone {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  if (severity === 'low') return 'accent';
  return 'neutral';
}

function scoreTone(value: number): BadgeTone {
  if (value >= 85) return 'success';
  if (value >= 65) return 'accent';
  if (value >= 45) return 'warning';
  return 'danger';
}

function qualityLetter(overall: number): string {
  if (overall >= 90) return 'A';
  if (overall >= 80) return 'B';
  if (overall >= 65) return 'C';
  if (overall >= 50) return 'D';
  return 'E';
}

export default function AutoFixPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AutoFixInner />
    </Suspense>
  );
}

function AutoFixInner() {
  const { t } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const projectParam = params.get('project');

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ModernizeProjectSummary | null>(null);
  const [report, setReport] = useState<CodebaseAnalysisReport | null>(null);
  const [plan, setPlan] = useState<ModernizationPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedPhases, setSelectedPhases] = useState<ReadonlySet<string>>(() => new Set());

  const [busy, setBusy] = useState<null | 'analyze' | 'apply'>(null);
  const [refactor, setRefactor] = useState<RefactorResult | null>(null);
  const [revalidation, setRevalidation] = useState<RevalidationReport | null>(null);
  const [diff, setDiff] = useState<CodeDiffSummary | null>(null);

  const loadReport = useCallback(async (projectId: string) => {
    const res = await modernizeClient.getReport(projectId);
    setReport(res.report);
    setPlan(res.plan);
  }, []);

  // Pick up an existing analysis — never re-upload. ?project= when handed off from
  // Modernize; otherwise the user's latest analysis.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let proj: ModernizeProjectSummary | null = null;
        if (projectParam) {
          const list = await modernizeClient.listProjects();
          proj = list.find((p) => p.project_id === projectParam) ?? null;
          if (!proj) {
            // Handed an id we can't see (foreign/expired) — fall back to latest.
            proj = await modernizeClient.latestProject();
          }
        } else {
          proj = await modernizeClient.latestProject();
        }
        if (!active) return;
        setSummary(proj);
        if (proj?.has_report) {
          await loadReport(proj.project_id);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectParam, loadReport]);

  async function runAnalysis() {
    if (!summary) return;
    setBusy('analyze');
    setError(null);
    try {
      const res = await modernizeClient.analyze(summary.project_id);
      setReport(res.report);
      setPlan(res.plan);
      setSummary({ ...summary, has_report: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'error');
    } finally {
      setBusy(null);
    }
  }

  const issues = report?.technical.issues ?? [];

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of issues) counts.set(issue.category, (counts.get(issue.category) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [issues]);

  const visibleIssues = activeCategory ? issues.filter((i) => i.category === activeCategory) : issues;

  const phases = plan?.phases ?? [];
  const selectedActionCount = phases
    .filter((p) => selectedPhases.has(p.id))
    .reduce((sum, p) => sum + p.actions.length, 0);

  function togglePhase(id: string) {
    setSelectedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function presetAll() {
    setSelectedPhases(new Set(phases.map((p) => p.id)));
  }
  function presetCritical() {
    setSelectedPhases(new Set(phases.filter((p) => p.id === 'critical' || p.id === 'security').map((p) => p.id)));
  }
  function presetClear() {
    setSelectedPhases(new Set());
  }

  async function execute() {
    if (!summary || selectedPhases.size === 0) return;
    setBusy('apply');
    setError(null);
    try {
      const phaseIds = phases.map((p) => p.id);
      await modernizeClient.approvePlan(summary.project_id, {
        mode: 'custom',
        phase_ids: Array.from(selectedPhases).filter((id) => phaseIds.includes(id)),
      });
      setRefactor(await modernizeClient.applyFixes(summary.project_id));
      setRevalidation(await modernizeClient.revalidate(summary.project_id));
      setDiff(await modernizeClient.diff(summary.project_id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'error');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingState />;

  // No analysis at all → never show upload; point back to Modernize.
  if (!summary) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-5 px-4 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl border border-[color:var(--border)] bg-white/5 text-[color:var(--accent)]">
          <Wrench className="h-7 w-7" aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="ds-section text-[color:var(--text)]">{t('autoFix.empty.title')}</h1>
          <p className="ds-body ds-text-muted max-w-md">{t('autoFix.empty.body')}</p>
        </div>
        <Button variant="primary" onClick={() => router.push('/modernize')}>
          {t('autoFix.empty.cta')} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pb-16 pt-6">
      <ProjectHeader summary={summary} report={report} />

      {error ? <PageError title={t('autoFix.error.title')} description={error} className="p-4" /> : null}

      {/* Analysis not processed yet (ingested but never analyzed). */}
      {!report ? (
        <Card surface="primary" className="space-y-4 p-6">
          <h2 className="ds-subsection text-[color:var(--text)]">{t('autoFix.pending.title')}</h2>
          <p className="ds-body ds-text-muted">{t('autoFix.pending.body')}</p>
          <Button variant="primary" loading={busy === 'analyze'} onClick={() => void runAnalysis()}>
            <Sparkles className="h-4 w-4" /> {busy === 'analyze' ? t('autoFix.pending.running') : t('autoFix.pending.cta')}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Left menu — finding categories */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <Card className="space-y-1 p-3">
              <p className="px-2 pb-1 t-overline">{t('autoFix.categories.title')}</p>
              <CategoryButton
                active={activeCategory === null}
                icon={ListChecks}
                label={t('autoFix.cat.all')}
                count={issues.length}
                onClick={() => setActiveCategory(null)}
              />
              {categories.map(([cat, count]) => {
                const meta = CATEGORY_META[cat];
                return (
                  <CategoryButton
                    key={cat}
                    active={activeCategory === cat}
                    icon={meta?.icon ?? FileWarning}
                    label={meta ? t(meta.labelKey) : cat}
                    count={count}
                    onClick={() => setActiveCategory(cat)}
                  />
                );
              })}
            </Card>
          </aside>

          {/* Center — grouped fixes + execution + results */}
          <div className="min-w-0 space-y-6">
            <Card className="space-y-3 p-6">
              <h2 className="ds-subsection text-[color:var(--text)]">{t('autoFix.fixes.title')}</h2>
              {visibleIssues.length === 0 ? (
                <p className="flex items-center gap-2 ds-body ds-text-muted">
                  <CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" />
                  {t('autoFix.fixes.empty')}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {visibleIssues.map((issue) => (
                    <FindingCard
                      key={issue.id}
                      issue={issue}
                      open={expanded === issue.id}
                      onToggle={() => setExpanded((cur) => (cur === issue.id ? null : issue.id))}
                    />
                  ))}
                </ul>
              )}
            </Card>

            {/* Execution plan — phase-based (matches the real apply pipeline) */}
            {!refactor ? (
              <Card surface="primary" className="space-y-4 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="ds-subsection text-[color:var(--text)]">{t('autoFix.run.title')}</h2>
                  <div className="flex flex-wrap gap-2">
                    <PresetButton label={t('autoFix.select.all')} onClick={presetAll} />
                    <PresetButton label={t('autoFix.select.critical')} onClick={presetCritical} />
                    <PresetButton label={t('autoFix.select.clear')} onClick={presetClear} />
                  </div>
                </div>

                {phases.length === 0 ? (
                  <p className="ds-body ds-text-muted">{t('autoFix.run.noPhases')}</p>
                ) : (
                  <div className="space-y-2">
                    {phases.map((phase) => {
                      const checked = selectedPhases.has(phase.id);
                      const auto = phase.actions.filter((a) => a.auto_fixable).length;
                      return (
                        <label
                          key={phase.id}
                          className={cn(
                            'flex cursor-pointer items-start justify-between gap-3 rounded-[var(--radius-md)] border p-3 transition',
                            checked
                              ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                              : 'border-[color:var(--border)]',
                          )}
                        >
                          <span className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePhase(phase.id)}
                              className="mt-1 h-4 w-4 accent-[color:var(--accent)]"
                            />
                            <span>
                              <span className="block text-sm font-semibold text-[color:var(--text)]">{phase.title}</span>
                              <span className="mt-0.5 block ds-caption">
                                {phase.actions.length} {t('autoFix.run.actions')} · {auto} {t('autoFix.run.autoSafe')}
                              </span>
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border)] pt-4">
                  <p className="ds-caption">
                    <span className="font-semibold text-[color:var(--text)]">{selectedPhases.size}</span>{' '}
                    {t('autoFix.run.phasesSelected')} ·{' '}
                    <span className="font-semibold text-[color:var(--text)]">{selectedActionCount}</span>{' '}
                    {t('autoFix.run.actions')}
                  </p>
                  <LlmGatedAction
                    capability="auto_repair_apply"
                    usageLabel={t('autoFix.run.run')}
                    compact
                    onRun={() => execute()}
                  >
                    {(open) => (
                      <Button variant="primary" disabled={selectedPhases.size === 0} loading={busy === 'apply'} onClick={open}>
                        {busy === 'apply' ? t('autoFix.run.running') : t('autoFix.run.run')} <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  </LlmGatedAction>
                </div>
                <p className="flex items-start gap-2 ds-caption">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />
                  {t('autoFix.run.hint')}
                </p>
              </Card>
            ) : null}

            {/* Results — real before/after deltas */}
            {refactor && revalidation ? (
              <ResultsCard
                refactor={refactor}
                revalidation={revalidation}
                diff={diff}
                onReset={() => {
                  setRefactor(null);
                  setRevalidation(null);
                  setDiff(null);
                  setSelectedPhases(new Set());
                }}
              />
            ) : null}

            {/* Git — only after a corrected copy exists */}
            {refactor?.materialized_project_id ? (
              <Card className="space-y-3 p-6">
                <h2 className="flex items-center gap-2 ds-subsection text-[color:var(--text)]">
                  <GitBranch className="h-5 w-5 text-[color:var(--accent)]" /> {t('autoFix.git.title')}
                </h2>
                <ExportPanel
                  surface="modernize"
                  projectId={refactor.materialized_project_id}
                  defaultRepoName={`autofix-${summary.project_id}`.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-')}
                />
              </Card>
            ) : null}

            {/* Honest placeholders for features without a backend yet */}
            <div className="grid gap-4 md:grid-cols-3">
              <PlaceholderCard icon={TerminalSquare} title={t('autoFix.pipeline.title')} note={t('autoFix.pipeline.note')} />
              <PlaceholderCard icon={History} title={t('autoFix.history.title')} note={t('autoFix.history.note')} />
              <PlaceholderCard icon={RotateCcw} title={t('autoFix.rollback.title')} note={t('autoFix.rollback.note')} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 pt-6">
      <Skeleton className="h-40" />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

function ProjectHeader({
  summary,
  report,
}: {
  readonly summary: ModernizeProjectSummary;
  readonly report: CodebaseAnalysisReport | null;
}) {
  const { t } = useLocale();
  const stack = report?.detected_stack ?? summary.detected_stack ?? t('autoFix.header.untitled');
  const langs = Object.keys(summary.languages ?? {});
  const overall = report?.scores.overall ?? summary.overall_score ?? null;
  const findings = report?.technical.issues.length ?? summary.findings_count ?? null;
  const scores = report?.scores;

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--border)] bg-[radial-gradient(circle_at_8%_12%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_34%),linear-gradient(135deg,color-mix(in_srgb,var(--surface-1)_94%,black),color-mix(in_srgb,var(--surface-2)_88%,black))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] md:p-8">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)]" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge tone="accent">
              <Wrench className="h-3.5 w-3.5" /> Auto-Fix
            </Badge>
            <Badge tone="success">{t('autoFix.header.analyzed')}</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-[color:var(--text)] md:text-4xl">{stack}</h1>
          <div className="flex flex-wrap gap-1.5">
            {langs.map((lang) => (
              <Badge key={lang} tone="neutral">
                {lang}
              </Badge>
            ))}
          </div>
          <p className="ds-caption">
            {summary.file_count.toLocaleString()} {t('autoFix.header.files')}
            {findings !== null ? <> · {findings} Findings</> : null}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <ScorePill label={t('autoFix.header.score')} value={overall} />
          <ScorePill label={t('autoFix.dim.security')} value={scores?.security ?? null} />
          <ScorePill label={t('autoFix.dim.architecture')} value={scores?.architecture ?? null} />
          <ScorePill label={t('autoFix.dim.documentation')} value={scores?.devops ?? null} />
          <ScorePill label={t('autoFix.dim.build')} value={null} />
          <ScorePill label={t('autoFix.dim.tests')} value={null} />
        </div>
      </div>
    </section>
  );
}

function ScorePill({ label, value }: { readonly label: string; readonly value: number | null }) {
  const { t } = useLocale();
  const measured = value !== null;
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 px-3 py-2 text-center">
      <p className="t-overline">{label}</p>
      {measured ? (
        <p className="mt-1 t-mono text-lg font-bold text-[color:var(--text)]">{value}</p>
      ) : (
        <p className="mt-1 ds-caption">{t('autoFix.header.notRun')}</p>
      )}
      {measured ? (
        <Badge tone={scoreTone(value)} className="mt-1">
          {value >= 65 ? t('autoFix.header.ok') : t('autoFix.header.attention')}
        </Badge>
      ) : null}
    </div>
  );
}

function CategoryButton({
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  readonly active: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly count: number;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'focus-ring flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-sm transition',
        active ? 'accent-fill' : 'text-[color:var(--muted)] hover:bg-white/5',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className="t-mono text-xs">{count}</span>
    </button>
  );
}

function FindingCard({
  issue,
  open,
  onToggle,
}: {
  readonly issue: CodeIssue;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const { t } = useLocale();
  return (
    <li className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
          <FileWarning className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
          {issue.title}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={severityTone(issue.severity)}>{issue.severity}</Badge>
          {issue.auto_fixable ? <Badge tone="accent">{t('autoFix.fix.autoFixable')}</Badge> : null}
        </div>
      </div>
      {issue.file ? (
        <p className="mt-1.5 t-mono text-xs text-[color:var(--muted-2)]">
          {issue.file}
          {issue.line ? `:${issue.line}` : ''}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        className="focus-ring mt-2 inline-flex items-center gap-1.5 ds-caption font-medium text-[color:var(--accent)]"
      >
        {t('autoFix.fix.details')}
        <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="mt-3 space-y-2 border-t border-[color:var(--border)] pt-3">
          <p className="ds-caption">
            <span className="font-semibold text-[color:var(--text)]">{t('autoFix.fix.why')}:</span> {issue.root_cause}
          </p>
          <p className="ds-caption">
            <span className="font-semibold text-[color:var(--text)]">{t('autoFix.fix.recommendation')}:</span>{' '}
            {issue.recommendation}
          </p>
          <p className="flex items-start gap-1.5 ds-caption text-[color:var(--muted-2)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('autoFix.fix.unavailable')}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function PresetButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring rounded-full border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium text-[color:var(--muted)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]"
    >
      {label}
    </button>
  );
}

function ResultsCard({
  refactor,
  revalidation,
  diff,
  onReset,
}: {
  readonly refactor: RefactorResult;
  readonly revalidation: RevalidationReport;
  readonly diff: CodeDiffSummary | null;
  readonly onReset: () => void;
}) {
  const { t } = useLocale();
  const changedDims = Object.entries(revalidation.deltas).filter(([, v]) => v !== 0);
  return (
    <Card surface="primary" className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-[color:var(--success)]" />
        <h2 className="ds-subsection text-[color:var(--text)]">{t('autoFix.result.title')}</h2>
        <Badge tone="success">
          {t('autoFix.result.applied')}: {refactor.applied_count}
        </Badge>
        {refactor.failed_count ? (
          <Badge tone="warning">
            {t('autoFix.result.failed')}: {refactor.failed_count}
          </Badge>
        ) : null}
        <Badge tone={scoreTone(revalidation.after.overall)}>
          {t('autoFix.gate')}: {qualityLetter(revalidation.after.overall)}
        </Badge>
      </div>

      {changedDims.length ? (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {changedDims.map(([dim, delta]) => {
            const before = (revalidation.before as unknown as Record<string, number>)[dim] ?? 0;
            const after = (revalidation.after as unknown as Record<string, number>)[dim] ?? 0;
            return (
              <div
                key={dim}
                className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] p-3"
              >
                <p className="ds-caption capitalize">{dim.replaceAll('_', ' ')}</p>
                <p className="mt-1 flex items-center gap-2 t-mono text-sm">
                  <span className="text-[color:var(--muted)]">{before}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[color:var(--muted-2)]" />
                  <span className="font-bold text-[color:var(--text)]">{after}</span>
                  <Badge tone={delta > 0 ? 'success' : 'danger'}>
                    {delta > 0 ? '+' : ''}
                    {delta}
                  </Badge>
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="ds-caption">{t('autoFix.result.noDelta')}</p>
      )}

      {diff && diff.changed_paths.length ? (
        <div>
          <p className="ds-caption font-semibold text-[color:var(--text)]">
            {t('autoFix.result.changed')} ({diff.changed_paths.length})
          </p>
          <ul className="mt-1 space-y-0.5 t-mono text-xs text-[color:var(--muted)]">
            {diff.changed_paths.slice(0, 40).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button variant="ghost" onClick={onReset}>
        <RotateCcw className="h-4 w-4" />
        {t('autoFix.result.again')}
      </Button>
    </Card>
  );
}

function PlaceholderCard({ icon: Icon, title, note }: { readonly icon: LucideIcon; readonly title: string; readonly note: string }) {
  const { t } = useLocale();
  return (
    <Card className="space-y-2 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
        <Icon className="h-4 w-4 text-[color:var(--muted)]" aria-hidden />
        {title}
      </p>
      <p className="ds-caption">{note}</p>
      <Badge tone="neutral">{t('autoFix.soon')}</Badge>
    </Card>
  );
}
