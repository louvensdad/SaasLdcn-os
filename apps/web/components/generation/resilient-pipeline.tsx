'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Archive, Check, Clock3, Download, FileCode2,
  Loader2, Pause, Play, RefreshCcw, Search, ServerCog, ShieldAlert, TerminalSquare, Wrench,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteResourceButton } from '@/components/ui/delete-resource-button';
import { WorkflowContextHeader } from '@/components/project/workflow-context-header';
import { DeliveryDecisionCenter } from '@/components/generation/delivery-decision-center';
import { ExecutionTerminal } from '@/components/generation/execution-terminal';
import { ExportPanel } from '@/components/generation/export-panel';
import { LiveExecutionConsole } from '@/components/generation/live-execution-console';
import { useLocale } from '@/hooks/use-locale';
import { mergeStreamedNotification } from '@/hooks/use-notifications';
import { metaFactoryClient, type ProjectSpec, type StreamSignalFrame } from '@/lib/api/meta-factory';
import {
  TERMINAL_JOB_STATUSES, StageIcon, canonicalJobState, canonicalStateLabel, canonicalStateTone, isStalledJob, stageTone,
} from '@/lib/generation/status-presenter';
import type { ProjectRoom } from '@contracts/project-room.contract';
import type { GenerationArtifact, GenerationExecutionEvent, ResilientGenerationJob } from '@contracts/generation-job.contract';
import type { GenerationNotification } from '@contracts/generation-notification.contract';

// The full possible stage set across every delivery_type. Which of these a given
// job actually has is driven by job.stageStatuses (set server-side from the job's
// own spec.delivery_type, see generation_job_engine.steps_for) -- render only the
// ones present for THIS job (see visibleStages below), not this whole list.
type Translator = (key: string, values?: Record<string, string | number>) => string;

function buildStages(t: Translator) {
  return [
    ['contracts', t('pipeline.stages.contracts')], ['database', t('pipeline.stages.database')], ['backend', t('pipeline.stages.backend')],
    ['frontend', t('pipeline.stages.frontend')], ['mobile', t('pipeline.stages.mobile')], ['security', t('pipeline.stages.security')], ['tests', t('pipeline.stages.tests')],
    ['docs', t('pipeline.stages.docs')], ['build', t('pipeline.stages.build')], ['package', t('pipeline.stages.package')],
  ] as const;
}

interface ResilientPipelineProps {
  room: ProjectRoom;
  spec: ProjectSpec;
  blueprint: unknown;
}

// 'soft'/'checking'/'still-running'/'not-found' only ever appear after the
// 45s real-signal ladder (or an explicit backend stream_timeout) has already
// triggered an automatic consult -- never a bare "try again" button shown on
// a mere client-side guess.
type SignalBanner = { kind: 'none' } | { kind: 'soft' } | { kind: 'checking' } | { kind: 'still-running' } | { kind: 'not-found' };

