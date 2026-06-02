'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Layers3, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

import { ActivityTimeline } from '@/components/activity/activity-timeline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUiStore } from '@/stores/use-ui-store';

export function DrawerSystem() {
  const open = useUiStore((state) => state.drawerOpen);
  const drawerKind = useUiStore((state) => state.drawerKind);
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const shouldReduceMotion = useReducedMotion();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => closeRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeDrawer();
    }

    window.addEventListener('keydown', onEscape, true);
    window.addEventListener('keyup', onEscape, true);
    document.addEventListener('keydown', onEscape, true);
    document.addEventListener('keyup', onEscape, true);
    return () => {
      window.removeEventListener('keydown', onEscape, true);
      window.removeEventListener('keyup', onEscape, true);
      document.removeEventListener('keydown', onEscape, true);
      document.removeEventListener('keyup', onEscape, true);
    };
  }, [closeDrawer, open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button, input, [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[75] bg-black/48 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
          onMouseDown={closeDrawer}
        >
          <motion.aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Foundation details drawer"
            className="glass-panel-strong fixed inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-hidden border-l border-[color:var(--border)] p-5 shadow-[var(--shadow-cinematic)] sm:w-[30rem]"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 30 }}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge>{drawerKind} drawer</Badge>
                <h2 className="mt-3 text-xl font-semibold text-[color:var(--text)]">Operational details panel</h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                  A reusable right drawer for future project, template, download, and runtime details.
                </p>
              </div>
              <Button ref={closeRef} type="button" variant="ghost" className="h-9 w-9 rounded-full p-0" onClick={closeDrawer} aria-label="Close drawer">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-6 grid gap-4">
              <div className="rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-white/5 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
                    <Layers3 className="h-4 w-4 text-[color:var(--accent)]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--text)]">Details foundation</p>
                    <p className="text-xs text-[color:var(--muted)]">Ready for future data binding.</p>
                  </div>
                </div>
              </div>
              <ActivityTimeline compact />
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
