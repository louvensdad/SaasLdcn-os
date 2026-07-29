import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft';

interface ActionLinkProps extends ComponentPropsWithoutRef<typeof Link> {
  readonly variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[color:var(--accent)] text-[color:var(--control-selected-text)] hover:brightness-[1.06]',
  secondary:
    'bg-[color:var(--surface-3)] text-[color:var(--text)] border border-[color:var(--border)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--control-hover)]',
  ghost:
    'bg-transparent text-[color:var(--muted)] hover:bg-[color:var(--control-hover)] hover:text-[color:var(--text)]',
  soft:
    'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[color:var(--text)] border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]',
};

export function ActionLink({
  className,
  variant = 'secondary',
  ...props
}: ActionLinkProps) {
  return (
    <Link
      className={cn(
        'focus-ring micro-interaction inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
