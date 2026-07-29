'use client';

import { CheckCircle2, Circle, GitBranch, ShieldCheck } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

const events = [
  {
    id: 'shell',
    titleKey: 'activity.shell.title',
    descriptionKey: 'activity.shell.description',
    icon: CheckCircle2,
  },
  {
    id: 'contracts',
    titleKey: 'activity.contracts.title',
    descriptionKey: 'activity.contracts.description',
    icon: GitBranch,
  },
  {
    id: 'gates',
    titleKey: 'activity.gates.title',
    descriptionKey: 'activity.gates.description',
    icon: ShieldCheck,
  },
] as const;

export function ActivityTimeline({ compact = false }: { readonly compact?: boolean }) {
  const { t } = useLocale();

  return (
    <Card className={cn('overflow-hidden', compact && 'p-4')}>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
        {t('activity.title')}
      </p>
      <div className="mt-5 space-y-4">
        {events.map((event, index) => {
          const Icon = event.icon;
          return (
            <div key={event.id} className="relative flex gap-3">
              {index < events.length - 1 ? (
                <span className="absolute left-[0.8rem] top-8 h-full w-px bg-gradient-to-b from-[color:var(--border)] to-transparent" />
              ) : null}
              <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-2)]">
                <Icon className="h-3.5 w-3.5 text-[color:var(--accent)]" />
              </span>
              <div className="min-w-0 pb-2">
                <p className="text-sm font-semibold text-[color:var(--text)]">{t(event.titleKey)}</p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{t(event.descriptionKey)}</p>
              </div>
            </div>
          );
        })}
        <div className="flex gap-3 opacity-70">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-[color:var(--border)]">
            <Circle className="h-3 w-3 text-[color:var(--muted)]" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[color:var(--text)]">{t('activity.future.title')}</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{t('activity.future.description')}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
