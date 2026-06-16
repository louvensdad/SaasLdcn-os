'use client';

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react';

import {
  modernizeClient,
  type ModernizeResponse,
} from '@/lib/api/modernize';
import { useLocale } from '@/hooks/use-locale';

type Tab = 'zip' | 'git';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'text-red-600 dark:text-red-400',
  high: 'text-red-500',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-yellow-600',
  info: 'text-muted-foreground',
};

export default function ModernizePage() {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('zip');
  const [gitUrl, setGitUrl] = useState('');
  const [projectName, setProjectName] = useState('modernized-project');
  const [result, setResult] = useState<ModernizeResponse | null>(null);
  const [busy, setBusy] = useState<null | 'ingest' | 'generate'>(null);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [generated, setGenerated] = useState<{ project: string; count: number } | null>(null);

  async function ingest(promise: Promise<ModernizeResponse>) {
    setBusy('ingest');
    setError(null);
    setResult(null);
    setGenerated(null);
    setDegraded(false);
    try {
      setResult(await promise);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('modernize.error.ingest'));
    } finally {
      setBusy(null);
    }
  }

  function handleZip(file: File | undefined) {
    if (file) void ingest(modernizeClient.ingestZip(file));
  }

  async function handleModernize() {
    if (!result) return;
    setBusy('generate');
    setError(null);
    try {
      const res = await modernizeClient.generate(
        result.inventory.ingest_id,
        projectName.trim() || 'modernized-project',
      );
      setDegraded(res.degraded);
      if (res.ok && res.project_id) {
        setGenerated({ project: res.project_id, count: res.file_count });
      } else if (res.errors.length > 0) {
        setError(res.errors.slice(0, 3).join(' · '));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('modernize.error.generate'));
    } finally {
      setBusy(null);
    }
  }

  const diagnosis = result?.diagnosis;
  const plan = result?.plan;
  const inventory = result?.inventory;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
          <RefreshCw className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('modernize.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('modernize.description')}</p>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1 — ingest */}
      <section className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab('zip')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === 'zip' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:bg-background/60'}`}
          >
            <Upload className="h-4 w-4" />
            {t('modernize.sourceZip')}
          </button>
          <button
            type="button"
            onClick={() => setTab('git')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === 'git' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:bg-background/60'}`}
          >
            <GitBranch className="h-4 w-4" />
            {t('modernize.sourceGit')}
          </button>
        </div>

        {tab === 'zip' ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              onChange={(e) => handleZip(e.target.files?.[0])}
              className="block text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-500"
            />
            {busy === 'ingest' && <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder={t('modernize.gitPlaceholder')}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-emerald-500/40 transition focus:ring-2"
            />
            <button
              type="button"
              onClick={() => void ingest(modernizeClient.ingestGit(gitUrl.trim()))}
              disabled={busy !== null || gitUrl.trim().length < 4}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'ingest' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
              {t('modernize.analyzeGit')}
            </button>
          </div>
        )}
      </section>

      {/* Step 2 — diagnosis + plan */}
      {result && inventory && diagnosis && plan && (
        <section className="flex flex-col gap-6 rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('modernize.diagnosis')}</h2>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600 dark:text-emerald-400">
              {t('modernize.filesCount', { count: inventory.file_count, languages: diagnosis.languages.length })}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('modernize.stack')}</p>
              <p className="mt-1 text-sm">{diagnosis.detected_stack}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('modernize.dependencies')}</p>
              <ul className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
                {diagnosis.dependency_notes.map((n, i) => <li key={i}>· {n}</li>)}
              </ul>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('modernize.smells')}</p>
              {diagnosis.smells.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">{t('modernize.noFindings')}</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
                  {diagnosis.smells.map((s) => <li key={s.code}>· {s.message}</li>)}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" /> {t('modernize.security')}
            </p>
            {diagnosis.security_findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('modernize.noFindings')}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {diagnosis.security_findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`font-mono text-xs uppercase ${SEVERITY_STYLES[f.severity] ?? ''}`}>[{f.severity}]</span>
                    <span>{f.message} <code className="text-xs text-muted-foreground">{f.path}{f.line ? `:${f.line}` : ''}</code></span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-sm font-medium">{t('modernize.plan')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{plan.preserved_logic_note}</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
              {plan.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>

          <details className="rounded-xl border border-border/60 bg-background/40 p-4">
            <summary className="cursor-pointer text-sm font-medium">{t('modernize.mappings')}</summary>
            <ul className="mt-2 max-h-64 overflow-auto font-mono text-xs">
              {plan.mappings.map((m) => (
                <li key={m.legacy_path} className="flex items-center gap-1.5 truncate py-0.5">
                  <FileCode2 className="h-3 w-3 shrink-0 opacity-50" />
                  <span className="truncate">{m.legacy_path} → {m.target_path}</span>
                  <span className="ml-auto shrink-0 rounded bg-emerald-500/10 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">{m.action}</span>
                </li>
              ))}
            </ul>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {t('modernize.projectName')}
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
            </label>
            {degraded && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('modernize.degradedMode')}
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleModernize()}
              disabled={busy !== null}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-500/30 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('modernize.modernizeNow')}
            </button>
          </div>

          {generated && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {t('modernize.generatedOk', { project: generated.project, count: generated.count })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
