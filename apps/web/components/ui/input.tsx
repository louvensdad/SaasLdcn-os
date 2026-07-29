import type { InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marks the field invalid: red border, a one-shot shake, and aria-invalid. */
  readonly error?: boolean;
}

export function Input({ className, error, ...props }: InputProps) {
  return (
    <input
      aria-invalid={error || undefined}
      className={cn(
        'h-11 w-full rounded-[var(--radius-md)] border bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] px-4 text-sm text-[color:var(--text)] outline-none transition duration-200',
        'placeholder:text-[color:var(--muted-2)]',
        error
          ? 'shake border-[color:var(--danger)] focus:border-[color:var(--danger)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_22%,transparent)]'
          : 'border-[color:var(--border)] focus:border-[color:var(--accent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]',
        className,
      )}
      {...props}
    />
  );
}
