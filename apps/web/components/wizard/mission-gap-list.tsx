'use client';

import { AlertTriangle } from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import type { GapSeverity, MissionGap } from '@contracts/mission.contract';

const SEVERITY_TONE: Record<GapSeverity, BadgeTone> = {
  critical: 'danger',
  high: 'warning',
  medium: 'accent',
  low: 'neutral',
};

interface Props {
  readonly gaps: MissionGap[];
  readonly busyGapId: string | null;
  readonly onDecide: (gapId: string, action: 'dismiss' | 'backlog' | 'add_step') => void;
}

export function MissionGapList({ gaps, busyGapId, onDecide }: Props) {
  const { t } = useLocale();
  const active = gaps.filter((gap) => !gap.dismissed);

  if (gaps.length === 0) {
    return <p className="text-sm text-[color:var(--muted)]">{t('missions.gaps.empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {active.map((gap) => (
        <div key={gap.id} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
          <div className="mb-1 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--warning)]" aria-hidden />
            <Badge tone={SEVERITY_TONE[gap.severity]}>{t(`missions.gaps.severity.${gap.severity}`)}</Badge>
          </div>
          <p className="text-sm font-medium text-[color:var(--text)]">{gap.title}</p>
          <p className="mt-1 text-xs text-[color:var(--muted)]">{gap.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button variant="ghost" disabled={busyGapId === gap.id} onClick={() => onDecide(gap.id, 'dismiss')} className="px-2 py-1 text-xs">
              {t('missions.gaps.dismiss')}
            </Button>
            <Button variant="ghost" disabled={busyGapId === gap.id} onClick={() => onDecide(gap.id, 'backlog')} className="px-2 py-1 text-xs">
              {t('missions.gaps.backlog')}
            </Button>
          </div>
        </div>
      ))}
      {gaps.length > active.length ? (
        <p className="text-xs text-[color:var(--muted)]">{t('missions.gaps.dismissedCount', { count: gaps.length - active.length })}</p>
      ) : null}
    </div>
  );
}
