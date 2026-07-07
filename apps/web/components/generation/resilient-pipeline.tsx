'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Archive, Check, Circle, Clock3, Download, FileCode2,
  Loader2, Pause, Play, RefreshCcw, Search, ServerCog, ShieldAlert, TerminalSquare, Wrench,
} from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteResourceButton } from '@/components/ui/delete-resource-button';
import { WorkflowContextHeader } from '@/components/project/workflow-context-header';
import { ExecutionTerminal } from '@/components/generation/execution-terminal';
import { ExportPanel } from '@/components/generation/export-panel';
import { LiveExecutionConsole } from '@/components/generation/live-execution-console';
import { useLocale } from '@/hooks/use-locale';
import { metaFactoryClient, type ProjectSpec } from '@/lib/api/meta-factory';
import type { ProjectRoom } from '@contracts/project-room.contract';
import type { GenerationArtifact, GenerationExecutionEvent, GenerationStageStatus, ResilientGenerationJob } from '@contracts/generation-job.contract';

// The full possible stage set across every delivery_type. Which of these a given
// job actually has is driven by job.stageStatuses (set server-side from the job's
// own spec.delivery_type, see generation_job_engine.steps_for) -- render only the
// ones present for THIS job (see visibleStages below), not this whole list.
const STAGES = [
  ['contracts', 'Contratos'], ['database', 'Banco'], ['backend', 'Backend'],
  ['frontend', 'Frontend'], ['mobile', 'Mobile'], ['security', 'Segurança'], ['tests', 'Testes'],
  ['docs', 'Documentação'], ['build', 'Build'], ['package', 'Pacote'],
] as const;

const TERMINAL = new Set(['READY', 'FAILED', 'PAUSED', 'NEEDS_USER_ACTION', 'STALLED']);

interface ResilientPipelineProps {
  room: ProjectRoom;
  spec: ProjectSpec;
  blueprint: unknown;
}

function stageTone(status: GenerationStageStatus): BadgeTone {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'stalled') return 'warning';
  if (status === 'skipped') return 'warning';
  if (status === 'running' || status === 'retrying') return 'accent';
  return 'neutral';
}

function StageIcon({ status }: { readonly status: GenerationStageStatus }) {
  if (status === 'success') return <Check className="h-4 w-4" />;
  if (status === 'failed') return <AlertTriangle className="h-4 w-4" />;
  if (status === 'stalled') return <Clock3 className="h-4 w-4" />;
  if (status === 'skipped') return <AlertTriangle className="h-4 w-4" />;
  if (status === 'running' || status === 'retrying') return <Loader2 className="h-4 w-4 animate-spin" />;
  return <Circle className="h-3.5 w-3.5" />;
}