export function ResilientPipeline({ room, spec, blueprint }: ResilientPipelineProps) {
  const { t, locale } = useLocale();
  const queryClient = useQueryClient();
  const STAGES = useMemo(() => buildStages(t), [t]);
  const [job, setJob] = useState<ResilientGenerationJob | null>(null);
  const [events, setEvents] = useState<readonly GenerationExecutionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logQuery, setLogQuery] = useState('');
  const [logStage, setLogStage] = useState('all');

  // Real-signal ladder (replaces the old client-only 45s guess): a real
  // `heartbeat` SSE frame now resets this clock (previously silently
  // dropped), so a genuinely live backend never looks stale. 0-15s idle:
  // nothing shown. 15-45s: a soft, non-alarming note. >45s (or an explicit
  // `stream_timeout` frame): AUTOMATICALLY consult the real backend state
  // before showing anything -- never a bare "Continuar manualmente" button
  // with no prior real check.
  const lastActivityRef = useRef(0);
  const [signal, setSignal] = useState<SignalBanner>({ kind: 'none' });
  const consultingRef = useRef(false);
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
    setSignal({ kind: 'none' });
    setJob(latest);
    setEvents(latest?.events ?? []);
    return latest;
  }, [room.room_id]);

  // The auto-consult itself: fetches real current state and only then decides
  // what to show -- still running, a real terminal status was reached, or the
  // job is gone. Guarded by consultingRef so the 5s ladder tick and an
  // incoming stream_timeout frame never fire two overlapping consults.
  const consultBackend = useCallback(async () => {
    if (consultingRef.current) return;
    consultingRef.current = true;
    setSignal({ kind: 'checking' });
    try {
      const latest = await metaFactoryClient.latestJob(room.room_id);
      lastActivityRef.current = Date.now(); // the consult is itself a real backend signal
      if (!latest) { setSignal({ kind: 'not-found' }); return; }
      setJob(latest);
      setSignal(TERMINAL_JOB_STATUSES.has(latest.status) ? { kind: 'none' } : { kind: 'still-running' });
    } catch {
      setSignal({ kind: 'not-found' });
    } finally {
      consultingRef.current = false;
    }
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
    setSignal({ kind: 'none' });
    setJob(next);
  }, []);

  // A real heartbeat proves liveness without being "activity" to render (it's
  // never mistaken for actual generation progress); an explicit backend
  // stream_timeout is the backend itself confirming it gave up waiting for a
  // terminal status, so it's handled exactly like the 45s ladder trigger.
  const handleSignal = useCallback((frame: StreamSignalFrame) => {
    if (frame.type === 'heartbeat') lastActivityRef.current = Date.now();
    else if (frame.type === 'stream_timeout') void consultBackend();
  }, [consultBackend]);

  // Instant notification-center updates for whoever's actively watching this
  // job's stream, instead of waiting for the notification hook's own poll.
  const handleNotification = useCallback((notification: GenerationNotification) => {
    mergeStreamedNotification(queryClient, notification);
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    refresh().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o job.');
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!job || TERMINAL_JOB_STATUSES.has(job.status)) return;
    const controller = new AbortController();
    metaFactoryClient.streamJob(job.id, handleJobSnapshot, controller.signal, appendEvent, handleSignal, handleNotification).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Falha no streaming da pipeline.');
    });
    return () => controller.abort();
    // Depends on job?.id (not the whole `job` object) so a snapshot update
    // from the stream itself doesn't tear down and reconnect the SSE stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, appendEvent, handleJobSnapshot, handleSignal, handleNotification]);

  useEffect(() => {
    if (!job || TERMINAL_JOB_STATUSES.has(job.status)) { setSignal({ kind: 'none' }); return; }
    const timer = window.setInterval(() => {
      if (consultingRef.current) return;
      const idle = lastActivityRef.current > 0 ? Date.now() - lastActivityRef.current : 0;
      if (idle < 15_000) { setSignal((prev) => (prev.kind === 'none' ? prev : { kind: 'none' })); return; }
      if (idle < 45_000) { setSignal((prev) => (prev.kind === 'soft' ? prev : { kind: 'soft' })); return; }
      void consultBackend();
    }, 5_000);
    return () => window.clearInterval(timer);
    // Depends on job?.id/job?.status (not the whole `job` object) so the
    // ladder interval doesn't reset on every unrelated job field update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, consultBackend]);

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
    [job, STAGES],
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

  const active = !TERMINAL_JOB_STATUSES.has(job.status);
  const rawArtifact = job.artifacts.find((item) => item.kind === 'raw_response' && item.path === job.error?.raw_response_path)
    ?? job.artifacts.slice().reverse().find((item) => item.kind === 'raw_response');
  const jobState = canonicalJobState({
    status: job.status, retryCount: job.retryCount, errorKind: job.error?.kind, canContinueWithWarnings: job.error?.can_continue_with_warnings,
  });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6">
      <WorkflowContextHeader room={room} stage={job.status === 'READY' ? 'Ready' : 'Generation'} />

      <header className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
        <div className="grid gap-4 border-b border-border/60 p-5 md:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={canonicalStateTone(jobState)}>{canonicalStateLabel(t, jobState, job.retryCount)}</Badge>
              {job.partial ? <Badge tone="warning">{t('pipeline.partial')}</Badge> : <Badge tone="success">{t('pipeline.validArtifact')}</Badge>}
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight">{t('pipeline.metaFactoryPrefix')} {job.projectName}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{job.id}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <Meta label={t('pipeline.meta.provider')} value={job.providerLabel} />
            <Meta label={t('pipeline.meta.model')} value={job.model ?? '—'} />
            <Meta label={t('pipeline.meta.blueprint')} value={`v${job.blueprintVersion}`} />
            <Meta label={t('pipeline.meta.stage')} value={job.currentStage} />
            <Meta label={t('pipeline.meta.progress')} value={`${job.progress}%`} />
            <Meta label={t('pipeline.meta.retries')} value={String(job.retryCount)} />
          </div>
        </div>
        <div className="h-1.5 bg-background/50"><div className="h-full bg-[color:var(--accent)] transition-[width] duration-500" style={{ width: `${job.progress}%` }} /></div>
      </header>

      {error ? <ErrorBanner message={error} /> : null}
      {signal.kind === 'soft' && active ? <SoftSignalNote /> : null}
      {(signal.kind === 'checking' || signal.kind === 'still-running' || signal.kind === 'not-found') && active ? (
        <StalePipelineFallback kind={signal.kind} loading={signal.kind === 'checking'} onContinue={() => void consultBackend()} />
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
              <span className="font-mono text-muted-foreground">{new Date(entry.timestamp).toLocaleTimeString(locale)}</span><div><p className={entry.level === 'error' ? 'text-[color:var(--danger)]' : 'text-foreground'}>{entry.message}</p>{entry.detail ? <p className="mt-1 text-muted-foreground">{entry.detail}</p> : null}<p className="mt-1 font-mono text-xs text-muted-foreground">{entry.stage}</p></div>
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
          {job.generatedProjectId ? <DeliveryDecisionCenter projectId={job.generatedProjectId} /> : null}
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

// A non-alarming inline note for the 15-45s idle tier: no button, no
// takeover -- the job is very likely fine, this just says so honestly
// instead of staying silent or jumping straight to an alarming banner.
function SoftSignalNote() {
  const { t } = useLocale();
  return (
    <p className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/35 px-4 py-2.5 text-xs text-muted-foreground">
      <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden /> {t('pipeline.stale.soft')}
    </p>
  );
}

// Only ever rendered after the >45s ladder tier (or a real backend
// stream_timeout frame) has already triggered an automatic consult -- the
// copy always reflects what that real consult found, never a raw guess.
function StalePipelineFallback({ kind, loading, onContinue }: {
  readonly kind: 'checking' | 'still-running' | 'not-found';
  readonly loading: boolean;
  readonly onContinue: () => void;
}) {
  const { t } = useLocale();
  const title = kind === 'checking' ? t('pipeline.stale.checking')
    : kind === 'still-running' ? t('pipeline.stale.stillRunning.title')
      : t('pipeline.stale.notFound.title');
  const desc = kind === 'still-running' ? t('pipeline.stale.stillRunning.desc')
    : kind === 'not-found' ? t('pipeline.stale.notFound.desc')
      : null;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface-2))] p-4">
      <Clock3 className="h-5 w-5 shrink-0 text-[color:var(--warning)]" aria-hidden />
      <div className="mr-auto min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {desc ? <p className="text-xs text-muted-foreground">{desc}</p> : null}
      </div>
      {kind !== 'checking' ? (
        <Button variant="primary" loading={loading} onClick={onContinue}>
          <RefreshCcw className="h-4 w-4" aria-hidden /> {t('pipeline.stale.recheck')}
        </Button>
      ) : null}
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
  const { t } = useLocale();
  const [guideOpen, setGuideOpen] = useState(false);
  const guide = job.manualBuildFixGuide;
  const retryLimitReached = job.manualBuildRetryCount >= 3;

  return (
    <section className="rounded-2xl border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface-2))] p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--warning)]" aria-hidden />
        <div className="min-w-0">
          <Badge tone="warning">{t('pipeline.buildSkip.status')}</Badge>
          <h2 className="mt-3 font-semibold">{t('pipeline.buildSkip.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {guide?.original_error ?? t('pipeline.buildSkip.defaultError')}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            <strong>{t('pipeline.buildSkip.skipReasonLabel')}</strong> {guide?.root_cause ?? t('pipeline.buildSkip.defaultRootCause')}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setGuideOpen((current) => !current)} aria-expanded={guideOpen}>
          <FileCode2 className="h-4 w-4" aria-hidden />
          {guideOpen ? t('pipeline.buildSkip.hideGuide') : t('pipeline.buildSkip.showGuide')}
        </Button>
        <Button
          variant="primary"
          loading={action === 'retry-build'}
          disabled={retryLimitReached}
          onClick={retryBuild}
        >
          <RefreshCcw className="h-4 w-4" aria-hidden />
          {retryLimitReached ? t('pipeline.buildSkip.retryLimitReached') : t('pipeline.buildSkip.retryManually')}
        </Button>
        <Button
          loading={action === 'continue-build-skip'}
          disabled={job.buildSkipAcknowledged}
          onClick={continuePipeline}
        >
          <Play className="h-4 w-4" aria-hidden />
          {job.buildSkipAcknowledged ? t('pipeline.buildSkip.continuityConfirmed') : t('pipeline.buildSkip.continueAnyway')}
        </Button>
        {job.generatedProjectId ? (
          <Button loading={action === 'download-partial'} onClick={exportPartial}>
            <Download className="h-4 w-4" aria-hidden /> {t('pipeline.buildSkip.exportPartial')}
          </Button>
        ) : null}
      </div>

      {guideOpen && guide ? (
        <div className="mt-5 grid gap-4 rounded-xl border border-border/60 bg-background/45 p-4 text-sm">
          <GuideList title={t('pipeline.guide.affectedFiles')} items={guide.affected_files} />
          <GuideList title={t('pipeline.guide.problematicDeps')} items={guide.problematic_dependencies} />
          {Object.keys(guide.suggested_versions).length ? (
            <div><h3 className="font-semibold">{t('pipeline.guide.suggestedVersions')}</h3><ul className="mt-2 space-y-1 font-mono text-xs">{Object.entries(guide.suggested_versions).map(([name, version]) => <li key={name}>{name}: {version}</li>)}</ul></div>
          ) : null}
          <GuideList title={t('pipeline.guide.patchesApplied')} items={guide.patches_applied} />
          <GuideList title={t('pipeline.guide.stepByStep')} items={guide.steps} ordered />
          <div><h3 className="font-semibold">{t('pipeline.guide.fixCommands')}</h3><pre className="mt-2 overflow-x-auto rounded-lg bg-black/35 p-3 text-xs"><code>{guide.commands.join('\n')}</code></pre></div>
          <details><summary className="cursor-pointer font-semibold">{t('pipeline.guide.fullLogs')}</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/35 p-3 text-xs">{guide.full_logs}</pre></details>
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
  return <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/35 p-3"><FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium" title={artifact.name}>{artifact.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{artifact.stage} · {`${Math.ceil(artifact.size_bytes / 1024)} KB`} · {artifact.valid ? t('pipeline.artifact.valid') : artifact.kind}{artifact.warnings.length ? ` · ${t('pipeline.artifact.warningsCount', { count: artifact.warnings.length })}` : ''}</p></div>{artifact.kind === 'raw_response' ? <button className="text-xs text-[color:var(--accent)] hover:underline" onClick={() => void metaFactoryClient.downloadRawArtifact(jobId, artifact.id, artifact.name.split('/').at(-1) ?? 'raw.txt')}>{t('pipeline.artifact.open')}</button> : null}</div>;
}

// Build Auto-Repair timeline: renders the repair_* execution events streamed by
// the build pipeline (detect -> patch -> re-run) so the user watches the loop live.
function RepairTimeline({ events }: { readonly events: readonly GenerationExecutionEvent[] }) {
  const { t, locale } = useLocale();
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
            <span className="font-mono text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString(locale)}</span>
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
  const stalled = isStalledJob({ status: job.status, errorKind: failure.kind });
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
      <Meta label={t('pipeline.failure.meta.generatedFiles')} value={String(generated.length)} />
      <Meta label={t('pipeline.failure.meta.validFiles')} value={String(validCount)} />
      <Meta label={t('pipeline.failure.meta.warnings')} value={String(failure.warning_count)} />
      <Meta label={t('pipeline.failure.meta.blocking')} value={String(failure.blocking_count)} />
      <Meta label={t('pipeline.failure.meta.nextStep')} value={failure.next_expected_transition ?? '—'} />
    </div>

    <dl className="mt-3 grid gap-3 rounded-xl border border-border/60 bg-background/35 p-4 text-xs sm:grid-cols-3 lg:grid-cols-6">
      <Meta label={t('pipeline.failure.meta.job')} value={job.id} /><Meta label={t('pipeline.failure.meta.project')} value={job.projectId} /><Meta label={t('pipeline.meta.stage')} value={failure.stage} /><Meta label={t('pipeline.failure.meta.agent')} value={failure.agent} /><Meta label={t('pipeline.failure.meta.validator')} value={failure.validator ?? '—'} /><Meta label={t('pipeline.failure.meta.attempt')} value={String(failure.attempt)} />
      <Meta label={t('pipeline.meta.provider')} value={failure.provider ?? t('pipeline.failure.meta.none')} /><Meta label={t('pipeline.meta.model')} value={failure.model ?? '—'} /><Meta label={t('pipeline.failure.meta.elapsedTime')} value={`${failure.elapsed_seconds}s${failure.timeout_seconds ? ` / ${failure.timeout_seconds}s` : ''}`} /><Meta label={t('pipeline.failure.meta.errors')} value={String(failure.error_count)} /><Meta label={t('pipeline.failure.meta.lastCheckpoint')} value={failure.last_successful_checkpoint ?? '—'} /><Meta label={t('pipeline.failure.meta.lastArtifact')} value={failure.last_generated_artifact ?? '—'} />
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
