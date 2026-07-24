import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CircleDashed, Clock, Copy, Loader2, RefreshCw, XCircle,
} from 'lucide-react';

import { LlmConfirmationGate } from '@/components/llm/llm-confirmation-gate';
import { useMissionStore } from '../stores/missionStore';
import type { DeliverableJobDto, DeliverableJobEventDto } from '../api/client';

// ---------------------------------------------------------------- helpers
// Every value rendered by this component is derived from real backend state
// (job.status, job.artifactsProgress[].startedAt/finishedAt/provider/model/
// tokens, job.events[].timestamp, job.createdAt/completedAt) -- nothing here
// is a setTimeout-simulated stage or an invented percentage.

function parseTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatRelative(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 2) return 'agora mesmo';
  if (seconds < 60) return `há ${seconds} segundos`;
  const minutes = Math.round(seconds / 60);
  return `há ${minutes} minuto${minutes > 1 ? 's' : ''}`;
}

function formatBytes(chars: number): string {
  if (chars < 1024) return `${chars} caract.`;
  return `${(chars / 1024).toFixed(1)} KB`;
}

type RealPhase = 'QUEUED' | 'ANSWERS_LOADING' | 'DRAFTING' | 'DRAFTS_READY' | 'PERSISTING' | 'COMPLETED';
const PHASE_ORDER: readonly RealPhase[] = ['QUEUED', 'ANSWERS_LOADING', 'DRAFTING', 'DRAFTS_READY', 'PERSISTING', 'COMPLETED'];
const PHASE_LABEL: Record<RealPhase, string> = {
  QUEUED: 'Iniciando processo', ANSWERS_LOADING: 'Carregando respostas', DRAFTING: 'Gerando artefatos',
  DRAFTS_READY: 'Aguardando sua revisão', PERSISTING: 'Salvando artefatos', COMPLETED: 'Finalizando entregáveis',
};
const PHASE_WEIGHT: Record<RealPhase, number> = { QUEUED: 5, ANSWERS_LOADING: 5, DRAFTING: 70, DRAFTS_READY: 0, PERSISTING: 15, COMPLETED: 5 };

type StageStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';

/** FAILED/CANCELLED aren't real phases of their own -- they interrupt one of
 * the six real phases above. Derived from the only real signals available
 * (which artifact failed, which error kind), never guessed at random. */
function currentRealPhase(job: DeliverableJobDto): RealPhase {
  if (job.status === 'FAILED' || job.status === 'CANCELLED') {
    if (job.artifactsProgress.some((item) => item.status === 'failed')) return 'DRAFTING';
    if (job.error?.kind === 'confirm_failed') return 'PERSISTING';
    return 'ANSWERS_LOADING';
  }
  return job.status as RealPhase;
}

function stageStatus(job: DeliverableJobDto, phase: RealPhase): StageStatus {
  const current = currentRealPhase(job);
  const idx = PHASE_ORDER.indexOf(phase);
  const currentIdx = PHASE_ORDER.indexOf(current);
  if (idx < currentIdx) return 'completed';
  if (idx > currentIdx) return 'waiting';
  if (job.status === 'CANCELLED') return 'cancelled';
  if (job.status === 'FAILED') return 'failed';
  if (job.status === 'COMPLETED') return 'completed';
  if (phase === 'DRAFTS_READY') return 'blocked';
  return 'running';
}

function findEvent(events: readonly DeliverableJobEventDto[], type: string, fromEnd = false): DeliverableJobEventDto | undefined {
  if (fromEnd) { for (let i = events.length - 1; i >= 0; i -= 1) if (events[i].type === type) return events[i]; return undefined; }
  return events.find((item) => item.type === type);
}

interface StageTiming { readonly startedAt: number | null; readonly finishedAt: number | null; }

