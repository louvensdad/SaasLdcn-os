'use client';

import { useState, type ReactNode } from 'react';
import { Bot, Cpu } from 'lucide-react';

import { useActiveLlm } from '@/hooks/use-active-llm';

import { Badge } from '@/components/ui/badge';
import { LlmConfirmationGate } from '@/components/llm/llm-confirmation-gate';

export interface LlmSelection {
  readonly mode: 'llm' | 'deterministic';
  readonly model: string | null;
}

interface LlmGatedActionProps {
  /** Canonical capability id (resolver/audit). */
  readonly capability: string;
  /** Human-readable action description shown in the gate. */
  readonly usageLabel: string;
  /** Runs once the user confirms a mode in the gate. */
  readonly onRun: (selection: LlmSelection) => void | Promise<void>;
  /** Trigger renderer — receives `open` to reveal the gate. */
  readonly children: (open: () => void, isOpen: boolean) => ReactNode;
  readonly compact?: boolean;
  readonly className?: string;
}

/**
 * The single adoption pattern for gating an AI action. Encapsulates the
 * open/close state and the gate render so every module wires AI actions
 * identically — no parallel state, no hardcoded providers, no localStorage.
 *
 *   <LlmGatedAction capability="documentation_generation" usageLabel="Gerar documentação" onRun={run}>
 *     {(open) => <Button onClick={open}>Gerar documentação</Button>}
 *   </LlmGatedAction>
 */
export function LlmGatedAction({ capability, usageLabel, onRun, children, compact, className }: LlmGatedActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      {children(() => setOpen(true), open)}
      {open ? (
        <div className="mt-3">
          <LlmConfirmationGate
            capability={capability}
            usageLabel={usageLabel}
            compact={compact}
            onConfirmed={async (selection) => {
              setOpen(false);
              await onRun(selection);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Standard marker that a result came from the degraded, no-AI deterministic
 * path. Use everywhere a deterministic fallback produced visible output so it is
 * never mistaken for a real-AI result.
 */
export function DeterministicBadge({ className }: { readonly className?: string }) {
  return (
    <Badge tone="warning" className={className}>
      <Cpu className="h-3.5 w-3.5" aria-hidden />
      Preview determinístico
    </Badge>
  );
}

/**
 * Compact, read-only indicator of the active global provider. Use in headers
 * (Meta-Factory agents, Laboratory) so every AI surface shows which LLM is in
 * effect — sourced from the single `useActiveLlm()` store, never hardcoded.
 */
export function LlmProviderInline({ className }: { readonly className?: string }) {
  const llm = useActiveLlm();
  if (llm.isLoading) return null;
  const tone = llm.isReady ? 'success' : llm.isFailed ? 'warning' : 'neutral';
  const label = llm.isReady
    ? `${llm.providerLabel}${llm.model ? ` · ${llm.model}` : ''}`
    : llm.isFailed
      ? `${llm.providerLabel ?? 'LLM'} indisponível`
      : 'Modo determinístico';
  return (
    <Badge tone={tone} className={className}>
      <Bot className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Badge>
  );
}
