import { CheckCircle2, Circle, GitBranch, ShieldCheck } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

const events = [
  {
    id: 'shell',
    title: 'Shell initialized',
    description: 'Navigation, theme, overlays, and command surfaces loaded.',
    icon: CheckCircle2,
  },
  {
    id: 'contracts',
    title: 'Contracts ready',
    description: 'Frontend prepared to consume future shared contracts.',
    icon: GitBranch,
  },
  {
    id: 'gates',
    title: 'Quality gates pending',
    description: 'Backend and AI phases remain blocked until frontend foundation validates.',
    icon: ShieldCheck,
  },
] as const;

export function ActivityTimeline({ compact = false }: { readonly compact?: boolean }) {
  return (
    <Card className={cn('overflow-hidden', compact && 'p-4')}>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">
        Activity timeline
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
                <p className="text-sm font-semibold text-[color:var(--text)]">{event.title}</p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{event.description}</p>
              </div>
            </div>
          );
        })}
        <div className="flex gap-3 opacity-70">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-[color:var(--border)]">
            <Circle className="h-3 w-3 text-[color:var(--muted)]" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[color:var(--text)]">Future backend event</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">Reserved for real runtime events later.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
