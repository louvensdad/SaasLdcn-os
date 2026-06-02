import type { InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'focus-ring h-11 w-full rounded-2xl border border-[color:var(--border)] bg-white/5 px-4 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] outline-none transition duration-200',
        className,
      )}
      {...props}
    />
  );
}
