import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface TooltipProps {
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly side?: 'top' | 'bottom';
  readonly className?: string;
}

/**
 * Lightweight, dependency-free tooltip. Appears on hover AND keyboard focus
 * (focus-within), with a 150ms fade + 4px translateY per the design brief.
 * Reduced-motion is honored by the global prefers-reduced-motion rule. The
 * bubble is pointer-events-none so it never intercepts clicks, and carries
 * role="tooltip" for assistive tech.
 */
export function Tooltip({ label, children, side = 'top', className }: TooltipProps) {
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)]',
          'border border-[color:var(--border-strong)] bg-[color:var(--surface-2)] px-2.5 py-1.5 t-caption text-[color:var(--text)]',
          'shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur',
          'opacity-0 transition duration-150 ease-out group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'top'
            ? 'bottom-full mb-2 translate-y-1 group-hover/tt:translate-y-0 group-focus-within/tt:translate-y-0'
            : 'top-full mt-2 -translate-y-1 group-hover/tt:translate-y-0 group-focus-within/tt:translate-y-0',
        )}
      >
        {label}
      </span>
    </span>
  );
}
