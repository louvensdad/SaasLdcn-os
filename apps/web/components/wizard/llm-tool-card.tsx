'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, Play, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonLoading } from '@/components/feedback/loading-system';
import { cn } from '@/lib/cn';

export type LlmToolState = 'idle' | 'loading' | 'empty' | 'success' | 'warning' | 'error';

interface LlmToolCardProps {
  readonly title: string;
  readonly description: string;
  readonly prerequisites: readonly string[];
  readonly state: LlmToolState;
  readonly stateLabel: string;
  readonly actionLabel: string;
  readonly loadingLabel: string;
  readonly onAction: () => void;
  readonly disabled?: boolean;
  readonly result?: ReactNode;
  readonly error?: string | null;
  readonly className?: string;
}

const stateIcon = {
  idle: CircleDashed,
  loading: Loader2,
  empty: CircleDashed,
  success: CheckCircle2,
  warning: ShieldAlert,
  error: AlertTriangle,
} satisfies Record<LlmToolState, typeof CircleDashed>;

const stateTone: Record<LlmToolState, string> = {
  idle: 'border-white/10 text-[color:var(--muted)]',
  loading: 'border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] text-[color:var(--accent)]',
  empty: 'border-dashed border-white/10 text-[color:var(--muted)]',
  success: 'border-[color-mix(in_srgb,var(--success)_34%,var(--border))] text-[color:var(--success)]',
  warning: 'border-[color-mix(in_srgb,var(--warning)_34%,var(--border))] text-[color:var(--warning)]',
  error: 'border-[color-mix(in_srgb,var(--danger)_34%,var(--border))] text-[color:var(--danger)]',
};

export function LlmToolCard({
  title,
  description,
  prerequisites,
  state,
  stateLabel,
  actionLabel,
  loadingLabel,
  onAction,
  disabled = false,
  result,
  error,
  className,
}: LlmToolCardProps) {
  const Icon = stateIcon[state];

  return (
    <article
      className={cn(
        'flex min-h-[17rem] flex-col rounded-[var(--radius-xl)] border bg-white/[0.035] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)]',
        stateTone[state],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="ds-caption text-[color:var(--muted)]">{stateLabel}</p>
          <h3 className="mt-2 text-lg font-semibold text-[color:var(--text)]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{description}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-current/30 bg-white/5">
          <Icon className={cn('h-5 w-5', state === 'loading' ? 'animate-spin' : null)} aria-hidden />
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {prerequisites.map((item) => (
          <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
            {item}
          </Badge>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--danger)_34%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3 text-sm leading-6 text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}

      {result ? <div className="mt-4 text-sm leading-6 text-[color:var(--muted)]">{result}</div> : null}

      <div className="mt-auto pt-5">
        <Button type="button" variant={state === 'success' ? 'secondary' : 'primary'} onClick={onAction} disabled={disabled || state === 'loading'} className="w-full justify-center">
          {state === 'loading' ? (
            <ButtonLoading label={loadingLabel} />
          ) : (
            <>
              <Play className="h-4 w-4" aria-hidden />
              {actionLabel}
            </>
          )}
        </Button>
      </div>
    </article>
  );
}
