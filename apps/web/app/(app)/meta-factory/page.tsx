'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode2,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react';

import {
  metaFactoryClient,
  type AgentRunSummary,
  type ClarifyingQuestion,
  type FactoryEvent,
  type GeneratedFile,
  type PriorAnswer,
  type ProjectSpec,
} from '@/lib/api/meta-factory';
import { ApiTestPanel } from '@/components/generation/api-test-panel';
import { ExportPanel } from '@/components/generation/export-panel';
import { ValidationReportPanel } from '@/components/generation/validation-report-panel';
import type { GenerationValidationReport } from '@contracts/generation-validation.contract';

const PIPELINE_ROLES = ['contracts', 'backend', 'frontend', 'qa', 'devops', 'docs'] as const;
import { useLocale } from '@/hooks/use-locale';
import { LOCALES as AVAILABLE_LOCALES } from '@/lib/i18n';
import { UserKeyPanel } from '@/components/llm/user-key-panel';

const MODELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: '', label: 'Auto (por papel)' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { id: 'claude-fable-5', label: 'Claude Fable 5' },
  { id: 'gpt-4.1', label: 'OpenAI GPT-4.1' },
  { id: 'o4-mini', label: 'OpenAI o4-mini' },
  { id: 'gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
];

export default function MetaFactoryPage() {
  const { t } = useLocale();
  const [intent, setIntent] = useState('');
  const [model, setModel] = useState('');
  const [locale, setLocale] = useState('pt-BR');
  const [projectName, setProjectName] = useState('meta-factory-project');

  const [spec, setSpec] = useState<ProjectSpec | null>(null);
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null);
  const [validationReport, setValidationReport] = useState<GenerationValidationReport | null>(null);

  const [busy, setBusy] = useState<null | 'spec' | 'generate' | 'download' | 'file'>(null);
  const [error, setError] = useState<string | null>(null);

  // Real-time generation state (Pillar 3).
  const [streamEvents, setStreamEvents] = useState<FactoryEvent[]>([]);
  const [emittedPaths, setEmittedPaths] = useState<string[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [useUserKey, setUseUserKey] = useState(false);

  async function handleOrchestrate(priorAnswers: PriorAnswer[] = []) {
    setBusy('spec');
    setError(null);
    try {
      const result = await metaFactoryClient.orchestrate(intent, priorAnswers, model || undefined, useUserKey);
      setSpec(result.spec);
      setQuestions(result.open_questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('metaFactory.error.spec'));
    } finally {
      setBusy(null);
    }
  }

  function handleRefine() {
    const priorAnswers: PriorAnswer[] = questions.map((q) => ({
      id: q.id,
      answer: answers[q.id]?.trim() || q.default_if_skipped,
    }));
    void handleOrchestrate(priorAnswers);
  }

  async function handleGenerate() {
    if (!spec) return;
    setBusy('generate');
    setError(null);
    setRuns([]);
    setFiles([]);
    setActiveFile(null);
    setValidationReport(null);
    setStreamEvents([]);
    setEmittedPaths([]);
    setDegraded(false);

    // User-chosen language wins over whatever the orchestrator inferred — this
    // drives the non-negotiable localization rules injected into the Mega-Prompt.
    const localizedSpec = { ...spec, locale };
    const liveRuns = new Map<string, AgentRunSummary>();
    let writtenId: string | null = null;

    try {
      await metaFactoryClient.generateStream(
        localizedSpec,
        projectName.trim() || 'meta-factory-project',
        (event) => {
          setStreamEvents((prev) => [...prev, event]);
          if (event.type === 'file_emitted') {
            setEmittedPaths((prev) => (prev.includes(event.path) ? prev : [...prev, event.path]));
          } else if (event.type === 'agent_finished') {
            liveRuns.set(event.role, {
              role: event.role,
              model: event.model,
              file_count: event.file_count,
              stopped_by: event.stopped_by,
              errors: event.errors,
            });
            setRuns(Array.from(liveRuns.values()));
            if (event.degraded) setDegraded(true);
          } else if (event.type === 'written') {
            writtenId = event.project_id;
            setProjectId(event.project_id);
          } else if (event.type === 'validation_report') {
            setValidationReport(event.report);
          } else if (event.type === 'done') {
            if (event.degraded) setDegraded(true);
            if (!event.ok && event.errors.length > 0) {
              setError(t('metaFactory.error.generationWarnings', { errors: event.errors.slice(0, 3).join(' · ') }));
            }
          } else if (event.type === 'error') {
            setError(event.detail);
          }
        },
        model || undefined,
        useUserKey,
      );
      if (writtenId) {
        const listing = await metaFactoryClient.listFiles(writtenId);
        setFiles(listing.files);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('metaFactory.error.generate'));
    } finally {
      setBusy(null);
    }
  }

  function roleState(role: string): 'pending' | 'running' | 'passed' | 'failed' {
    let state: 'pending' | 'running' | 'passed' | 'failed' = 'pending';
    for (const event of streamEvents) {
      if ('role' in event && event.role === role) {
        if (event.type === 'agent_started') state = 'running';
        if (event.type === 'gate_check') state = event.status === 'passed' ? 'passed' : 'failed';
      }
    }
    return state;
  }

  async function handleOpenFile(path: string) {
    if (!projectId) return;
    setBusy('file');
    try {
      const result = await metaFactoryClient.fileContent(projectId, path);
      setActiveFile({ path, content: result.content ?? t('metaFactory.noPreview') });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('metaFactory.error.openFile'));
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    if (!projectId) return;
    setBusy('download');
    try {
      await metaFactoryClient.prepareDownload(projectId);
      await metaFactoryClient.download(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('metaFactory.error.download'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
            <Wand2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('metaFactory.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('metaFactory.description')}
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1 — intent */}
      <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-500/15 text-xs font-bold text-indigo-500">1</span>
          {t('metaFactory.idea')}
        </h2>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          rows={4}
          placeholder={t('metaFactory.intentPlaceholder')}
          className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-indigo-500/40 transition focus:ring-2"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {t('metaFactory.intentHelpBefore')}
          <span className="font-medium"> {t('metaFactory.smartDefaults')}</span> {t('metaFactory.intentHelpAfter')}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t('metaFactory.model')}
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id ? m.label : t('metaFactory.autoModel')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t('metaFactory.language')}
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              {AVAILABLE_LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleOrchestrate()}
            disabled={busy !== null || intent.trim().length < 8}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'spec' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t('metaFactory.generateSpec')}
          </button>
        </div>
        <div className="mt-4">
          <UserKeyPanel enabled={useUserKey} onEnabledChange={setUseUserKey} />
        </div>
      </section>

      {/* Step 2 — spec + refine */}
      {spec && (
        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-500/15 text-xs font-bold text-indigo-500">2</span>
                {t('metaFactory.specification')}
              </h2>
              <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs text-indigo-500">
                {t('metaFactory.localeLabel')}: {locale}
              </span>
            </div>
            <ConfidenceMeter value={spec.confidence} label={t('metaFactory.confidence')} />
          </div>

          {questions.length > 0 && (
            <div className="mb-6 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
              <p className="mb-3 text-sm font-medium">{t('metaFactory.refinementQuestions')}</p>
              <div className="flex flex-col gap-4">
                {questions.map((q) => (
                  <div key={q.id} className="flex flex-col gap-1">
                    <label className="text-sm font-medium">{q.question}</label>
                    <p className="text-xs text-muted-foreground">{q.why_it_matters}</p>
                    <input
                      value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={t('metaFactory.defaultAnswer', { value: q.default_if_skipped })}
                      className="mt-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleRefine}
                disabled={busy !== null}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-indigo-500/40 px-3 py-1.5 text-sm font-medium text-indigo-500 transition hover:bg-indigo-500/10 disabled:opacity-50"
              >
                {busy === 'spec' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('metaFactory.refineSpec')}
              </button>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <SpecField label={t('metaFactory.summary')} value={spec.product_summary} />
            <SpecBadges label={t('metaFactory.targetUsers')} items={spec.target_users} />
            <SpecBadges label={t('metaFactory.businessRules')} items={spec.business_rules} />
            <SpecBadges label={t('metaFactory.entities')} items={spec.entities} />
            <SpecBadges label={t('metaFactory.workflows')} items={spec.core_workflows} />
            <SpecField
              label={t('metaFactory.suggestedStack')}
              value={[spec.suggested_stack.language, spec.suggested_stack.framework, spec.suggested_stack.architecture]
                .filter(Boolean)
                .join(' · ')}
            />
          </div>

          {spec.assumptions.length > 0 && (
            <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('metaFactory.assumptions')}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {spec.assumptions.map((a, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{a.field}:</span> {a.assumed_value}{' '}
                    <span className="opacity-70">({a.reason})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {t('metaFactory.projectName')}
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={busy !== null}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/30 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {t('metaFactory.generateProject')}
            </button>
          </div>
        </section>
      )}

      {/* Live progress — real-time pipeline (Pillar 3) */}
      {(busy === 'generate' || streamEvents.length > 0) && (
        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {busy === 'generate' ? (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              {t('metaFactory.liveProgress')}
            </h2>
            {degraded && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('metaFactory.degradedMode')}
              </span>
            )}
          </div>

          {/* Agent pipeline status */}
          <div className="mb-4 flex flex-wrap gap-2">
            {PIPELINE_ROLES.map((role) => {
              const state = roleState(role);
              const styles = {
                pending: 'border-border/60 text-muted-foreground',
                running: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-500',
                passed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                failed: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
              }[state];
              return (
                <span key={role} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${styles}`}>
                  {state === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {state === 'passed' && <CheckCircle2 className="h-3 w-3" />}
                  {state === 'failed' && <AlertTriangle className="h-3 w-3" />}
                  {t(`metaFactory.role.${role}`)}
                </span>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
            {/* Directory tree growing live */}
            <div className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-background/40 p-3 text-xs leading-relaxed">
              <p className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">{t('metaFactory.directoryTree')}</p>
              {emittedPaths.length === 0 ? (
                <p className="text-muted-foreground">{t('metaFactory.waitingFiles')}</p>
              ) : (
                <ul className="flex flex-col gap-0.5 font-mono">
                  {[...emittedPaths].sort().map((path) => (
                    <li key={path} className="flex items-center gap-1.5 truncate">
                      <FileCode2 className="h-3 w-3 shrink-0 opacity-50" />
                      <span className="truncate">{path}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Gate checks (security/lint) */}
            <div className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-background/40 p-3 text-xs leading-relaxed">
              <p className="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">{t('metaFactory.gateChecks')}</p>
              <ul className="flex flex-col gap-1">
                {streamEvents
                  .filter((e): e is Extract<FactoryEvent, { type: 'gate_check' }> => e.type === 'gate_check')
                  .map((e, i) => (
                    <li key={`${e.role}-${i}`} className="flex items-start gap-1.5">
                      {e.status === 'passed' ? (
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                      )}
                      <span>
                        <span className="font-medium">{t(`metaFactory.role.${e.role}`)}</span>{' '}
                        <span className="text-muted-foreground">{e.detail}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Step 3 — results */}
      {runs.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-500/15 text-xs font-bold text-indigo-500">3</span>
            {t('metaFactory.result')}
          </h2>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {runs.map((run) => (
              <div key={run.role} className="rounded-xl border border-border/60 bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t(`metaFactory.role.${run.role}`)}</span>
                  {run.errors.length === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('metaFactory.runFiles', { model: run.model, count: run.file_count })}
                </p>
                {run.errors.length > 0 && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{run.errors[0]}</p>
                )}
              </div>
            ))}
          </div>

          {projectId && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {t('metaFactory.project')} <code className="rounded bg-background px-1.5 py-0.5 text-xs">{projectId}</code> · {t('metaFactory.fileCount', { count: files.length })}
              </span>
              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={busy !== null}
                className="ml-auto inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium transition hover:bg-background/60 disabled:opacity-50"
              >
                {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {t('metaFactory.downloadZip')}
              </button>
            </div>
          )}

          {projectId && validationReport && (
            <div className="mt-6">
              <ValidationReportPanel report={validationReport} />
            </div>
          )}

          {projectId && (
            <div className="mt-6 grid gap-4">
              <ExportPanel
                surface="meta-factory"
                projectId={projectId}
                defaultRepoName={(projectName.trim() || 'meta-factory-project').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-')}
              />
              <ApiTestPanel surface="meta-factory" projectId={projectId} />
            </div>
          )}

          {files.length > 0 && (
            <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
              <ul className="max-h-80 overflow-auto rounded-xl border border-border/60 bg-background/40 p-2 text-sm">
                {files.map((file) => (
                  <li key={file.relative_path}>
                    <button
                      type="button"
                      onClick={() => void handleOpenFile(file.relative_path)}
                      className={`flex w-full items-center gap-2 truncate rounded-lg px-2 py-1.5 text-left transition hover:bg-indigo-500/10 ${
                        activeFile?.path === file.relative_path ? 'bg-indigo-500/10 text-indigo-500' : ''
                      }`}
                    >
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="truncate">{file.relative_path}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <pre className="max-h-80 overflow-auto rounded-xl border border-border/60 bg-background/60 p-4 text-xs leading-relaxed">
                {busy === 'file' ? t('metaFactory.loadingFile') : activeFile ? activeFile.content : t('metaFactory.selectFile')}
              </pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ConfidenceMeter({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium">{pct}%</span>
    </div>
  );
}

function SpecField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );
}

function SpecBadges({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={i} className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs text-indigo-500">
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
