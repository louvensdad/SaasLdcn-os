import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'glass-panel depth-card rounded-[var(--radius-xl)] p-5',
        className,
      )}
      {...props}
    />
  );
}
