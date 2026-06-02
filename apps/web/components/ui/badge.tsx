import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {}

export function Badge({ className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-[color:var(--border)] bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-[color:var(--text)]',
        className,
      )}
      {...props}
    />
  );
}
