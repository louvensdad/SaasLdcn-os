'use client';

import { useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { LlmConfirmationGate } from '@/components/llm/llm-confirmation-gate';
import { DeterministicBadge } from '@/components/llm/llm-gated-action';
import type { DeepEngineeringAnalysis, DeepEvent, DeepStage } from '@/lib/api/meta-factory';

interface DeepAnalysisPanelProps {
  /** Drives the SSE stream; receives the per-event callback. */
  readonly run: (onEvent: (event: DeepEvent) => void) => Promise<void>;
  /** Optional: start automatically on mount instead of via the button. */
  readonly autoStart?: boolean;
  readonly className?: string;
  /**
   * When set, the analysis is gated behind the LlmConfirmationGate: the user
   * must confirm which provider (or deterministic mode) to use before the
   * stream starts. Omit to keep the legacy ungated behavior.
   */
  readonly capability?: string;
  readonly usageLabel?: string;
}

/**
 * Shared "deep engineering thinking" surface. Streams the analysis stage-by-stage
 * with a deliberate pace so generation/modernization reads as real engineering.
 * Reused by the project room (spec-based) and Modernize (codebase-based).
 */
export function DeepAnalysisPanel({ run, autoStart = false, className, capability, usageLabel }: DeepAnalysisPanelProps) {
  const { t } = useLocale();
  const gated = Boolean(capability);
  const [stages, setStages] = useState<DeepStage[]>([]);
  const [thinking, setThinking] = useState<{ index: number; total: number; title: string } | null>(null);
  const [analysis, setAnalysis] = useState<DeepEngineeringAnalysis | null>(null);
  const [running, setRunning] = useState(false);
  // A gated panel must never auto-start: the user has to confirm the LLM first.
  const [started, setStarted] = useState(autoStart && !capability);
  const [gateOpen, setGateOpen] = useState(false);
  const [deterministic, setDeterministic] = useState(false);

  function requestStart() {
    if (gated) {
      setGateOpen(true);
      return;
    }
    void start();
  }

  async function start() {
    setRunning(true);
    setStarted(true);
    setStages([]);
    setAnalysis(null);
    try {
      await run((event) => {
        if (event.type === 'deep_stage_started') {
          setThinking({ index: event.index, total: event.total, title: event.title });
        } else if (event.type === 'deep_stage_completed') {
          setStages((prev) => [...prev, event.stage]);
        } else if (event.type === 'deep_analysis') {
          setAnalysis(event.analysis);
        }
      });
    } catch {
      // Streaming failure must never block the surrounding flow.
    } finally {
      setThinking(null);
      setRunning(false);
    }
  }

  if (autoStart && !gated && !started) {
    void start();
  }

  return (
    <section className={`rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm ${className ?? ''}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" />
          ) : (
            <BrainCircuit className="h-4 w-4 text-[color:var(--accent)]" />
          )}
          {t('deep.title')}
          {deterministic ? <DeterministicBadge /> : null}
        </h2>
        {thinking ? (
          <span className="tabular-nums text-xs text-muted-foreground">
            {t('deep.progress', { index: thinking.index, total: thinking.total })}
          </span>
        ) : !running && stages.length === 0 ? (
          <Button variant="soft" onClick={requestStart}>
            <BrainCircuit className="h-4 w-4" />
            {t('deep.start')}
          </Button>
        ) : null}
      </div>

      {gateOpen ? (
        <div className="mb-4">
          <LlmConfirmationGate
            capability={capability ?? 'deep_analysis'}
            usageLabel={usageLabel ?? t('deep.title')}
            compact
            onConfirmed={({ mode }) => {
              setGateOpen(false);
              setDeterministic(mode === 'deterministic');
              void start();
            }}
          />
        </div>
      ) : null}

      {thinking && (
        <p className="mb-3 text-sm text-[color:var(--accent)]">{t('deep.thinking', { title: thinking.title })}</p>
      )}

      {stages.length > 0 && (
        <ol className="flex flex-col gap-3">
          {stages.map((stage) => (
            <li key={stage.id} className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="flex items-center gap-2">
                {stage.status === 'attention' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                )}
                <span className="text-sm font-medium">{stage.title}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{stage.summary}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {stage.details.map((detail, i) => (
                  <li key={i} className="text-xs leading-5 text-muted-foreground">· {detail}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {analysis && !thinking && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1">
            {t('deep.complexity', { value: analysis.complexity })}
          </span>
          <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1">
            {t('deep.risk', { value: analysis.risk_level })}
          </span>
          <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1">
            {t('deep.effort', { value: analysis.effort_estimate })}
          </span>
          <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1 tabular-nums">
            {t('deep.components', { value: analysis.component_count })}
          </span>
        </div>
      )}
    </section>
  );
}
