'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Menu, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AiModeBadge } from '@/components/shell/ai-mode-badge';
import { SystemStatusIndicator } from '@/components/ldcn/system-status-indicator';
import { ActionLink } from '@/components/ui/action-link';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from '@/components/search/global-search';
import { NotificationCenter } from '@/components/overlays/notification-center';
import { ThemeSwitcher } from '@/components/shell/theme-switcher';
import { LocaleSelector } from '@/components/shell/locale-selector';
import { useLocale } from '@/hooks/use-locale';
import { useShellStore } from '@/stores/use-shell-store';

interface TopbarProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onOpenSearch: () => void;
}

export function Topbar({ title, subtitle, onOpenSearch }: TopbarProps) {
  const toggleSidebar = useShellStore((state) => state.toggleSidebar);
  const config = useShellStore((state) => state.topbarConfig);
  const shouldReduceMotion = useReducedMotion();
  const pathname = usePathname();
  const { t } = useLocale();

  const effectiveTitle = config?.title ?? title;
  const effectiveSubtitle = config?.subtitle ?? subtitle;
  const PrimaryIcon = config?.primaryAction?.icon;

  return (
    <motion.header
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
      className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 py-4 md:px-6 md:py-5 xl:px-10"
    >
      <div className="mx-auto flex max-w-[1480px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 shrink-0 rounded-[var(--radius-md)] xl:hidden"
            onClick={toggleSidebar}
            aria-label={t('topbar.toggleNavigation')}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            {config?.breadcrumb?.length ? (
              <nav aria-label={t('topbar.breadcrumbLabel')} className="flex flex-wrap items-center gap-1.5 type-data text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--accent)]">
                {config.breadcrumb.map((crumb, index) => {
                  const item = typeof crumb === 'string' ? { label: crumb, href: undefined } : crumb;
                  return (
                    <span key={item.label} className="flex items-center gap-1.5">
                      {index > 0 ? <ChevronRight className="h-3 w-3 opacity-60" aria-hidden /> : null}
                      {item.href ? (
                        <Link href={item.href} className="focus-ring rounded-sm hover:underline">{item.label}</Link>
                      ) : (
                        item.label
                      )}
                    </span>
                  );
                })}
              </nav>
            ) : (
              <p className="type-data break-words text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
                {t('topbar.foundation')}
              </p>
            )}
            <p className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight tracking-[-0.025em] text-[color:var(--text)] md:text-3xl">
              {effectiveTitle}
            </p>
            {effectiveSubtitle ? (
              <p className="mt-1 hidden max-w-3xl break-words text-sm leading-6 text-[color:var(--muted)] sm:block">
                {effectiveSubtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden md:flex">
            <AiModeBadge />
          </div>
          <div className="hidden xl:flex">
            <SystemStatusIndicator />
          </div>
          <GlobalSearch onOpen={onOpenSearch} />
          <NotificationCenter />
          <LocaleSelector compact />
          <div className="hidden xl:block">
            <ThemeSwitcher />
          </div>
          {config?.primaryAction ? (
            <div className="flex flex-col items-end gap-1">
              <Button
                type="button"
                variant="primary"
                className="h-11 rounded-[var(--radius-md)] px-4"
                loading={config.primaryAction.loading}
                onClick={config.primaryAction.onClick}
              >
                {PrimaryIcon ? <PrimaryIcon className="h-4 w-4" /> : null}
                {config.primaryAction.label}
              </Button>
              {config.secondaryText ? (
                <p className="hidden text-xs text-[color:var(--muted)] xl:block">{config.secondaryText}</p>
              ) : null}
            </div>
          ) : pathname !== '/settings' ? (
            <ActionLink href="/settings" variant="secondary" className="hidden h-11 rounded-[var(--radius-md)] px-4 xl:inline-flex">
              <Settings2 className="h-4 w-4" />
              {t('common.settings')}
            </ActionLink>
          ) : null}
        </div>
      </div>
    </motion.header>
  );
}
