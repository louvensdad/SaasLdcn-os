import type { SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'focus-ring h-11 rounded-2xl border border-[color:var(--border)] bg-white/5 px-4 text-sm text-[color:var(--text)] outline-none transition duration-200',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
