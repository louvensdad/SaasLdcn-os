'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Archive, Check, Circle, Clock3, Download, FileCode2,
  Loader2, Pause, Play, RefreshCcw, Search, ServerCog, ShieldAlert,
} from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkflowContextHeader } from '@/components/project/workflow-context-header';
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
  if (status === 'running' || status === 'retrying') return 'accent';
  return 'neutral';
}

function StageIcon({ status }: { readonly status: GenerationStageStatus }) {
  if (status === 'success') return <Check className="h-4 w-4" />;
  if (status === 'failed') return <AlertTriangle className="h-4 w-4" />;
  if (status === 'stalled') return <Clock3 className="h-4 w-4" />;
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

  const refresh = useCallback(async () => {
    const latest = await metaFactoryClient.latestJob(room.room_id);
    setJob(latest);
    setEvents(latest?.events ?? []);
    return latest;
  }, [room.room_id]);

  // Merge streamed execution events into the console history, deduped by id (the
  // SSE replays history on connect; snapshots carry no events).
  const appendEvent = useCallback((event: GenerationExecutionEvent) => {
    setEvents((prev) => (prev.some((item) => item.id === event.id) ? prev : [...prev, event].slice(-3000)));
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
    metaFactoryClient.streamJob(job.id, setJob, controller.signal, appendEvent).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Falha no streaming da pipeline.');
    });
    return () => controller.abort();
  }, [job?.id, appendEvent]);

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
      {job.error ? <FailurePanel job={job} action={action} retry={retry} rawArtifact={rawArtifact} resume={() => runAction('resume', () => metaFactoryClient.resumeJob(job.id))} continueWithWarnings={() => runAction('continue', () => metaFactoryClient.continueWithWarnings(job.id))} /> : null}

      <section className="rounded-2xl border border-border/60 bg-card/60 p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div><h2 className="font-semibold">{t('pipeline.title')}</h2><p className="text-xs text-muted-foreground">{t('pipeline.gateHint')}</p></div>
          <div className="flex gap-2">
            {active ? <Button onClick={() => void runAction('pause', () => metaFactoryClient.pauseJob(job.id))} loading={action === 'pause'}><Pause className="h-4 w-4" /> {t('pipeline.cancel')}</Button> : null}
            {job.status === 'PAUSED' ? <Button variant="primary" onClick={() => void runAction('resume', () => metaFactoryClient.resumeJob(job.id))} loading={action === 'resume'}><Play className="h-4 w-4" /> {t('pipeline.continue')}</Button> : null}
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

      <LiveExecutionConsole events={events} currentStage={job.currentStage} running={active} />

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
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_9%,transparent)] p-5">
          <Check className="h-5 w-5 text-[color:var(--success)]" /><div className="mr-auto"><h2 className="font-semibold">{t('pipeline.done.title')}</h2><p className="text-sm text-muted-foreground">{t('pipeline.done.hint')}</p></div>
          {job.generatedProjectId ? <Button variant="primary" onClick={() => void metaFactoryClient.download(job.generatedProjectId!)}><Download className="h-4 w-4" /> {t('pipeline.done.download')}</Button> : null}
        </section>
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

function ArtifactRow({ artifact, jobId }: { readonly artifact: GenerationArtifact; readonly jobId: string }) {
  const { t } = useLocale();
  return <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/35 p-3"><FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium" title={artifact.name}>{artifact.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{artifact.stage} · {`${Math.ceil(artifact.size_bytes / 1024)} KB`} · {artifact.valid ? t('pipeline.artifact.valid') : artifact.kind}{artifact.warnings.length ? ` · ${artifact.warnings.length} warning(s)` : ''}</p></div>{artifact.kind === 'raw_response' ? <button className="text-xs text-[color:var(--accent)] hover:underline" onClick={() => void metaFactoryClient.downloadRawArtifact(jobId, artifact.id, artifact.name.split('/').at(-1) ?? 'raw.txt')}>{t('pipeline.artifact.open')}</button> : null}</div>;
}

function FailurePanel({ job, action, retry, rawArtifact, resume, continueWithWarnings }: { readonly job: ResilientGenerationJob; readonly action: string | null; readonly retry: (mode: 'normal' | 'partitioned' | 'deterministic') => Promise<void>; readonly rawArtifact?: GenerationArtifact; readonly resume: () => Promise<void>; readonly continueWithWarnings: () => Promise<void> }) {
  const { t } = useLocale();
  const failure = job.error!;
  const stalled = failure.kind === 'stall' || job.status === 'STALLED';
  const generated = job.artifacts.filter((item) => item.kind === 'generated');
  const validCount = generated.filter((item) => item.valid).length;
  const accent = stalled ? 'warning' : 'danger';
  return <section className={`rounded-2xl border border-[color-mix(in_srgb,var(--${accent})_38%,transparent)] bg-card/70 p-5`}>
    <div className="flex items-start gap-3">
      {stalled ? <Clock3 className="mt-0.5 h-5 w-5 text-[color:var(--warning)]" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-[color:var(--danger)]" />}
      <div>
        <h2 className="font-semibold">{stalled ? t('pipeline.failure.stalled') : t('pipeline.failure.needsAction')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{failure.message}</p>
        {failure.reason ? <p className="mt-1 text-xs text-muted-foreground"><strong>{t('pipeline.failure.reason')}</strong> {failure.reason}</p> : null}
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
      <Button variant="primary" loading={action === 'retry-normal'} onClick={() => void retry('normal')}><RefreshCcw className="h-4 w-4" /> {t('pipeline.failure.retryBackend')}</Button>
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
