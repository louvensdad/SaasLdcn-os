'use client';

import { motion, useReducedMotion } from 'framer-motion';

import type { SystemHealthStatus } from '@/hooks/useSystemHealth';
import { cn } from '@/lib/cn';
import { CATEGORY_COLOR, getSystemIcon, type SystemCategory } from '@/lib/system/engine-icons';

interface SystemCardProps {
  readonly id: string;
  readonly name: string;
  readonly category: SystemCategory;
  readonly status: SystemHealthStatus;
  readonly statusLabel: string;
}

const STATUS_DOT_CLASS: Record<SystemHealthStatus, string> = {
  healthy: 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.45)] animate-pulse',
  degraded: 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.35)]',
  down: 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.35)]',
  unavailable: 'bg-gray-500 shadow-[0_0_10px_rgba(107,114,128,0.25)]',
};

const STATUS_TEXT_CLASS: Record<SystemHealthStatus, string> = {
  healthy: 'text-emerald-300',
  degraded: 'text-amber-300',
  down: 'text-red-300',
  unavailable: 'ds-text-secondary',
};

export function SystemCard({ id, name, category, status, statusLabel }: SystemCardProps) {
  const Icon = getSystemIcon(category, id);
  const reduceMotion = useReducedMotion();
  const color = CATEGORY_COLOR[category];

  return (
    <motion.article
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        'group flex min-w-0 items-center gap-3 rounded-lg border border-gray-800/50 bg-gray-900/60 p-3 backdrop-blur-md',
        'transition-colors duration-200 hover:border-cyan-500/30 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)]',
        'focus-within:border-cyan-500/40',
      )}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
          color,
        }}
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </span>

      <span className="min-w-0 flex-1 truncate font-mono text-sm ds-text-primary">{name}</span>

      <span className={cn('flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]', STATUS_TEXT_CLASS[status])}>
        <span className={cn('h-2 w-2 rounded-full', STATUS_DOT_CLASS[status])} aria-hidden />
        <span className="hidden sm:inline">{statusLabel}</span>
        <span className="sr-only">{statusLabel}</span>
      </span>
    </motion.article>
  );
}
