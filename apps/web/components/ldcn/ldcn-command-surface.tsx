'use client';

import type { HTMLAttributes } from 'react';

import type { LdcnAction } from '@contracts/ldcn.contract';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

const ACTION_LABELS: Record<LdcnAction, string> = {
  explain_current_page: 'Explain current page',
  review_blueprint: 'Review blueprint',
  suggest_next_step: 'Suggest next step',
  inspect_gatekeeper: 'Inspect gatekeeper',
  prepare_generation: 'Prepare generation',
  open_command_palette: 'Open command palette',
};

const ACTION_DESCRIPTIONS: Record<LdcnAction, string> = {
  explain_current_page: 'Reserved for contextual explanation of the current surface.',
  review_blueprint: 'Reserved for blueprint analysis with no execution attached.',
  suggest_next_step: 'Reserved for future orchestration guidance.',
  inspect_gatekeeper: 'Reserved for Gatekeeper insight without mutation.',
  prepare_generation: 'Reserved for generation handoff state only.',
  open_command_palette: 'Reserved for command palette entry points.',
};

interface LDCNCommandSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  readonly actions?: readonly LdcnAction[];
}

export function LDCNCommandSurface({ className, actions, ...props }: LDCNCommandSurfaceProps) {
  const resolvedActions = actions ?? [
    'explain_current_page',
    'review_blueprint',
    'suggest_next_step',
    'inspect_gatekeeper',
    'prepare_generation',
    'open_command_palette',
  ];

  return (
    <Card className={cn('relative overflow-hidden p-4', className)} {...props}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,color-mix(in_srgb,var(--accent-2)_8%,transparent),transparent_28%)]" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">Command surface</p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--text)]">Reserved future actions</p>
          </div>
          <Badge className="border-white/10 text-[color:var(--muted)]">Reserved</Badge>
        </div>

        <div className="grid gap-2">
          {resolvedActions.map((action) => (
            <button
              key={action}
              type="button"
              disabled
              className="flex w-full items-start justify-between gap-4 rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] px-3 py-3 text-left opacity-90 transition-opacity disabled:cursor-not-allowed"
              aria-disabled="true"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[color:var(--text)]">{ACTION_LABELS[action]}</span>
                <span className="mt-1 block text-xs leading-5 text-[color:var(--muted)]">{ACTION_DESCRIPTIONS[action]}</span>
              </span>
              <Badge className="shrink-0 border-white/10 text-[color:var(--muted)]">future</Badge>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
