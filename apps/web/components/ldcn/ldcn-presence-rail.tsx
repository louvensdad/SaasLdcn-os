'use client';

import type { HTMLAttributes } from 'react';

import type { LdcnAction, LdcnContext } from '@contracts/ldcn.contract';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

import { LDCNCommandSurface } from './ldcn-command-surface';
import { LDCNOrb } from './ldcn-orb';
import { LDCNStatusPill } from './ldcn-status-pill';

interface LDCNPresenceRailProps extends HTMLAttributes<HTMLDivElement> {
  readonly context: LdcnContext;
  readonly stepLabel: string;
  readonly actions?: readonly LdcnAction[];
}

export function LDCNPresenceRail({ className, context, stepLabel, actions, ...props }: LDCNPresenceRailProps) {
  const { t } = useLocale();

  return (
    <Card surface="tertiary" className={cn('relative min-w-0 p-4', className)} {...props}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_6%,transparent),transparent_34%)]" />
      <div className="relative space-y-3">
        <div className="flex items-start gap-3">
          <LDCNOrb state={context.status} variant="ambient" className="h-8 w-8 shrink-0 md:h-9 md:w-9" />
          <div className="min-w-0">
            <p className="type-label text-[color:var(--muted)]">{t('ldcn.context')}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--text)]">{context.current_phase}</p>
            <p className="type-caption mt-1 text-[color:var(--muted)]">{stepLabel}</p>
          </div>
        </div>

        <LDCNStatusPill state={context.status} className="w-fit" />

        <details className="advanced-disclosure rounded-[var(--radius-md)] border border-[color:var(--border)] bg-black/10">
          <summary className="focus-ring flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2">
            <span className="type-label text-[color:var(--muted)]">{t('ldcn.contextDetails')}</span>
            <span aria-hidden="true" className="text-[color:var(--muted)]">+</span>
          </summary>
          <div className="grid gap-2 p-3">
          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-3">
            <p className="type-label text-[color:var(--muted)]">{t('ldcn.route')}</p>
            <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{context.route}</p>
          </div>
          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-3">
            <p className="type-label text-[color:var(--muted)]">{t('ldcn.pipeline')}</p>
            <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{context.pipeline.readiness_label}</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{context.pipeline.status}</p>
          </div>
          </div>

        {actions?.length ? (
          <div className="space-y-2">
            <p className="type-label text-[color:var(--muted)]">{t('ldcn.reservedFutureActions')}</p>
            <div className="grid gap-2">
              {actions.map((action) => (
                <Badge key={action} className="justify-start border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
                  {action.replaceAll('_', ' ')}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <LDCNCommandSurface actions={actions?.length ? actions : ['open_command_palette', 'review_blueprint']} className="p-3" />
        </details>
      </div>
    </Card>
  );
}
