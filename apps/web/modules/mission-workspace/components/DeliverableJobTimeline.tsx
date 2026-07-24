import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';

import { LlmConfirmationGate } from '@/components/llm/llm-confirmation-gate';
import { useMissionStore } from '../stores/missionStore';

function useTick(intervalMs: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

const STATUS_ICON: Record<string, ReactNode> = {
  pending: <CircleDashed className="h-4 w-4 text-[color:var(--muted)]" />,
  drafting: <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" />,
  ready: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  failed: <XCircle className="h-4 w-4 text-red-400" />,
};

const RUNNING_PHASES = new Set(['VALIDATING', 'QUEUED', 'ANSWERS_LOADING', 'DRAFTING']);

/** Replaces the bare disabled button while a deliverables job runs. Every
 * value shown here comes from the real job/event state in missionStore --
 * timeline rows from `artifactsProgress`, elapsed time from `createdAt`,
 * staleness messages from the last real SSE event's timestamp. Nothing here
 * is a setTimeout-simulated stage. */
export function DeliverableJobTimeline() {
  const { deliverableJob, deliverableJobPhase, deliverableJobEvents, retryDeliverableJob, cancelDeliverableJob } = useMissionStore();
  const [showRetryGate, setShowRetryGate] = useState(false);
  useTick(1000);

  if (!deliverableJob) {
    return (
      <div className="mt-8 flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-white/5 p-4 text-sm text-[color:var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparando entregáveis…
      </div>
    );
  }

  const elapsedMs = Date.now() - new Date(deliverableJob.createdAt).getTime();
  const lastEventAt = deliverableJobEvents.at(-1)?.timestamp ?? deliverableJob.updatedAt;
  const sinceLastEventMs = Date.now() - new Date(lastEventAt).getTime();
  const isRunning = RUNNING_PHASES.has(deliverableJobPhase);

  return (
    <div className="mt-8 space-y-4 rounded-xl border border-[color:var(--border)] bg-white/5 p-5">
      <div>
        <h3 className="text-sm font-semibold text-[color:var(--text)]">Preparando os entregáveis do projeto</h3>
        <p className="mt-1 text-xs text-[color:var(--muted)]">Estamos reunindo e estruturando suas respostas.</p>
      </div>

      <ul className="space-y-2">
        {deliverableJob.artifactsProgress.map((item) => (
          <li key={item.type} className="flex items-center gap-2 text-sm">
            {STATUS_ICON[item.status]}
            <span className={item.status === 'failed' ? 'text-red-300' : 'text-[color:var(--text)]'}>{item.title}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted)]">
        <span>Tempo decorrido: {formatElapsed(elapsedMs)}</span>
        {isRunning && sinceLastEventMs > 45_000 ? (
          <span className="text-amber-300">Não recebemos atualização recente. Estamos verificando o estado da execução.</span>
        ) : isRunning && sinceLastEventMs > 15_000 ? (
          <span className="text-amber-300">Esta etapa está levando mais tempo que o normal, mas continua em execução.</span>
        ) : null}
      </div>

      {deliverableJobPhase === 'FAILED' && deliverableJob.error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Falha ao gerar entregáveis</div>
          <p className="mt-1 text-xs">{deliverableJob.error.message}</p>
          {showRetryGate ? (
            <div className="mt-3">
              <LlmConfirmationGate
                capability="mission_report" usageLabel="Tentar novamente" compact
                onConfirmed={async ({ mode, model }) => {
                  if (mode !== 'llm' || !model) return;
                  setShowRetryGate(false);
                  await retryDeliverableJob({ useUserKey: true, userModelChoice: model, hasValidatedUserKey: true });
                }}
              />
            </div>
          ) : (
            <button onClick={() => setShowRetryGate(true)} className="mt-3 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-medium text-red-100">
              Tentar novamente
            </button>
          )}
        </div>
      ) : null}

      {isRunning ? (
        <button onClick={() => void cancelDeliverableJob()} className="text-xs text-[color:var(--muted)] underline decoration-dotted hover:text-[color:var(--text)]">
          Cancelar (cancelando ao final do artefato atual…)
        </button>
      ) : null}
    </div>
  );
}
