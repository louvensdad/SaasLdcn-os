'use client';

import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface CollapsibleSectionProps {
  readonly title: string;
  readonly summary: string;
  readonly actionLabel: string;
  readonly collapseLabel: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly forceOpen?: boolean;
  readonly children: ReactNode;
}

export function CollapsibleSection({
  title,
  summary,
  actionLabel,
  collapseLabel,
  open,
  onOpenChange,
  forceOpen = false,
  children,
}: CollapsibleSectionProps) {
  const reduceMotion = useReducedMotion();
  const isOpen = open || forceOpen;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-800/50 bg-gray-950/45 backdrop-blur-md" data-testid="system-group">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold uppercase tracking-[0.22em] text-gray-200">{title}</h3>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{summary}</p>
        </div>

        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => onOpenChange(!open)}
          className={cn(
            'focus-ring inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-500/20 px-3 text-sm font-semibold text-cyan-100',
            'bg-cyan-500/10 transition hover:border-cyan-400/40 hover:bg-cyan-500/15',
          )}
        >
          {isOpen ? collapseLabel : actionLabel}
          <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} aria-hidden />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="content"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="border-t border-gray-800/50"
          >
            <div className="p-4 pt-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}