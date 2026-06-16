import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type CardSurface = 'primary' | 'secondary' | 'tertiary' | 'accent';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly surface?: CardSurface;
  /** Adds a hover lift (scale + glow) for clickable/feature cards. */
  readonly interactive?: boolean;
}

const surfaceClasses: Record<CardSurface, string> = {
  primary: 'surface-primary',
  secondary: 'surface-secondary',
  tertiary: 'surface-tertiary',
  accent: 'surface-accent',
};

export function Card({ className, surface = 'secondary', interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'depth-card min-w-0 rounded-[var(--radius-xl)] p-6 [overflow-wrap:anywhere]',
        surfaceClasses[surface],
        interactive && 'card-interactive',
        className,
      )}
      {...props}
    />
  );
}
