'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface AccordionItemProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly icon?: LucideIcon;
  readonly right?: ReactNode;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}

/**
 * Single expandable panel (WAI-ARIA disclosure pattern). Keeps the page short by
 * collapsing detail; the header stays scannable with an optional icon, subtitle
 * and a right-aligned slot (e.g. a confidence badge).
 */
export function AccordionItem({ title, subtitle, icon: Icon, right, defaultOpen = false, children }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_35%,transparent)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {Icon ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)]" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
            <Icon className="h-4.5 w-4.5" aria-hidden />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[color:var(--text)]">{title}</span>
          {subtitle ? <span className="block truncate t-caption">{subtitle}</span> : null}
        </span>
        {right}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-[color:var(--muted)] transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div id={panelId} className="border-t border-[color:var(--border)] px-4 py-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
