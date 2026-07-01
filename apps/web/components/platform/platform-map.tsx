'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Compass,
  Factory,
  FlaskConical,
  SearchCheck,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  MessagesSquare,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';

import { AmbientBackdrop } from '@/components/three/ambient-backdrop';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

interface MapNode {
  readonly key: string;
  readonly href: string;
  readonly icon: LucideIcon;
}

// Only real, reachable modules — the journey spine. No fictional Deploy/Analytics
// nodes (those have no backend and would be dead ends).
const NODES: readonly MapNode[] = [
  { key: 'projectRoom', href: '/project-rooms', icon: MessagesSquare },
  { key: 'architect', href: '/architect', icon: Compass },
  { key: 'engineeringReview', href: '/engineering-review', icon: SearchCheck },
  { key: 'metaFactory', href: '/meta-factory', icon: Factory },
  { key: 'lab', href: '/modernize', icon: FlaskConical },
  { key: 'templates', href: '/templates', icon: LayoutTemplate },
  { key: 'library', href: '/projects', icon: Library },
  { key: 'panel', href: '/dashboard', icon: LayoutDashboard },
  { key: 'builder', href: '/wizard', icon: WandSparkles },
];

const RADIUS = 37; // % of the square stage

function nodePosition(index: number, total: number) {
  const angle = (-90 + (index * 360) / total) * (Math.PI / 180);
  return { x: 50 + RADIUS * Math.cos(angle), y: 50 + RADIUS * Math.sin(angle) };
}

export function PlatformMap() {
  const { t } = useLocale();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  const go = (href: string) => router.push(href);

  return (
    <div className="space-y-8">
      <header className="text-center">
        <p className="t-overline">{t('platform.title')}</p>
        <h1 className="mx-auto mt-3 max-w-2xl t-h1 text-[color:var(--text)]">{t('platform.subtitle')}</h1>
      </header>

      {/* Desktop: cinematic radial stage */}
      <div className="relative mx-auto hidden aspect-square w-full max-w-[760px] lg:block">
        <AmbientBackdrop count={200} opacity={0.4} />

        {/* connection lines (same 0–100 coordinate space as the node buttons) */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="mapEdge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          {NODES.map((node, index) => {
            const { x, y } = nodePosition(index, NODES.length);
            const active = hovered === node.key;
            return (
              <line
                key={node.key}
                x1="50"
                y1="50"
                x2={x}
                y2={y}
                stroke="url(#mapEdge)"
                strokeWidth={active ? 0.6 : 0.32}
                strokeDasharray="1.5 3"
                style={reduce ? undefined : { animation: 'graph-edge-dash 7s linear infinite' }}
                opacity={active ? 0.95 : 0.4}
              />
            );
          })}
        </svg>

        {/* luminous core */}
        <motion.div
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          initial={reduce ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="ai-orb grid h-32 w-32 place-items-center rounded-full text-center">
            <div>
              <p className="t-mono text-[0.6rem] uppercase tracking-[0.24em] text-[color:var(--accent)]">{t('platform.core')}</p>
            </div>
          </div>
        </motion.div>

        {/* module nodes */}
        {NODES.map((node, index) => {
          const { x, y } = nodePosition(index, NODES.length);
          const Icon = node.icon;
          return (
            <motion.button
              key={node.key}
              type="button"
              onClick={() => go(node.href)}
              onMouseEnter={() => setHovered(node.key)}
              onMouseLeave={() => setHovered((current) => (current === node.key ? null : current))}
              onFocus={() => setHovered(node.key)}
              onBlur={() => setHovered((current) => (current === node.key ? null : current))}
              aria-label={t(`platform.node.${node.key}`)}
              className="focus-ring absolute z-20 flex w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-[var(--radius-lg)] p-2 text-center"
              style={{ left: `${x}%`, top: `${y}%` }}
              initial={reduce ? false : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: reduce ? 0 : 0.25 + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
              whileHover={reduce ? undefined : { y: -3 }}
              whileTap={reduce ? undefined : { scale: 0.96 }}
            >
              <span className="glass grid h-14 w-14 place-items-center rounded-2xl border border-[color:var(--border)] transition-colors duration-200 group-hover:border-[color:var(--accent)]">
                <Icon className="h-6 w-6 text-[color:var(--accent)]" aria-hidden />
              </span>
              <span className="t-mono text-xs font-semibold text-[color:var(--text)]">{t(`platform.node.${node.key}`)}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Mobile / tablet: same destinations as a clean card grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {NODES.map((node) => {
          const Icon = node.icon;
          return (
            <button
              key={node.key}
              type="button"
              onClick={() => go(node.href)}
              className={cn('glass lift focus-ring flex items-center gap-3 rounded-[var(--radius-lg)] p-4 text-left')}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[color:var(--text)]">{t(`platform.node.${node.key}`)}</span>
                <span className="mt-0.5 block t-caption">{t(`platform.node.${node.key}.desc`)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
