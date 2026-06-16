'use client';

import type { HTMLAttributes } from 'react';

import type { LdcnPresenceState } from '@contracts/ldcn.contract';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { useLocale } from '@/hooks/use-locale';

const STATE_LABELS: Record<LdcnPresenceState, string> = {
  idle: 'idle',
  observing: 'observing',
  thinking: 'thinking',
  speaking_future: 'speaking future',
  warning: 'warning',
  blocked: 'blocked',
  offline: 'offline',
};

const STATE_CLASSES: Record<LdcnPresenceState, string> = {
  idle: 'border-white/10 text-[color:var(--muted)]',
  observing: 'border-[color-mix(in_srgb,var(--accent)_28%,transparent)] text-[color:var(--text)]',
  thinking: 'border-[color-mix(in_srgb,var(--accent-2)_28%,transparent)] text-[color:var(--text)]',
  speaking_future: 'border-[color-mix(in_srgb,var(--accent)_24%,transparent)] text-[color:var(--accent)]',
  warning: 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[color:var(--warning)]',
  blocked: 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[color:var(--danger)]',
  offline: 'border-[color-mix(in_srgb,var(--danger)_28%,transparent)] text-[color:var(--danger)]',
};

interface LDCNStatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  readonly state?: LdcnPresenceState;
  readonly label?: string;
}

export function LDCNStatusPill({ className, state = 'observing', label = 'LDCN', ...props }: LDCNStatusPillProps) {
  const { t } = useLocale();
  const translatedLabel = label === 'LDCN' ? t(`ldcn.${state}`) : `${label} ${STATE_LABELS[state]}`;
  return (
    <Badge
      className={cn('gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em]', STATE_CLASSES[state], className)}
      aria-label={translatedLabel}
      {...props}
    >
      <span className={cn('status-dot shrink-0', state === 'warning' || state === 'blocked' || state === 'offline' ? 'bg-[color:var(--danger)]' : state === 'thinking' ? 'bg-[color:var(--accent-2)]' : 'bg-[color:var(--accent)]')} />
      <span className="whitespace-nowrap">
        {translatedLabel}
      </span>
    </Badge>
  );
}
