import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

import { cn } from '@/lib/cn';

type IconButtonVariant = 'secondary' | 'ghost' | 'soft';
type IconButtonSize = 'sm' | 'md';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: IconButtonVariant;
  readonly size?: IconButtonSize;
  readonly loading?: boolean;
  readonly children: ReactNode;
}

// A genuinely square/circular icon-only button. Deliberately does NOT reuse the
// text `Button` component: that one bakes in `min-h-11 px-4 py-2`, and because
// `cn` is a plain join (no tailwind-merge) those win over `h-9 w-9 p-0`
// overrides, producing distorted ovals with clipped icons. This owns its own
// minimal base so the icon is always centered in a true circle.
const variantClasses: Record<IconButtonVariant, string> = {
  secondary:
    'border border-[color:var(--border)] bg-[color:var(--surface-3)] text-[color:var(--text)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--control-hover)]',
  ghost:
    'text-[color:var(--muted)] hover:bg-[color:var(--control-hover)] hover:text-[color:var(--text)]',
  soft:
    'border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]',
};

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'h-9 w-9',
  md: 'h-10 w-10',
};

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = 'secondary', size = 'md', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'focus-ring micro-interaction inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
});
