'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Info, ShieldCheck, Trash2, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';
import { useUiStore, type ModalKind } from '@/stores/use-ui-store';

const modalCopy: Record<ModalKind, { title: string; description: string; action: string }> = {
  confirmation: {
    title: 'modal.confirmation.title',
    description: 'modal.confirmation.description',
    action: 'modal.confirmation.action',
  },
  information: {
    title: 'modal.information.title',
    description: 'modal.information.description',
    action: 'modal.information.action',
  },
  destructive: {
    title: 'modal.destructive.title',
    description: 'modal.destructive.description',
    action: 'modal.destructive.action',
  },
};

function ModalIcon({ kind }: { readonly kind: ModalKind }) {
  if (kind === 'destructive') return <Trash2 className="h-5 w-5 text-[color:var(--danger)]" />;
  if (kind === 'confirmation') return <ShieldCheck className="h-5 w-5 text-[color:var(--success)]" />;
  return <Info className="h-5 w-5 text-[color:var(--accent)]" />;
}

export function ModalSystem() {
  const { t } = useLocale();
  const open = useUiStore((state) => state.modalOpen);
  const kind = useUiStore((state) => state.modalKind);
  const closeModal = useUiStore((state) => state.closeModal);
  const addToast = useUiStore((state) => state.addToast);
  const shouldReduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copy = modalCopy[kind];

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => closeRef.current?.focus(), 20);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeModal();
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
  }, [closeModal, open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
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
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
          onMouseDown={closeModal}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t(copy.title)}
            className={cn(
              'glass-panel-strong cinematic-surface w-full max-w-lg rounded-[var(--radius-xl)] p-5 shadow-[var(--shadow-cinematic)]',
              kind === 'destructive' && 'border-[color-mix(in_srgb,var(--danger)_42%,var(--border))]',
            )}
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10, scale: shouldReduceMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : 6, scale: shouldReduceMotion ? 1 : 0.95 }}
            transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 28 }}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-white/5">
                <ModalIcon kind={kind} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-[color:var(--text)]">{t(copy.title)}</h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t(copy.description)}</p>
              </div>
              <Button ref={closeRef} type="button" variant="ghost" className="h-9 w-9 rounded-full p-0" onClick={closeModal} aria-label={t('modal.close')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {kind === 'destructive' ? (
              <div className="mt-5 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3 text-xs leading-5 text-[color:var(--muted)]">
                <AlertTriangle className="mr-2 inline h-3.5 w-3.5 text-[color:var(--danger)]" />
                {t('modal.destructive.blocked')}
              </div>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={closeModal}>
                {t('modal.cancel')}
              </Button>
              <Button
                type="button"
                variant={kind === 'destructive' ? 'soft' : 'primary'}
                onClick={() => {
                  addToast({
                    tone: kind === 'destructive' ? 'warning' : 'success',
                    title: t('modal.toast.title'),
                    description: t('modal.toast.description'),
                  });
                  closeModal();
                }}
              >
                {t(copy.action)}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
