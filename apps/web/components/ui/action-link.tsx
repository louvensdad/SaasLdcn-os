import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft';

interface ActionLinkProps extends ComponentPropsWithoutRef<typeof Link> {
  readonly variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[linear-gradient(120deg,var(--accent),color-mix(in_srgb,var(--accent-2)_70%,var(--accent)))] text-black shadow-[0_18px_34px_var(--glow)] hover:shadow-[0_22px_48px_var(--glow)] hover:brightness-[1.08]',
  secondary:
    'bg-white/5 text-[color:var(--text)] border border-[color:var(--border)] hover:bg-white/10',
  ghost:
    'bg-transparent text-[color:var(--muted)] hover:bg-white/10 hover:text-[color:var(--text)]',
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
        'focus-ring micro-interaction inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
