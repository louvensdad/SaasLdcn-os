'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { CommandPalette } from '@/components/search/command-palette';
import { ToastProvider } from '@/components/feedback/toast-provider';
import { DrawerSystem } from '@/components/overlays/drawer-system';
import { ModalSystem } from '@/components/overlays/modal-system';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { cn } from '@/lib/cn';
import { useApplyInterfacePreferences } from '@/hooks/use-apply-interface-preferences';
import { useNotificationSideEffects } from '@/hooks/use-notification-side-effects';
import { useSyncPreferencesToBackend } from '@/hooks/use-sync-preferences-to-backend';
import { useLocale } from '@/hooks/use-locale';
import { useLDCNStore } from '@/stores/use-ldcn-store';
import { useShellStore } from '@/stores/use-shell-store';
import { useUiStore } from '@/stores/use-ui-store';
import { useAuthStore } from '@/stores/use-auth-store';

interface ShellCopy {
  readonly titleKey: string;
  readonly subtitleKey: string;
}

const shellCopy: Record<string, ShellCopy> = {
  '/platform': {
    titleKey: 'shell.platform.title',
    subtitleKey: 'shell.platform.subtitle',
  },
  '/dashboard': {
    titleKey: 'shell.dashboard.title',
    subtitleKey: 'shell.dashboard.subtitle',
  },
  '/analytics': {
    titleKey: 'shell.analytics.title',
    subtitleKey: 'shell.analytics.subtitle',
  },
  '/architect': {
    titleKey: 'shell.architect.title',
    subtitleKey: 'shell.architect.subtitle',
  },
  '/engineering-review': {
    titleKey: 'shell.review.title',
    subtitleKey: 'shell.review.subtitle',
  },
  '/engineering-laboratory': {
    titleKey: 'shell.engineeringLaboratory.title',
    subtitleKey: 'shell.engineeringLaboratory.subtitle',
  },
  '/auto-fix': {
    titleKey: 'shell.autoFix.title',
    subtitleKey: 'shell.autoFix.subtitle',
  },
  '/projects': {
    titleKey: 'shell.projects.title',
    subtitleKey: 'shell.projects.subtitle',
  },
  '/templates': {
    titleKey: 'shell.templates.title',
    subtitleKey: 'shell.templates.subtitle',
  },
  '/wizard': {
    titleKey: 'shell.wizard.title',
    subtitleKey: 'shell.wizard.subtitle',
  },
  '/skills': {
    titleKey: 'shell.skills.title',
    subtitleKey: 'shell.skills.subtitle',
  },
  '/system-status': {
    titleKey: 'shell.systemStatus.title',
    subtitleKey: 'shell.systemStatus.subtitle',
  },
  '/architecture': {
    titleKey: 'shell.architecture.title',
    subtitleKey: 'shell.architecture.subtitle',
  },
  '/roadmap': {
    titleKey: 'shell.roadmap.title',
    subtitleKey: 'shell.roadmap.subtitle',
  },
  '/documentation': {
    titleKey: 'shell.documentation.title',
    subtitleKey: 'shell.documentation.subtitle',
  },
  '/settings': {
    titleKey: 'shell.settings.title',
    subtitleKey: 'shell.settings.subtitle',
  },
  '/pricing': {
    titleKey: 'shell.pricing.title',
    subtitleKey: 'shell.pricing.subtitle',
  },
};

function resolveShellCopy(pathname: string): ShellCopy {
  return shellCopy[pathname] ?? shellCopy['/dashboard'];
}

interface AppShellProps {
  readonly children: ReactNode;
  /** Set to false for routes that must stay reachable by signed-out visitors
   * (currently only /pricing, per the vault's "Rotas públicas: /{locale}/pricing").
   * Skips the login redirect/gate entirely -- the page renders immediately and
   * decides its own signed-out experience -- but still shows the Sidebar/Topbar
   * chrome once a session IS present, instead of leaving authenticated users
   * with no navigation at all. */
  readonly requireAuth?: boolean;
}

