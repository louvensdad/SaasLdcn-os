import type { ButtonHTMLAttributes } from 'react';
import { forwardRef } from 'react';

import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[color:var(--accent)] text-black shadow-[0_8px_20px_color-mix(in_srgb,var(--glow)_60%,transparent)] hover:brightness-105',
  secondary:
    'bg-white/5 text-[color:var(--text)] border border-[color:var(--border)] hover:bg-white/10',
  ghost:
    'bg-transparent text-[color:var(--muted)] hover:bg-white/10 hover:text-[color:var(--text)]',
  soft:
    'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[color:var(--text)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'focus-ring micro-interaction inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
