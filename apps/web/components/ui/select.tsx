import type { SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'h-11 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--control-bg)] px-4 text-sm text-[color:var(--text)] outline-none transition duration-200',
        'hover:border-[color:var(--border-strong)] hover:bg-[color:var(--control-hover)]',
        'focus:border-[color:var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
