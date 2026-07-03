'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Menu, Settings2 } from 'lucide-react';

import { AiModeBadge } from '@/components/shell/ai-mode-badge';
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
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
      className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 py-3 md:px-6 xl:px-10"
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
            <p className="type-data break-words text-[0.625rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
              {t('topbar.foundation')}
            </p>
            <p className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight tracking-[-0.025em] text-[color:var(--text)] md:text-[1.75rem]">
              {title}
            </p>
            {subtitle ? (
              <p className="mt-1 hidden max-w-3xl break-words text-sm leading-6 text-[color:var(--muted)] sm:block">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden md:flex">
            <AiModeBadge />
          </div>
          <div className="hidden xl:flex">
            <LDCNStatusPill state={presenceState} />
          </div>
          <GlobalSearch onOpen={onOpenSearch} />
          <NotificationCenter />
          <LocaleSelector compact />
          <div className="hidden xl:block">
            <ThemeSwitcher />
          </div>
          <ActionLink href="/settings" variant="secondary" className="hidden h-11 rounded-[var(--radius-md)] px-4 xl:inline-flex">
            <Settings2 className="h-4 w-4" />
            {t('common.settings')}
          </ActionLink>
        </div>
      </div>
    </motion.header>
  );
}
