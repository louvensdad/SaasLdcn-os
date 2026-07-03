'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { CircuitBoard, PanelLeftClose, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/cn';
import { NAVIGATION_ITEMS } from '@/lib/navigation';
import { useLocale } from '@/hooks/use-locale';
import { useShellStore } from '@/stores/use-shell-store';

interface SidebarProps {
  readonly compact?: boolean;
}

export function Sidebar({ compact = false }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useLocale();
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
        'surface-secondary fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-hidden border-y-0 border-l-0 border-r border-[color:var(--border)] p-3 will-change-transform',
        compact
          ? sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-[calc(100%+1.25rem)]'
          : 'translate-x-0',
        'xl:translate-x-0 xl:opacity-100',
      )}
    >
      <span className="instrument-rail" aria-hidden />

      <div className="relative flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-2 pb-4 pt-1">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[color:var(--border-strong)] bg-[color:var(--surface-3)]">
            <CircuitBoard className="h-5 w-5 text-[color:var(--accent)]" strokeWidth={1.75} />
          </div>
          <div>
            <p className="type-data text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
              {t('product.name')}
            </p>
            <p className="ds-subsection leading-tight text-[color:var(--text)]">
              {t('sidebar.foundation')}
            </p>
          </div>
        </div>

        {compact ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 rounded-[var(--radius-md)] p-0 xl:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label={t('sidebar.close')}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <Badge className="mx-2 mb-3 mt-4 w-fit rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] bg-transparent font-mono text-[color:var(--accent)]">
        {t('sidebar.badge')}
      </Badge>

      <Separator className="mb-3 opacity-60" />

      <nav className="flex-1 space-y-1 overflow-y-auto px-1 pr-2" aria-label={t('sidebar.foundation')}>
        {NAVIGATION_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group micro-interaction relative flex min-h-12 items-center gap-3 overflow-hidden rounded-[var(--radius-md)] border px-2.5 py-2 focus-ring',
                active
                  ? 'border-[color-mix(in_srgb,var(--accent)_48%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-2))]'
                  : 'border-transparent bg-transparent hover:border-[color:var(--border)] hover:bg-[color:var(--control-hover)]',
              )}
            >
              {active ? (
                <motion.span
                  layoutId="sidebar-active-indicator"
                  className="absolute inset-y-2 left-0 w-0.5 bg-[color:var(--accent)]"
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                />
              ) : null}
              <span
                className={cn(
                  'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition duration-200',
                  active
                    ? 'border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface-3))] text-[color:var(--accent)]'
                    : 'border-[color:var(--border)] bg-[color:var(--surface-3)] text-[color:var(--muted)] group-hover:text-[color:var(--text)]',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-5 text-[color:var(--text)]">
                  {t(item.labelKey)}
                </span>
                {active ? (
                  <span className="mt-0.5 block text-xs leading-4 text-[color:var(--muted)]">
                    {t(item.descriptionKey)}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="surface-tertiary mx-1 mt-3 rounded-[var(--radius-md)] p-3">
        <div className="ds-caption mb-2 flex items-center gap-2 text-[color:var(--muted)]">
          <Shield className="h-4 w-4" />
          {t('sidebar.rules')}
        </div>
        <p className="text-sm leading-6 text-[color:var(--text)]/85">
          {t('sidebar.rulesDescription')}
        </p>
      </div>
    </motion.aside>
  );
}
