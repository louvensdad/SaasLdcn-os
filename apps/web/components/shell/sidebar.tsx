'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronRight, PanelLeftClose, Shield, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/cn';
import { NAVIGATION_ITEMS } from '@/lib/navigation';
import { useShellStore } from '@/stores/use-shell-store';

interface SidebarProps {
  readonly compact?: boolean;
}

export function Sidebar({ compact = false }: SidebarProps) {
  const pathname = usePathname();
  const sidebarOpen = useShellStore((state) => state.sidebarOpen);
  const setSidebarOpen = useShellStore((state) => state.setSidebarOpen);

  return (
    <motion.aside
      initial={false}
      animate={{
        opacity: compact && !sidebarOpen ? 0.98 : 1,
      }}
      transition={{ type: 'spring', stiffness: 170, damping: 22 }}
      className={cn(
        'glass-panel-strong fixed inset-y-0 left-0 z-50 flex w-80 flex-col overflow-hidden border-r border-[color:var(--border)] p-4 will-change-transform',
        compact
          ? sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-[calc(100%+1.25rem)]'
          : 'translate-x-0',
        'xl:translate-x-0 xl:opacity-100',
      )}
    >
      <div className="relative flex items-center justify-between gap-3 px-1 pb-4">
        <div className="flex items-center gap-3">
          <div className="ai-orb relative flex h-12 w-12 items-center justify-center rounded-2xl">
            <Sparkles className="h-5 w-5 text-[color:var(--text)]" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.24em] text-[color:var(--muted)] uppercase">
              LDCN OS
            </p>
            <p className="text-lg font-semibold text-[color:var(--text)]">
              Foundation
            </p>
          </div>
        </div>

        {compact ? (
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-10 rounded-2xl p-0 xl:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <Badge className="mb-4 w-fit bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--text)]">
        Enterprise cinematic intelligence
      </Badge>

      <Separator className="mb-4 opacity-60" />

      <nav className="flex-1 space-y-2 overflow-y-auto pr-1">
        {NAVIGATION_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group micro-interaction relative flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 focus-ring',
                active
                  ? 'border-[color-mix(in_srgb,var(--accent)_44%,transparent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_18px_42px_rgba(0,0,0,0.24)]'
                  : 'border-transparent bg-transparent hover:border-[color-mix(in_srgb,var(--accent)_20%,var(--border))] hover:bg-white/5 hover:shadow-[0_16px_38px_rgba(0,0,0,0.22)]',
              )}
            >
              <span className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100">
                <span className="absolute inset-y-2 left-0 w-px bg-gradient-to-b from-transparent via-[color:var(--accent)] to-transparent" />
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_38%)]" />
              </span>
              {active ? (
                <motion.span
                  layoutId="sidebar-active-indicator"
                  className="absolute left-0 top-1/2 h-9 w-1 -translate-y-1/2 rounded-r-full bg-[color:var(--accent)] shadow-[0_0_22px_var(--glow)]"
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                />
              ) : null}
              <span
                className={cn(
                  'relative flex h-10 w-10 items-center justify-center rounded-2xl transition duration-300',
                  active
                    ? 'bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[color:var(--text)] shadow-[0_0_35px_var(--glow)]'
                    : 'bg-white/5 text-[color:var(--muted)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] group-hover:text-[color:var(--text)]',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[color:var(--text)]">
                  {item.label}
                </span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {item.description}
                </span>
              </span>
              <ChevronRight className={cn('relative h-4 w-4 transition duration-300', active ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100')} />
            </Link>
          );
        })}
      </nav>

      <div className="depth-card mt-4 rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-white/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
          <Shield className="h-4 w-4" />
          Foundation rules
        </div>
        <p className="text-sm leading-6 text-[color:var(--text)]/85">
          No IA, no voz, no avatar yet. Pure visual architecture, navigation and motion foundations.
        </p>
      </div>
    </motion.aside>
  );
}