function stageTiming(job: DeliverableJobDto, events: readonly DeliverableJobEventDto[], phase: RealPhase): StageTiming {
  const failedAt = parseTs(findEvent(events, 'job_failed', true)?.timestamp) ?? parseTs(findEvent(events, 'job_cancelled', true)?.timestamp);
  switch (phase) {
    case 'QUEUED':
      return { startedAt: parseTs(job.createdAt), finishedAt: parseTs(findEvent(events, 'answers_loading')?.timestamp) ?? failedAt };
    case 'ANSWERS_LOADING':
      return { startedAt: parseTs(findEvent(events, 'answers_loading')?.timestamp), finishedAt: parseTs(findEvent(events, 'drafting_started')?.timestamp) ?? failedAt };
    case 'DRAFTING':
      return { startedAt: parseTs(findEvent(events, 'drafting_started')?.timestamp), finishedAt: parseTs(findEvent(events, 'drafts_ready')?.timestamp) ?? failedAt };
    case 'DRAFTS_READY':
      return { startedAt: parseTs(findEvent(events, 'drafts_ready')?.timestamp), finishedAt: parseTs(findEvent(events, 'persisting_started', true)?.timestamp) };
    case 'PERSISTING':
      return { startedAt: parseTs(findEvent(events, 'persisting_started', true)?.timestamp), finishedAt: parseTs(findEvent(events, 'persisted', true)?.timestamp) ?? failedAt };
    case 'COMPLETED': {
      const at = parseTs(job.completedAt);
      return { startedAt: at, finishedAt: at };
    }
    default:
      return { startedAt: null, finishedAt: null };
  }
}

function phaseMessage(job: DeliverableJobDto, phase: RealPhase, answersCount: number): string {
  switch (phase) {
    case 'QUEUED': return 'Job de entregáveis criado e enfileirado.';
    case 'ANSWERS_LOADING': return answersCount > 0 ? `${answersCount} resposta(s) recuperada(s).` : 'Recuperando as respostas registradas na missão.';
    case 'DRAFTING': {
      const ready = job.artifactsProgress.filter((item) => item.status === 'ready').length;
      return `${ready} de ${job.artifactsProgress.length} artefato(s) gerado(s).`;
    }
    case 'DRAFTS_READY': return 'Revise (e edite se quiser) os artefatos antes de aceitar.';
    case 'PERSISTING': return 'Salvando os artefatos confirmados na missão.';
    case 'COMPLETED': return 'Entregáveis salvos com sucesso.';
    default: return '';
  }
}

function computeProgressPercent(job: DeliverableJobDto): number {
  if (job.status === 'COMPLETED') return 100;
  const phase = currentRealPhase(job);
  const idx = PHASE_ORDER.indexOf(phase);
  let percent = 0;
  for (let i = 0; i < idx; i += 1) percent += PHASE_WEIGHT[PHASE_ORDER[i]];
  if (phase === 'DRAFTING') {
    const total = job.artifactsProgress.length || 1;
    const ready = job.artifactsProgress.filter((item) => item.status === 'ready').length;
    percent += (ready / total) * PHASE_WEIGHT.DRAFTING;
  } else if (idx > PHASE_ORDER.indexOf('DRAFTING')) {
    percent += PHASE_WEIGHT.DRAFTING;
  }
  return Math.round(Math.min(99, percent));
}

const STAGE_ICON: Record<StageStatus, ReactNode> = {
  waiting: <CircleDashed className="h-4 w-4 text-[color:var(--muted)]" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" />,
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  failed: <XCircle className="h-4 w-4 text-red-400" />,
  blocked: <AlertTriangle className="h-4 w-4 text-amber-300" />,
  cancelled: <XCircle className="h-4 w-4 text-[color:var(--muted)]" />,
};
const ARTIFACT_ICON: Record<string, ReactNode> = {
  pending: <CircleDashed className="h-3.5 w-3.5 text-[color:var(--muted)]" />,
  drafting: <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--accent)]" />,
  ready: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-400" />,
};

function useTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ---------------------------------------------------------------- component

