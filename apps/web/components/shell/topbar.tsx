'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Menu, Settings2 } from 'lucide-react';

import { LDCNStatusPill } from '@/components/ldcn/ldcn-status-pill';
import { ActionLink } from '@/components/ui/action-link';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from '@/components/search/global-search';
import { NotificationCenter } from '@/components/overlays/notification-center';
import { ThemeSwitcher } from '@/components/shell/theme-switcher';
import { LocaleSelector } from '@/components/shell/locale-selector';
import { useLocale } from '@/hooks/use-locale';
import { useLDCNStore } from '@/stores/use-ldcn-store';
import { useShellStore } from '@/stores/use-shell-store';

interface TopbarProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onOpenSearch: () => void;
}

export function Topbar({ title, subtitle, onOpenSearch }: TopbarProps) {
  const toggleSidebar = useShellStore((state) => state.toggleSidebar);
  const presenceState = useLDCNStore((state) => state.presenceState);
  const shouldReduceMotion = useReducedMotion();
  const { t } = useLocale();

  return (
    <motion.header
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 24 }}
      className="sticky top-0 z-30 border-b border-white/10 bg-[color-mix(in_srgb,var(--bg)_76%,transparent)] px-4 py-4 backdrop-blur-xl md:px-6"
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden opacity-70">
        <div className="operational-line h-px w-full" />
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 rounded-2xl xl:hidden"
            onClick={toggleSidebar}
            aria-label={t('topbar.toggleNavigation')}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <p className="break-words text-xs font-semibold uppercase tracking-[0.26em] text-[color:var(--muted)]">
              {t('topbar.foundation')}
            </p>
            <p className="text-2xl font-semibold tracking-normal text-[color:var(--text)] md:text-3xl">
              {title}
            </p>
            {subtitle ? (
              <p className="mt-1 hidden max-w-3xl break-words text-sm leading-6 text-[color:var(--muted)] sm:block">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden lg:flex">
            <LDCNStatusPill state={presenceState} />
          </div>
          <GlobalSearch onOpen={onOpenSearch} />
          <NotificationCenter />
          <LocaleSelector compact />
          <div className="hidden xl:block">
            <ThemeSwitcher />
          </div>
          <ActionLink href="/settings" variant="secondary" className="hidden h-11 rounded-full px-4 xl:inline-flex">
            <Settings2 className="h-4 w-4" />
            {t('common.settings')}
          </ActionLink>
        </div>
      </div>
    </motion.header>
  );
}
