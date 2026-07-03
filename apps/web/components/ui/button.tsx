import type { ButtonHTMLAttributes } from 'react';
import { forwardRef } from 'react';

import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  /** Shows an inline spinner and disables the button while an action runs. */
  readonly loading?: boolean;
}

// primary owns its motion via .accent-fill (gradient + scale on hover/active);
// the others use .micro-interaction so transforms never double up.
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'accent-fill font-semibold',
  secondary:
    'micro-interaction border border-[color:var(--border)] bg-[color:var(--surface-3)] text-[color:var(--text)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--control-hover)]',
  ghost:
    'micro-interaction bg-transparent text-[color:var(--muted)] hover:bg-[color:var(--control-hover)] hover:text-[color:var(--text)]',
  soft:
    'micro-interaction border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--text)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]',
  danger:
    'micro-interaction border border-[color-mix(in_srgb,var(--danger)_42%,transparent)] bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] font-semibold text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]',
};

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
        loading && 'opacity-80',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
      {loading ? <Spinner /> : null}
    </button>
  );
});