export function DeliverableJobTimeline() {
  const {
    activeMission, deliverableJob, deliverableJobEvents,
    retryDeliverableJob, cancelDeliverableJob, dismissDeliverableJob, refreshDeliverableJob,
  } = useMissionStore();
  const [showRetryGate, setShowRetryGate] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [checking, setChecking] = useState(false);
  const now = useTick(1000);

  if (!deliverableJob) {
    return (
      <div className="mt-8 flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-white/5 p-4 text-sm text-[color:var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparando entregáveis…
      </div>
    );
  }

  const job = deliverableJob;
  const answersCount = Object.keys(activeMission?.context.answers ?? {}).length;
  const currentPhase = currentRealPhase(job);
  const percent = computeProgressPercent(job);
  const createdAtMs = parseTs(job.createdAt) ?? now;
  const endedAtMs = parseTs(job.completedAt) ?? now;
  const totalElapsedMs = endedAtMs - createdAtMs;
  const currentTiming = stageTiming(job, deliverableJobEvents, currentPhase);
  const currentStageElapsedMs = currentTiming.startedAt ? (currentTiming.finishedAt ?? now) - currentTiming.startedAt : 0;
  const lastEventTs = parseTs(deliverableJobEvents.at(-1)?.timestamp) ?? parseTs(job.updatedAt) ?? now;
  const sinceLastEventMs = now - lastEventTs;
  const isRunningPhase = currentPhase === 'ANSWERS_LOADING' || currentPhase === 'DRAFTING' || currentPhase === 'PERSISTING';
  const isStalled = isRunningPhase && sinceLastEventMs > 45_000;
  const isSlow = isRunningPhase && sinceLastEventMs > 15_000 && !isStalled;

  const draftingArtifact = job.artifactsProgress.find((item) => item.status === 'drafting');
  const lastReadyArtifact = [...job.artifactsProgress].reverse().find((item) => item.status === 'ready' && item.finishedAt);
  const nextPendingArtifact = job.artifactsProgress.find((item) => item.status === 'pending');
  const nextStepLabel = draftingArtifact
    ? `Aguardando conclusão de "${draftingArtifact.title}"`
    : nextPendingArtifact
      ? `Gerar "${nextPendingArtifact.title}"`
      : currentPhase === 'DRAFTING' ? PHASE_LABEL.DRAFTS_READY
        : currentPhase === 'DRAFTS_READY' ? 'Aguardando sua confirmação'
          : currentPhase === 'PERSISTING' ? PHASE_LABEL.COMPLETED
            : '—';

  async function verifyState() {
    setChecking(true);
    try { await refreshDeliverableJob(); } finally { setChecking(false); }
  }

  return (
    <div className="mt-8 space-y-5 rounded-xl border border-[color:var(--border)] bg-white/5 p-5">
      {job.status === 'COMPLETED' ? (
        <CompletionSummary job={job} totalElapsedMs={totalElapsedMs} onClose={dismissDeliverableJob} />
      ) : (
        <>
          {/* -------------------------------------------------- header */}
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--text)]">Preparando os entregáveis</h3>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-2xl font-semibold text-[color:var(--text)]">{percent}%</span>
              <span className="text-xs text-[color:var(--muted)]">concluído</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
              <div><dt className="text-[color:var(--muted)]">Tempo total</dt><dd className="font-medium text-[color:var(--text)]">{formatClock(totalElapsedMs)}</dd></div>
              <div><dt className="text-[color:var(--muted)]">Etapa atual</dt><dd className="font-medium text-[color:var(--text)]">{PHASE_LABEL[currentPhase]}</dd></div>
              <div><dt className="text-[color:var(--muted)]">Etapa em execução</dt><dd className="font-medium text-[color:var(--text)]">{formatClock(currentStageElapsedMs)}</dd></div>
              <div><dt className="text-[color:var(--muted)]">Última atualização</dt><dd className="font-medium text-[color:var(--text)]">{formatRelative(now - lastEventTs)}</dd></div>
            </dl>
          </div>

          {isStalled ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              <span>Não recebemos uma atualização recente. Verificando o estado da execução.</span>
              <button onClick={() => void verifyState()} disabled={checking} className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 px-2 py-1 font-medium">
                <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} /> Verificar estado
              </button>
            </div>
          ) : isSlow ? (
            <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">Esta etapa está levando mais tempo que o normal.</p>
          ) : null}

          {/* -------------------------------------------------- timeline */}
          <ol className="space-y-1">
            {PHASE_ORDER.map((phase) => {
              const status = stageStatus(job, phase);
              const timing = stageTiming(job, deliverableJobEvents, phase);
              const duration = timing.startedAt ? (timing.finishedAt ?? now) - timing.startedAt : null;
              return (
                <li key={phase}>
                  <div className="flex items-start gap-2.5 py-1.5">
                    <span className="mt-0.5 shrink-0">{STAGE_ICON[status]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className={`text-sm ${status === 'waiting' ? 'text-[color:var(--muted)]' : 'text-[color:var(--text)]'}`}>{PHASE_LABEL[phase]}</span>
                        <code className="text-[10px] text-[color:var(--muted)]/70">{phase}</code>
                        {status === 'running' ? <span className="text-xs text-[color:var(--accent)]">Executando há {formatDuration(duration ?? 0)}</span> : null}
                        {status === 'blocked' ? <span className="text-xs text-amber-300">Aguardando sua ação</span> : null}
                        {status === 'completed' && duration !== null ? <span className="text-xs text-[color:var(--muted)]">Concluída em {formatDuration(duration)}</span> : null}
                        {status === 'failed' && duration !== null ? <span className="text-xs text-red-300">Falhou após {formatDuration(duration)}</span> : null}
                      </div>
                      <p className="text-xs text-[color:var(--muted)]">{status === 'waiting' ? 'Aguardando etapa anterior' : phaseMessage(job, phase, answersCount)}</p>
                      {phase === 'DRAFTING' && (status === 'running' || status === 'completed' || status === 'failed') ? (
                        <ul className="mt-1.5 space-y-1 border-l border-[color:var(--border)] pl-3">
                          {job.artifactsProgress.map((item) => {
                            const start = parseTs(item.startedAt);
                            const end = parseTs(item.finishedAt);
                            const artDuration = start ? (end ?? now) - start : null;
                            return (
                              <li key={item.type} className="flex items-center gap-2 text-xs">
                                {ARTIFACT_ICON[item.status]}
                                <span className={item.status === 'failed' ? 'text-red-300' : 'text-[color:var(--text)]'}>{item.title}</span>
                                {item.status === 'drafting' && start ? <span className="text-[color:var(--muted)]">executando há {formatDuration(now - start)}</span> : null}
                                {item.status === 'ready' && artDuration !== null ? <span className="text-[color:var(--muted)]">{formatDuration(artDuration)} · {item.provider ?? '—'}/{item.model ?? '—'}</span> : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* -------------------------------------------------- atividade atual */}
          <div className="rounded-lg border border-[color:var(--border)] bg-black/10 p-3">
            <h4 className="ds-caption mb-2 text-[color:var(--muted)]">Atividade atual</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div><dt className="text-[color:var(--muted)]">Arquivo atual</dt><dd className="text-[color:var(--text)]">{draftingArtifact?.title ?? '—'}</dd></div>
              <div><dt className="text-[color:var(--muted)]">Modelo solicitado</dt><dd className="text-[color:var(--text)]">{job.requestedModel ?? '—'}</dd></div>
              <div><dt className="text-[color:var(--muted)]">Último resultado</dt><dd className="text-[color:var(--text)]">{lastReadyArtifact ? `${lastReadyArtifact.provider} · ${lastReadyArtifact.model} · ${lastReadyArtifact.inputTokens + lastReadyArtifact.outputTokens} tokens` : '—'}</dd></div>
              <div><dt className="text-[color:var(--muted)]">Próximo passo</dt><dd className="text-[color:var(--text)]">{nextStepLabel}</dd></div>
              {job.retryCount > 0 ? <div><dt className="text-[color:var(--muted)]">Tentativa</dt><dd className="text-[color:var(--text)]">{job.retryCount + 1}</dd></div> : null}
              <div><dt className="text-[color:var(--muted)]">Heartbeat</dt><dd className="flex items-center gap-1 text-[color:var(--text)]"><Clock className="h-3 w-3" />{formatRelative(now - lastEventTs)}</dd></div>
            </dl>
          </div>

          {/* -------------------------------------------------- artefatos */}
          <div>
            <h4 className="ds-caption mb-2 text-[color:var(--muted)]">Artefatos</h4>
            <ul className="space-y-1">
              {job.artifactsProgress.map((item) => {
                const draft = job.drafts.find((d) => d.type === item.type);
                return (
                  <li key={item.type} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2">{ARTIFACT_ICON[item.status]}<span className="text-[color:var(--text)]">{item.title}</span></span>
                    <span className="text-[color:var(--muted)]">
                      {draft ? formatBytes(draft.content.length) : '—'}
                      {draft?.degraded ? ' · degradado' : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* -------------------------------------------------- detalhes técnicos */}
          <button onClick={() => setShowDetails((value) => !value)} className="flex items-center gap-1 text-xs text-[color:var(--muted)] hover:text-[color:var(--text)]">
            {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Detalhes técnicos
          </button>
          {showDetails ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-black/20 p-3 font-mono text-[11px] text-[color:var(--muted)]">
              {deliverableJobEvents.length === 0 ? <li>Nenhum evento recebido ainda.</li> : deliverableJobEvents.map((event) => (
                <li key={event.id}>[{event.timestamp}] {event.type} — {event.message}</li>
              ))}
            </ul>
          ) : null}

          {/* -------------------------------------------------- erro */}
          {job.status === 'FAILED' && job.error ? (
            <FailureSummary
              job={job} events={deliverableJobEvents} currentTiming={currentTiming} createdAtMs={createdAtMs}
              showRetryGate={showRetryGate} onOpenRetryGate={() => setShowRetryGate(true)}
              onRetry={async (auth) => { setShowRetryGate(false); await retryDeliverableJob(auth); }}
            />
          ) : null}

          {isRunningPhase ? (
            <button onClick={() => void cancelDeliverableJob()} className="text-xs text-[color:var(--muted)] underline decoration-dotted hover:text-[color:var(--text)]">
              Cancelar (cancelando ao final do artefato atual…)
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function FailureSummary({
  job, events, currentTiming, createdAtMs, showRetryGate, onOpenRetryGate, onRetry,
}: {
  job: DeliverableJobDto;
  events: readonly DeliverableJobEventDto[];
  currentTiming: StageTiming;
  createdAtMs: number;
  showRetryGate: boolean;
  onOpenRetryGate: () => void;
  onRetry: (auth: { useUserKey: true; userModelChoice: string; hasValidatedUserKey: true }) => Promise<void>;
}) {
  const failedAt = currentTiming.finishedAt ?? parseTs(job.completedAt) ?? Date.now();
  const timeToFailureMs = failedAt - createdAtMs;
  const lastCompletedArtifact = [...job.artifactsProgress].reverse().find((item) => item.status === 'ready');
  const checkpoint = lastCompletedArtifact ? `Último artefato salvo: "${lastCompletedArtifact.title}"` : 'Nenhum artefato foi concluído antes da falha';
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
      <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Falha ao gerar entregáveis</div>
      <p className="mt-1 text-xs">{job.error?.message}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-red-100/80">
        <div><dt className="text-red-200/60">Tempo até a falha</dt><dd>{formatDuration(Math.max(0, timeToFailureMs))}</dd></div>
        <div><dt className="text-red-200/60">Artefatos preservados</dt><dd>{job.drafts.length}</dd></div>
      </dl>
      <p className="mt-1 text-xs text-red-100/80">{checkpoint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {showRetryGate ? (
          <LlmConfirmationGate capability="mission_report" usageLabel="Tentar novamente" compact onConfirmed={async ({ mode, model }) => { if (mode !== 'llm' || !model) return; await onRetry({ useUserKey: true, userModelChoice: model, hasValidatedUserKey: true }); }} />
        ) : (
          <button onClick={onOpenRetryGate} className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-medium text-red-100">Tentar novamente</button>
        )}
        <button
          onClick={() => { void navigator.clipboard.writeText(JSON.stringify({ error: job.error, events }, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="inline-flex items-center gap-1 rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-100/80"
        >
          <Copy className="h-3.5 w-3.5" /> {copied ? 'Copiado' : 'Copiar erro'}
        </button>
      </div>
    </div>
  );
}

function CompletionSummary({ job, totalElapsedMs, onClose }: { job: DeliverableJobDto; totalElapsedMs: number; onClose: () => void }) {
  const stagesCompleted = PHASE_ORDER.length;
  const inferencesApplied = job.drafts.filter((draft) => draft.content.includes('## Complementado pela IA')).length;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[color:var(--text)]">Entregáveis concluídos</h3>
      <p className="text-xs text-[color:var(--muted)]">Concluído em {formatDuration(totalElapsedMs)}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <div><dt className="text-[color:var(--muted)]">Etapas concluídas</dt><dd className="text-[color:var(--text)]">{stagesCompleted}</dd></div>
        <div><dt className="text-[color:var(--muted)]">Artefatos criados</dt><dd className="text-[color:var(--text)]">{job.drafts.length}</dd></div>
        <div><dt className="text-[color:var(--muted)]">Inferências técnicas aplicadas</dt><dd className="text-[color:var(--text)]">{inferencesApplied}</dd></div>
      </dl>
      <button onClick={onClose} className="rounded-lg border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium text-[color:var(--text)]">Fechar</button>
    </div>
  );
}