export function ResilientPipeline({ room, spec, blueprint }: ResilientPipelineProps) {
  const { t } = useLocale();
  const [job, setJob] = useState<ResilientGenerationJob | null>(null);
  const [events, setEvents] = useState<readonly GenerationExecutionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logQuery, setLogQuery] = useState('');
  const [logStage, setLogStage] = useState('all');

  // UI fallback watchdog: timestamp of the last backend signal (snapshot or
  // event). If the stream goes silent while the job looks active, the UI shows
  // "Continuar manualmente" instead of freezing — the screen is NEVER locked.
  // 0 = "no signal yet"; the mount-time refresh() stamps the first activity.
  const lastActivityRef = useRef(0);
  const [stale, setStale] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  // Hybrid AI + Terminal mode: when the bounded auto-repair gives up
  // (SKIPPED_AFTER_FAILURE), the execution terminal opens automatically so the
  // human can intervene immediately.
  useEffect(() => {
    if (job?.buildStatus === 'SKIPPED_AFTER_FAILURE' && job.generatedProjectId) setTerminalOpen(true);
  }, [job?.buildStatus, job?.generatedProjectId]);

  const refresh = useCallback(async () => {
    const latest = await metaFactoryClient.latestJob(room.room_id);
    lastActivityRef.current = Date.now();
    setStale(false);
    setJob(latest);
    setEvents(latest?.events ?? []);
    return latest;
  }, [room.room_id]);

  // Merge streamed execution events into the console history, deduped by id (the
  // SSE replays history on connect; snapshots carry no events). PIPELINE_COMPLETE
  // is the mandatory terminal signal: force a snapshot refresh so the UI always
  // lands on the final, actionable state — even when the build was skipped.
  const appendEvent = useCallback((event: GenerationExecutionEvent) => {
    lastActivityRef.current = Date.now();
    if (event.type === 'pipeline_complete') void refresh().catch(() => undefined);
    setEvents((prev) => (prev.some((item) => item.id === event.id) ? prev : [...prev, event].slice(-3000)));
  }, [refresh]);

  const handleJobSnapshot = useCallback((next: ResilientGenerationJob) => {
    lastActivityRef.current = Date.now();
    setStale(false);
    setJob(next);
  }, []);

  useEffect(() => {
    let active = true;
    refresh().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o job.');
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) return;
    const controller = new AbortController();
    metaFactoryClient.streamJob(job.id, handleJobSnapshot, controller.signal, appendEvent).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Falha no streaming da pipeline.');
    });
    return () => controller.abort();
  }, [job?.id, appendEvent, handleJobSnapshot]);

  // Staleness detector: an active job with no backend signal for 45s surfaces
  // the manual-continuation fallback (never an infinite spinner).
  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) {
      setStale(false);
      return;
    }
    const timer = window.setInterval(() => {
      setStale(lastActivityRef.current > 0 && Date.now() - lastActivityRef.current > 45_000);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  const runAction = useCallback(async (name: string, operation: () => Promise<ResilientGenerationJob>) => {
    setAction(name);
    setError(null);
    try {
      setJob(await operation());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'A ação não pôde ser concluída.');
    } finally {
      setAction(null);
    }
  }, []);

  const start = (mode: 'llm' | 'deterministic') => runAction(`start-${mode}`, () => metaFactoryClient.createJob({
    projectId: room.room_id,
    workspaceId: room.workspace_id,
    projectName: room.title,
    spec,
    blueprint,
    blueprintVersion: room.active_blueprint_version ?? room.architecture_blueprint?.version ?? 0,
    mode,
  }));

  const retry = (mode: 'normal' | 'partitioned' | 'deterministic') => {
    if (!job) return Promise.resolve();
    const stage = job.error?.stage ?? job.currentStage;
    return runAction(`retry-${mode}`, () => metaFactoryClient.retryJobStage(job.id, stage, mode));
  };

  const filteredLogs = useMemo(() => {
    const needle = logQuery.trim().toLowerCase();
    return (job?.logs ?? []).filter((entry) =>
      (logStage === 'all' || entry.stage.toLowerCase().includes(logStage))
      && (!needle || `${entry.message} ${entry.detail ?? ''}`.toLowerCase().includes(needle)),
    ).slice().reverse();
  }, [job?.logs, logQuery, logStage]);

  // Only the stages THIS job actually has (driven by its own spec.delivery_type
  // server-side, e.g. "mobile" is absent for a web-only job) -- never the full
  // possible STAGES list, so the grid never shows a phantom stage card.
  const visibleStages = useMemo(
    () => (job ? STAGES.filter(([key]) => key in job.stageStatuses) : STAGES),
    [job?.stageStatuses],
  );

  if (loading) {
    return <div className="grid min-h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--accent)]" /></div>;
  }

  if (!job) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <WorkflowContextHeader room={room} stage="Meta Factory" />
        <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/70">
          <div className="border-b border-border/60 bg-[linear-gradient(115deg,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_55%)] p-7">
            <Badge tone="accent">{t('pipeline.persistent')}</Badge>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t('pipeline.readyToStart')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('pipeline.readyHint')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 p-7">
            <Button variant="primary" loading={action === 'start-llm'} onClick={() => void start('llm')}>
              <Play className="h-4 w-4" /> {t('pipeline.startGlobal')}
            </Button>
            <Button loading={action === 'start-deterministic'} onClick={() => void start('deterministic')}>
              {t('pipeline.startOffline')}
            </Button>
          </div>
          {error ? <ErrorBanner message={error} /> : null}
        </section>
      </div>
    );
  }

  const active = !TERMINAL.has(job.status);
  const rawArtifact = job.artifacts.find((item) => item.kind === 'raw_response' && item.path === job.error?.raw_response_path)
    ?? job.artifacts.slice().reverse().find((item) => item.kind === 'raw_response');

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
      <WorkflowContextHeader room={room} stage={job.status === 'READY' ? 'Ready' : 'Generation'} />

      <header className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
        <div className="grid gap-4 border-b border-border/60 p-5 md:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={job.status === 'READY' ? 'success' : job.status === 'STALLED' ? 'warning' : job.status === 'NEEDS_USER_ACTION' || job.status === 'FAILED' ? 'danger' : 'accent'}>{job.status}</Badge>
              {job.partial ? <Badge tone="warning">{t('pipeline.partial')}</Badge> : <Badge tone="success">{t('pipeline.validArtifact')}</Badge>}
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight">{t('pipeline.metaFactoryPrefix')} {job.projectName}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{job.id}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <Meta label="Provider" value={job.providerLabel} />
            <Meta label="Modelo" value={job.model ?? '—'} />
            <Meta label="Blueprint" value={`v${job.blueprintVersion}`} />
            <Meta label="Etapa" value={job.currentStage} />
            <Meta label="Progresso" value={`${job.progress}%`} />
            <Meta label="Retries" value={String(job.retryCount)} />
          </div>
        </div>
        <div className="h-1.5 bg-background/50"><div className="h-full bg-[color:var(--accent)] transition-[width] duration-500" style={{ width: `${job.progress}%` }} /></div>
      </header>

      {error ? <ErrorBanner message={error} /> : null}
      {stale && active ? (
        <StalePipelineFallback
          loading={action === 'manual-refresh'}
          onContinue={() => void runAction('manual-refresh', async () => (await refresh()) ?? job)}
        />
      ) : null}
      {job.buildStatus === 'SKIPPED_AFTER_FAILURE' ? (
        <BuildSkippedPanel
          job={job}
          action={action}
          // Explicit 'build' stage: on a degraded READY job there is no error
          // and currentStage is READY, which the generic retry() cannot map.
          retryBuild={() => runAction('retry-build', () => metaFactoryClient.retryJobStage(job.id, 'build', 'normal'))}
          continuePipeline={() => runAction(
            'continue-build-skip',
            () => metaFactoryClient.continueAfterBuildSkip(job.id),
          )}
          exportPartial={() => runAction('download-partial', async () => {
            if (job.generatedProjectId) {
              await metaFactoryClient.prepareDownload(job.generatedProjectId, true);
              await metaFactoryClient.download(job.generatedProjectId);
            }
            return job;
          })}
        />
      ) : null}
      {job.error ? <FailurePanel job={job} action={action} retry={retry} rawArtifact={rawArtifact} resume={() => runAction('resume', () => metaFactoryClient.resumeJob(job.id))} continueWithWarnings={() => runAction('continue', () => metaFactoryClient.continueWithWarnings(job.id))} /> : null}

      <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div><h2 className="font-semibold">{t('pipeline.title')}</h2><p className="text-xs text-muted-foreground">{t('pipeline.gateHint')}</p></div>
          <div className="flex gap-2">
            {job.generatedProjectId ? (
              <Button onClick={() => setTerminalOpen((current) => !current)} aria-expanded={terminalOpen}>
                <TerminalSquare className="h-4 w-4" /> {terminalOpen ? t('terminal.close') : t('terminal.open')}
              </Button>
            ) : null}
            {active ? <Button onClick={() => void runAction('pause', () => metaFactoryClient.pauseJob(job.id))} loading={action === 'pause'}><Pause className="h-4 w-4" /> {t('pipeline.cancel')}</Button> : null}
            {job.status === 'PAUSED' ? <Button variant="primary" onClick={() => void runAction('resume', () => metaFactoryClient.resumeJob(job.id))} loading={action === 'resume'}><Play className="h-4 w-4" /> {t('pipeline.continue')}</Button> : null}
            {!active ? (
              <DeleteResourceButton
                title={t('pipeline.delete.title')}
                description={t('pipeline.delete.description', { name: job.projectName })}
                triggerLabel={t('pipeline.delete.trigger')}
                onConfirm={async () => {
                  await metaFactoryClient.deleteJob(job.id);
                  setJob(null);
                  setEvents([]);
                }}
              />
            ) : null}
          </div>
        </div>
        <ol
          className="grid gap-2 md:grid-cols-3 xl:grid-cols-[repeat(var(--stage-count),minmax(0,1fr))]"
          style={{ '--stage-count': visibleStages.length } as CSSProperties}
        >
          {visibleStages.map(([key, label], index) => {
            const state = job.stageStatuses[key] ?? 'waiting';
            return <li key={key} className="relative rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{String(index + 1).padStart(2, '0')}</span><span className={state === 'failed' ? 'text-[color:var(--danger)]' : state === 'stalled' ? 'text-[color:var(--warning)]' : state === 'success' ? 'text-[color:var(--success)]' : 'text-[color:var(--accent)]'}><StageIcon status={state} /></span></div>
              <p className="mt-4 text-sm font-medium">{label}</p><Badge tone={stageTone(state)} className="mt-2 px-2 py-0.5 text-xs">{state}</Badge>
            </li>;
          })}
        </ol>
      </section>

      <RepairTimeline events={events} />

      {/* Side-by-side: live pipeline log + real execution terminal (when open). */}
      <div className={terminalOpen && job.generatedProjectId ? 'grid gap-5 xl:grid-cols-2' : undefined}>
        <LiveExecutionConsole events={events} currentStage={job.currentStage} running={active} />
        {terminalOpen && job.generatedProjectId ? (
          <ExecutionTerminal
            projectId={job.generatedProjectId}
            suggestedCommands={job.manualBuildFixGuide?.commands}
            onRetryBuild={() => void runAction('retry-build', () => metaFactoryClient.retryJobStage(job.id, 'build', 'normal'))}
            retryLoading={action === 'retry-build'}
          />
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto"><h2 className="font-semibold">{t('pipeline.log.title')}</h2><p className="text-xs text-muted-foreground">{t('pipeline.log.hint')}</p></div>
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs"><Search className="h-3.5 w-3.5" /><input className="w-32 bg-transparent outline-none" value={logQuery} onChange={(event) => setLogQuery(event.target.value)} placeholder={t('pipeline.log.search')} /></label>
            <select value={logStage} onChange={(event) => setLogStage(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <option value="all">{t('pipeline.log.all')}</option>{visibleStages.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
            {filteredLogs.map((entry) => <div key={entry.id} className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-border/50 bg-background/35 p-3 text-xs">
              <span className="font-mono text-muted-foreground">{new Date(entry.timestamp).toLocaleTimeString('pt-BR')}</span><div><p className={entry.level === 'error' ? 'text-[color:var(--danger)]' : 'text-foreground'}>{entry.message}</p>{entry.detail ? <p className="mt-1 text-muted-foreground">{entry.detail}</p> : null}<p className="mt-1 font-mono text-xs text-muted-foreground">{entry.stage}</p></div>
            </div>)}
            {filteredLogs.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t('pipeline.log.empty')}</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
          <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{t('pipeline.artifacts.title')}</h2><p className="text-xs text-muted-foreground">{t('pipeline.artifacts.count', { files: job.artifacts.length, checkpoints: job.checkpoints.length })}</p></div><Archive className="h-5 w-5 text-muted-foreground" /></div>
          <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
            {job.artifacts.slice().reverse().map((artifact) => <ArtifactRow key={artifact.id} artifact={artifact} jobId={job.id} />)}
          </div>
        </section>
      </div>

      {job.status === 'READY' && job.valid && job.packageReady && !job.partial ? (
        <>
          <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_9%,transparent)] p-5">
            <Check className="h-5 w-5 text-[color:var(--success)]" /><div className="mr-auto"><h2 className="font-semibold">{t('pipeline.done.title')}</h2><p className="text-sm text-muted-foreground">{t('pipeline.done.hint')}</p></div>
            {job.generatedProjectId ? <Button variant="primary" onClick={() => void metaFactoryClient.download(job.generatedProjectId!)}><Download className="h-4 w-4" /> {t('pipeline.done.download')}</Button> : null}
          </section>
          {job.generatedProjectId ? (
            <ExportPanel
              surface="meta-factory"
              projectId={job.generatedProjectId}
              defaultRepoName={job.projectName.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-') || 'meta-factory-project'}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="max-w-40 truncate text-xs font-medium" title={value}>{value}</p></div>;
}

function ErrorBanner({ message }: { readonly message: string }) {
  return <div className="m-5 flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_9%,transparent)] p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--danger)]" /><span>{message}</span></div>;
}

function StalePipelineFallback({ loading, onContinue }: {
  readonly loading: boolean;
  readonly onContinue: () => void;
}) {
  const { t } = useLocale();
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface-2))] p-4">
      <Clock3 className="h-5 w-5 shrink-0 text-[color:var(--warning)]" aria-hidden />
      <div className="mr-auto min-w-0">
        <p className="text-sm font-semibold">{t('pipeline.stale.title')}</p>
        <p className="text-xs text-muted-foreground">{t('pipeline.stale.desc')}</p>
      </div>
      <Button variant="primary" loading={loading} onClick={onContinue}>
        <RefreshCcw className="h-4 w-4" aria-hidden /> {t('pipeline.stale.continue')}
      </Button>
    </section>
  );
}

function BuildSkippedPanel({ job, action, retryBuild, continuePipeline, exportPartial }: {
  readonly job: ResilientGenerationJob;
  readonly action: string | null;
  readonly retryBuild: () => void;
  readonly continuePipeline: () => void;
  readonly exportPartial: () => void;
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const guide = job.manualBuildFixGuide;
  const retryLimitReached = job.manualBuildRetryCount >= 3;

  return (
    <section className="rounded-2xl border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface-2))] p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--warning)]" aria-hidden />
        <div className="min-w-0">
          <Badge tone="warning">SKIPPED_AFTER_FAILURE</Badge>
          <h2 className="mt-3 font-semibold">Build interrompido após 2 tentativas automáticas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {guide?.original_error ?? 'O build continuou falhando após a política limitada de recuperação.'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            <strong>Motivo do skip:</strong> {guide?.root_cause ?? 'O limite seguro de auto-recuperação foi atingido.'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setGuideOpen((current) => !current)} aria-expanded={guideOpen}>
          <FileCode2 className="h-4 w-4" aria-hidden />
          {guideOpen ? 'Ocultar guia de correção' : 'Ver guia de correção'}
        </Button>
        <Button
          variant="primary"
          loading={action === 'retry-build'}
          disabled={retryLimitReached}
          onClick={retryBuild}
        >
          <RefreshCcw className="h-4 w-4" aria-hidden />
          {retryLimitReached ? 'Limite de reexecuções atingido' : 'Reexecutar build manualmente'}
        </Button>
        <Button
          loading={action === 'continue-build-skip'}
          disabled={job.buildSkipAcknowledged}
          onClick={continuePipeline}
        >
          <Play className="h-4 w-4" aria-hidden />
          {job.buildSkipAcknowledged ? 'Continuidade confirmada' : 'Continuar pipeline mesmo assim'}
        </Button>
        {job.generatedProjectId ? (
          <Button loading={action === 'download-partial'} onClick={exportPartial}>
            <Download className="h-4 w-4" aria-hidden /> Exportar código parcial
          </Button>
        ) : null}
      </div>

      {guideOpen && guide ? (
        <div className="mt-5 grid gap-4 rounded-xl border border-border/60 bg-background/45 p-4 text-sm">
          <GuideList title="Arquivos afetados" items={guide.affected_files} />
          <GuideList title="Dependências problemáticas" items={guide.problematic_dependencies} />
          {Object.keys(guide.suggested_versions).length ? (
            <div><h3 className="font-semibold">Versões sugeridas</h3><ul className="mt-2 space-y-1 font-mono text-xs">{Object.entries(guide.suggested_versions).map(([name, version]) => <li key={name}>{name}: {version}</li>)}</ul></div>
          ) : null}
          <GuideList title="Patches aplicados" items={guide.patches_applied} />
          <GuideList title="Passo a passo" items={guide.steps} ordered />
          <div><h3 className="font-semibold">Comandos de correção</h3><pre className="mt-2 overflow-x-auto rounded-lg bg-black/35 p-3 text-xs"><code>{guide.commands.join('\n')}</code></pre></div>
          <details><summary className="cursor-pointer font-semibold">Logs completos</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/35 p-3 text-xs">{guide.full_logs}</pre></details>
        </div>
      ) : null}
    </section>
  );
}

function GuideList({ title, items, ordered = false }: { readonly title: string; readonly items: readonly string[]; readonly ordered?: boolean }) {
  if (!items.length) return null;
  const content = items.map((item) => <li key={item} className="break-words">{item}</li>);
  return <div><h3 className="font-semibold">{title}</h3>{ordered ? <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">{content}</ol> : <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{content}</ul>}</div>;
}

function ArtifactRow({ artifact, jobId }: { readonly artifact: GenerationArtifact; readonly jobId: string }) {
  const { t } = useLocale();
  return <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/35 p-3"><FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium" title={artifact.name}>{artifact.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{artifact.stage} · {`${Math.ceil(artifact.size_bytes / 1024)} KB`} · {artifact.valid ? t('pipeline.artifact.valid') : artifact.kind}{artifact.warnings.length ? ` · ${artifact.warnings.length} warning(s)` : ''}</p></div>{artifact.kind === 'raw_response' ? <button className="text-xs text-[color:var(--accent)] hover:underline" onClick={() => void metaFactoryClient.downloadRawArtifact(jobId, artifact.id, artifact.name.split('/').at(-1) ?? 'raw.txt')}>{t('pipeline.artifact.open')}</button> : null}</div>;
}

// Build Auto-Repair timeline: renders the repair_* execution events streamed by
// the build pipeline (detect -> patch -> re-run) so the user watches the loop live.
function RepairTimeline({ events }: { readonly events: readonly GenerationExecutionEvent[] }) {
  const { t } = useLocale();
  const repairs = events.filter((event) => event.type === 'repair_started' || event.type === 'repair_applied' || event.type === 'repair_failed');
  if (!repairs.length) return null;
  return (
    <section className="rounded-2xl border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-card/60 p-5">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-[color:var(--warning)]" />
        <h2 className="font-semibold">{t('pipeline.repair.title')}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('pipeline.repair.hint')}</p>
      <ol className="mt-4 space-y-2">
        {repairs.slice(-12).map((event) => (
          <li key={event.id} className="grid grid-cols-[auto_auto_1fr] items-start gap-3 rounded-lg border border-border/50 bg-background/35 p-3 text-xs">
            <span className="font-mono text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString('pt-BR')}</span>
            {event.type === 'repair_started'
              ? <Loader2 className="mt-0.5 h-3.5 w-3.5 text-[color:var(--accent)]" />
              : event.type === 'repair_applied'
                ? <Check className="mt-0.5 h-3.5 w-3.5 text-[color:var(--success)]" />
                : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-[color:var(--danger)]" />}
            <span className={event.type === 'repair_failed' ? 'text-[color:var(--danger)]' : 'text-foreground'}>{event.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FailurePanel({ job, action, retry, rawArtifact, resume, continueWithWarnings }: { readonly job: ResilientGenerationJob; readonly action: string | null; readonly retry: (mode: 'normal' | 'partitioned' | 'deterministic') => Promise<void>; readonly rawArtifact?: GenerationArtifact; readonly resume: () => Promise<void>; readonly continueWithWarnings: () => Promise<void> }) {
  const { t } = useLocale();
  const failure = job.error!;
  const stalled = failure.kind === 'stall' || job.status === 'STALLED';
  const buildFailure = failure.stage === 'BUILD_RUNNING';
  const generated = job.artifacts.filter((item) => item.kind === 'generated');
  const validCount = generated.filter((item) => item.valid).length;
  const accent = stalled ? 'warning' : 'danger';
  return <section className={`rounded-2xl border border-[color-mix(in_srgb,var(--${accent})_38%,transparent)] bg-card/70 p-5`}>
    <div className="flex items-start gap-3">
      {stalled ? <Clock3 className="mt-0.5 h-5 w-5 text-[color:var(--warning)]" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-[color:var(--danger)]" />}
      <div>
        <h2 className="font-semibold">{buildFailure ? t('pipeline.failure.buildFailed') : stalled ? t('pipeline.failure.stalled') : t('pipeline.failure.needsAction')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{failure.message}</p>
        {failure.reason && failure.reason !== failure.message ? <p className="mt-1 text-xs text-muted-foreground"><strong>{t('pipeline.failure.reason')}</strong> {failure.reason}</p> : null}
      </div>
    </div>

    <div className="mt-4 grid gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-background/35 p-4 text-xs sm:grid-cols-2 lg:grid-cols-5">
      <Meta label="Arquivos gerados" value={String(generated.length)} />
      <Meta label="Arquivos válidos" value={String(validCount)} />
      <Meta label="Warnings" value={String(failure.warning_count)} />
      <Meta label="Bloqueantes" value={String(failure.blocking_count)} />
      <Meta label="Próximo passo" value={failure.next_expected_transition ?? '—'} />
    </div>

    <dl className="mt-3 grid gap-3 rounded-xl border border-border/60 bg-background/35 p-4 text-xs sm:grid-cols-3 lg:grid-cols-6">
      <Meta label="Job" value={job.id} /><Meta label="Projeto" value={job.projectId} /><Meta label="Etapa" value={failure.stage} /><Meta label="Agente" value={failure.agent} /><Meta label="Validator" value={failure.validator ?? '—'} /><Meta label="Tentativa" value={String(failure.attempt)} />
      <Meta label="Provider" value={failure.provider ?? 'Nenhum'} /><Meta label="Modelo" value={failure.model ?? '—'} /><Meta label="Tempo decorrido" value={`${failure.elapsed_seconds}s${failure.timeout_seconds ? ` / ${failure.timeout_seconds}s` : ''}`} /><Meta label="Erros" value={String(failure.error_count)} /><Meta label="Último checkpoint" value={failure.last_successful_checkpoint ?? '—'} /><Meta label="Último artefato" value={failure.last_generated_artifact ?? '—'} />
    </dl>
    {failure.last_log ? <p className="mt-3 rounded-lg border border-border/50 bg-background/35 p-3 font-mono text-xs text-muted-foreground"><strong>{t('pipeline.failure.lastLog')}</strong> {failure.last_log}</p> : null}
    <p className="mt-4 text-sm"><strong>{t('pipeline.failure.recommended')}</strong> {failure.recommended_action}</p>

    <div className="mt-4 flex flex-wrap gap-2">
      {buildFailure ? (
        <Button variant="primary" loading={action === 'retry-normal'} onClick={() => void retry('normal')}><Wrench className="h-4 w-4" /> {t('pipeline.failure.autoFix')}</Button>
      ) : (
        <Button variant="primary" loading={action === 'retry-normal'} onClick={() => void retry('normal')}><RefreshCcw className="h-4 w-4" /> {t('pipeline.failure.retryBackend')}</Button>
      )}
      {failure.can_continue_with_warnings ? <Button loading={action === 'continue'} onClick={() => void continueWithWarnings()}><Play className="h-4 w-4" /> {t('pipeline.failure.continueWarnings')}</Button> : null}
      <Button loading={action === 'retry-partitioned'} onClick={() => void retry('partitioned')}><ServerCog className="h-4 w-4" /> {t('pipeline.failure.retryPartitioned')}</Button>
      <Button loading={action === 'retry-deterministic'} onClick={() => void retry('deterministic')}>{t('pipeline.failure.fallback')}</Button>
      <Button loading={action === 'resume'} onClick={() => void resume()}><Play className="h-4 w-4" /> {t('pipeline.failure.lastCheckpoint')}</Button>
      <Link href="/settings#llm" className="focus-ring inline-flex items-center rounded-[var(--radius-md)] border border-border px-4 py-2 text-sm">{t('pipeline.failure.switchProvider')}</Link>
      {rawArtifact ? <Button onClick={() => void metaFactoryClient.downloadRawArtifact(job.id, rawArtifact.id, 'raw-response.txt')}>{t('pipeline.failure.rawResponse')}</Button> : null}
      <Button onClick={() => void metaFactoryClient.downloadJobDiagnostic(job.id)}><Download className="h-4 w-4" /> {t('pipeline.failure.diagnostic')}</Button>
    </div>
  </section>;
}
