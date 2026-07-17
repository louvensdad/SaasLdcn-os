'use client';

import { Badge } from '@/components/ui/badge';
import { useSystemPresence } from '@/hooks/use-system-presence';
import { cn } from '@/lib/cn';
import type { PresenceStatus } from '@contracts/system-presence.contract';

const LABELS: Record<PresenceStatus, string> = {
  HEALTHY: 'Operacional',
  PROCESSING: 'Processando',
  WARNING: 'Atenção',
  BLOCKED: 'Bloqueado',
  FAILED: 'Falha',
  DEGRADED: 'Degradado',
  UNKNOWN: 'Indisponível',
};

const TONE_CLASSES: Record<PresenceStatus, string> = {
  HEALTHY: 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[color:var(--success)]',
  PROCESSING: 'border-[color-mix(in_srgb,var(--accent)_28%,transparent)] text-[color:var(--accent)]',
  WARNING: 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[color:var(--warning)]',
  BLOCKED: 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[color:var(--danger)]',
  FAILED: 'border-[color-mix(in_srgb,var(--danger)_34%,transparent)] text-[color:var(--danger)]',
  DEGRADED: 'border-[color-mix(in_srgb,var(--warning)_34%,transparent)] text-[color:var(--warning)]',
  UNKNOWN: 'border-[color:var(--border)] text-[color:var(--muted)]',
};

const DOT_CLASSES: Record<PresenceStatus, string> = {
  HEALTHY: 'bg-[color:var(--success)]',
  PROCESSING: 'bg-[color:var(--accent)]',
  WARNING: 'bg-[color:var(--warning)]',
  BLOCKED: 'bg-[color:var(--danger)]',
  FAILED: 'bg-[color:var(--danger)]',
  DEGRADED: 'bg-[color:var(--warning)]',
  UNKNOWN: 'bg-[color:var(--muted)]',
};

/** Ambient, non-conversational global status -- shows that an engineering
 * intelligence is watching the system, never a chat/avatar/voice surface.
 * Silent: it has no dialogue, no response, only a status + a one-line
 * activity label sourced from GET /api/system/presence. */
export function SystemStatusIndicator() {
  const { data } = useSystemPresence();
  const status = data?.status ?? 'UNKNOWN';

  return (
    <Badge
      className={cn('gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]', TONE_CLASSES[status])}
      title={data?.activity ?? 'LDCN ENGINE'}
    >
      <span className={cn('status-dot shrink-0', DOT_CLASSES[status], status === 'PROCESSING' && 'animate-pulse')} aria-hidden />
      <span className="whitespace-nowrap">LDCN ENGINE · {LABELS[status]}</span>
    </Badge>
  );
}
