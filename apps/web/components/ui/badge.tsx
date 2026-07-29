import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: BadgeTone;
}

// Translucent background + colored text — vibrant but discreet (no solid blocks).
const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-[color:var(--border)] bg-white/5 text-[color:var(--text)]',
  accent:
    'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--accent)]',
  success:
    'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-[color:var(--success)]',
  warning:
    'border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[color:var(--warning)]',
  danger:
    'border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[color:var(--danger)]',
};

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium tracking-wide',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
