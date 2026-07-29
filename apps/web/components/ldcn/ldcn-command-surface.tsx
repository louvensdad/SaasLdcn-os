'use client';

import type { HTMLAttributes } from 'react';

import type { LdcnAction } from '@contracts/ldcn.contract';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

interface LDCNCommandSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  readonly actions?: readonly LdcnAction[];
}

export function LDCNCommandSurface({ className, actions, ...props }: LDCNCommandSurfaceProps) {
  const { t } = useLocale();
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
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('ldcn.command.title')}</p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--text)]">{t('ldcn.command.description')}</p>
          </div>
          <Badge className="border-white/10 text-[color:var(--muted)]">{t('ldcn.command.reserved')}</Badge>
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
                <span className="block text-sm font-semibold text-[color:var(--text)]">{t(`ldcn.command.action.${action}.label`)}</span>
                <span className="mt-1 block text-xs leading-5 text-[color:var(--muted)]">{t(`ldcn.command.action.${action}.description`)}</span>
              </span>
              <Badge className="shrink-0 border-white/10 text-[color:var(--muted)]">{t('ldcn.command.future')}</Badge>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
