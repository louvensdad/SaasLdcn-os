import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export type SummaryTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

interface StatusSummaryCardProps {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly tone?: SummaryTone;
  readonly icon?: LucideIcon;
}

const TONE_CLASS: Record<SummaryTone, string> = {
  success: 'bg-emerald-500 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.35)]',
  warning: 'bg-amber-500 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.3)]',
  danger: 'bg-red-500 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.3)]',
  neutral: 'bg-gray-500 text-gray-300 shadow-[0_0_10px_rgba(107,114,128,0.25)]',
  accent: 'bg-cyan-500 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]',
};

export function StatusSummaryCard({ label, value, detail, tone = 'success', icon: Icon }: StatusSummaryCardProps) {
  return (
    <article className="min-w-0 rounded-lg border border-gray-800/50 bg-gray-900/60 p-4 backdrop-blur-md transition hover:border-cyan-500/25 hover:shadow-[0_0_15px_rgba(6,182,212,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">{label}</p>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-cyan-200" aria-hidden /> : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', TONE_CLASS[tone])} aria-hidden />
        <p className="truncate font-mono text-sm font-semibold text-[color:var(--text)]">{value}</p>
      </div>
      {detail ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">{detail}</p> : null}
    </article>
  );
}