export function AppShell({ children, requireAuth = true }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const shouldReduceMotion = useReducedMotion();
  useApplyInterfacePreferences();
  const copyKeys = resolveShellCopy(pathname);
  const copy = { title: t(copyKeys.titleKey), subtitle: t(copyKeys.subtitleKey) };
  const runtimeObservingLabel = t('shell.runtimeObserving');
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);
  const sidebarOpen = useShellStore((state) => state.sidebarOpen);
  const setSidebarOpen = useShellStore((state) => state.setSidebarOpen);
  const closeModal = useUiStore((state) => state.closeModal);
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const closeNotificationCenter = useUiStore((state) => state.closeNotificationCenter);
  const [searchOpen, setSearchOpen] = useState(false);
  const authStatus = useAuthStore((state) => state.status);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const retryAuth = useAuthStore((state) => state.retry);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useSyncPreferencesToBackend(authStatus === 'authenticated');
  useNotificationSideEffects(authStatus === 'authenticated');

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (requireAuth && authStatus === 'unauthenticated') router.replace('/login');
  }, [authStatus, requireAuth, router]);

  // Fail-safe: the whole app is gated on an authenticated session, so a session
  // bootstrap that never reaches a terminal state would leave every page on an
  // endless spinner. After a grace period in a non-terminal state, surface an
  // actionable error (retry / sign in) instead of spinning forever.
  useEffect(() => {
    if (authStatus === 'idle' || authStatus === 'loading') {
      setAuthTimedOut(false);
      const timer = window.setTimeout(() => setAuthTimedOut(true), 12_000);
      return () => window.clearTimeout(timer);
    }
    setAuthTimedOut(false);
    return undefined;
  }, [authStatus]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  useEffect(() => {
    setPresenceState('observing');
    setContext({
      route: pathname,
      page_title: copy.title,
      current_phase: copy.title,
      pipeline: {
        route: pathname,
        phase: copy.title,
        status: 'previewing',
        readiness_label: runtimeObservingLabel,
        detail: copy.subtitle,
      },
      status: 'observing',
      summary: copy.subtitle,
      suggestions: [],
    });
  }, [copy.subtitle, copy.title, pathname, runtimeObservingLabel, setContext, setPresenceState]);

  useEffect(() => {
    function onGlobalSearchKeyDown(event: globalThis.KeyboardEvent) {
      const commandPressed = event.metaKey || event.ctrlKey;

      if (commandPressed && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSearchOpen(false);
        closeModal();
        closeDrawer();
        closeNotificationCenter();
      }
    }

    function onGlobalSearchKeyUp(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSearchOpen(false);
        closeModal();
        closeDrawer();
        closeNotificationCenter();
      }
    }

    window.addEventListener('keydown', onGlobalSearchKeyDown, true);
    window.addEventListener('keyup', onGlobalSearchKeyUp, true);

    return () => {
      window.removeEventListener('keydown', onGlobalSearchKeyDown, true);
      window.removeEventListener('keyup', onGlobalSearchKeyUp, true);
    };
  }, [closeDrawer, closeModal, closeNotificationCenter]);

  if (!requireAuth && authStatus !== 'authenticated') {
    // Public route (e.g. /pricing): render the page immediately with no
    // Sidebar/Topbar chrome and no redirect -- it owns its own signed-out
    // experience. Still mounts the overlay singletons so toasts/modals fired
    // from the page itself work identically to every other route.
    return (
      <>
        <ModalSystem />
        <DrawerSystem />
        <ToastProvider />
        {children}
      </>
    );
  }

  if (authStatus !== 'authenticated') {
    if (authTimedOut) {
      return (
        <div className="grid min-h-screen place-items-center px-6">
          <div className="w-full max-w-md space-y-4 rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color:var(--control-bg)] p-8 text-center">
            <h1 className="text-lg font-semibold text-[color:var(--text)]">{t('auth.session.stuck.title')}</h1>
            <p className="text-sm leading-6 text-[color:var(--muted)]">{t('auth.session.stuck.description')}</p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => void retryAuth()}
                className="focus-ring rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--accent-foreground)]"
              >
                {t('auth.session.retry')}
              </button>
              <button
                type="button"
                onClick={() => router.replace('/login')}
                className="focus-ring rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-[color:var(--text)]"
              >
                {t('auth.session.login')}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="grid min-h-screen place-items-center text-sm text-[color:var(--muted)]" role="status" aria-live="polite">
        {t('auth.session.loading')}
      </div>
    );
  }

  return (
    <div className="app-workbench relative min-h-screen overflow-x-hidden">
      <a className="skip-link" href="#main-content">
        {t('accessibility.skipToContent')}
      </a>

      <Sidebar compact />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <ModalSystem />
      <DrawerSystem />
      <ToastProvider />

      <AnimatePresence initial={false}>
        {sidebarOpen ? (
          <motion.div
            aria-hidden
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] xl:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <div
        className={cn(
          'relative min-h-screen transition-[padding] duration-300 xl:pl-72',
          'xl:pl-72',
        )}
      >
        <Topbar
          title={copy.title}
          subtitle={copy.subtitle}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <main id="main-content" tabIndex={-1} className="relative z-10 px-4 py-5 md:px-6 lg:py-7 xl:px-10">
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.2, ease: 'easeOut' }
              }
              className="mx-auto max-w-[1480px]"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
