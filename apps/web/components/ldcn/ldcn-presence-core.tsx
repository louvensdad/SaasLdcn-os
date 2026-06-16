'use client';

import type { HTMLAttributes } from 'react';

import type { LdcnAction, LdcnContext } from '@contracts/ldcn.contract';

import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

import { LDCNAvatarSkeleton } from './ldcn-avatar-skeleton';
import { LDCNCommandSurface } from './ldcn-command-surface';
import { LDCNContextPanel } from './ldcn-context-panel';
import { LDCNOrb } from './ldcn-orb';

interface LDCNPresenceCoreProps extends HTMLAttributes<HTMLDivElement> {
  readonly context: LdcnContext;
  readonly actions?: readonly LdcnAction[];
}

export function LDCNPresenceCore({ className, context, actions, ...props }: LDCNPresenceCoreProps) {
  const { t } = useLocale();

  return (
    <Card className={cn('relative overflow-hidden p-4 md:p-5', className)} {...props}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_8%,transparent),transparent_32%)]" />
      <div className="relative grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4">
          <div className="flex items-start gap-3 md:gap-4">
            <LDCNOrb state={context.status} variant="ambient" className="h-10 w-10 shrink-0 md:h-12 md:w-12" />
            <div className="min-w-0 space-y-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('ldcn.presence.layer')}</p>
                <h3 className="mt-1 text-xl font-semibold text-[color:var(--text)] md:text-2xl">{t('ldcn.presence.reserve')}</h3>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                {t('ldcn.presence.description')}
              </p>
            </div>
          </div>

          <LDCNContextPanel context={context} compact />
        </div>

        <div className="grid gap-4 xl:pt-1">
          <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr] xl:grid-cols-1">
            <LDCNAvatarSkeleton className="md:justify-self-end" />
            <LDCNCommandSurface actions={actions} />
          </div>
          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('ldcn.presence.posture')}</p>
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
              {t('ldcn.presence.postureDetail')}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
