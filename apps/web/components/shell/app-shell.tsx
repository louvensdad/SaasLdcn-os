'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { CommandPalette } from '@/components/search/command-palette';
import { ToastProvider } from '@/components/feedback/toast-provider';
import { DrawerSystem } from '@/components/overlays/drawer-system';
import { ModalSystem } from '@/components/overlays/modal-system';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { cn } from '@/lib/cn';
import { useLDCNStore } from '@/stores/use-ldcn-store';
import { useShellStore } from '@/stores/use-shell-store';
import { useUiStore } from '@/stores/use-ui-store';

interface ShellCopy {
  readonly title: string;
  readonly subtitle: string;
}

const shellCopy: Record<string, ShellCopy> = {
  '/dashboard': {
    title: 'Engineering Runtime Command Center',
    subtitle:
      'Cinematic cockpit for runtime topology, architecture awareness, and operational control.',
  },
  '/projects': {
    title: 'Project Intelligence Registry',
    subtitle:
      'Persisted project records with architectural identity, readiness, and lineage visibility.',
  },
  '/templates': {
    title: 'Template Architecture Atlas',
    subtitle:
      'Production-oriented templates with stack, complexity, and deployment awareness.',
  },
  '/wizard': {
    title: 'Architecture Journey',
    subtitle:
      'Technology graph exploration and governed blueprint assembly without generation.',
  },
  '/skills': {
    title: 'Skill Registry',
    subtitle:
      'Read-only operational skills catalog for architecture, planning, generation and support.',
  },
  '/system-status': {
    title: 'System Status Center',
    subtitle:
      'Internal runtime, validation, registry and build health for LDCN OS.',
  },
  '/architecture': {
    title: 'Architecture Center',
    subtitle:
      'Current platform map separating active runtime, registries, engines and future modules.',
  },
  '/roadmap': {
    title: 'Roadmap Center',
    subtitle:
      'Governed platform roadmap across implemented, planned, future and archived work.',
  },
  '/documentation': {
    title: 'Architecture Knowledge System',
    subtitle:
      'Living reference surface for blueprint lifecycle, standards, and quality gates.',
  },
  '/settings': {
    title: 'Foundation Operations',
    subtitle:
      'Runtime health, registry visibility, and contract synchronization controls.',
  },
};

function resolveShellCopy(pathname: string): ShellCopy {
  return shellCopy[pathname] ?? shellCopy['/dashboard'];
}

function SectionGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[color-mix(in_srgb,var(--accent)_12%,transparent)] to-transparent opacity-70" />
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-[color:var(--border)] to-transparent opacity-60" />
      <div className="grid-pattern absolute inset-0 opacity-[0.06]" />
    </div>
  );
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const copy = resolveShellCopy(pathname);
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);
  const sidebarOpen = useShellStore((state) => state.sidebarOpen);
  const setSidebarOpen = useShellStore((state) => state.setSidebarOpen);
  const closeModal = useUiStore((state) => state.closeModal);
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const closeNotificationCenter = useUiStore((state) => state.closeNotificationCenter);
  const [searchOpen, setSearchOpen] = useState(false);

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
        readiness_label: 'Observing runtime surfaces',
        detail: copy.subtitle,
      },
      status: 'observing',
      summary: copy.subtitle,
      suggestions: [],
    });
  }, [copy.subtitle, copy.title, pathname, setContext, setPresenceState]);

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

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <SectionGlow />

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
          'relative min-h-screen transition-[padding] duration-300 xl:pl-[22rem]',
          'xl:pl-[22rem]',
        )}
      >
        <Topbar
          title={copy.title}
          subtitle={copy.subtitle}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <main className="relative z-10 px-4 py-6 md:px-6 xl:px-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -8 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 160, damping: 24 }
              }
              className="mx-auto max-w-[1600px]"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
