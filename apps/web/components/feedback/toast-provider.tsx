'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useUiStore, type ToastMessage, type ToastTone } from '@/stores/use-ui-store';

const toneClass: Record<ToastTone, string> = {
  success: 'border-[color-mix(in_srgb,var(--success)_38%,transparent)]',
  warning: 'border-[color-mix(in_srgb,var(--warning)_38%,transparent)]',
  error: 'border-[color-mix(in_srgb,var(--danger)_38%,transparent)]',
  info: 'border-[color-mix(in_srgb,var(--accent)_34%,transparent)]',
};

function ToastIcon({ tone }: { readonly tone: ToastTone }) {
  const className = 'h-4 w-4';

  if (tone === 'success') return <CheckCircle2 className={cn(className, 'text-[color:var(--success)]')} />;
  if (tone === 'warning') return <AlertTriangle className={cn(className, 'text-[color:var(--warning)]')} />;
  if (tone === 'error') return <XCircle className={cn(className, 'text-[color:var(--danger)]')} />;
  return <Info className={cn(className, 'text-[color:var(--accent)]')} />;
}

function ToastItem({ toast }: { readonly toast: ToastMessage }) {
  const dismissToast = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    const timeout = window.setTimeout(() => dismissToast(toast.id), 5200);
    return () => window.clearTimeout(timeout);
  }, [dismissToast, toast.id]);

  return (
    <motion.div
      layout
      role="status"
      className={cn(
        'glass-panel-strong micro-interaction w-full rounded-[var(--radius-xl)] border p-4 shadow-[var(--shadow-cinematic)]',
        toneClass[toast.tone],
      )}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
    >
      <div className="flex gap-3">
        <span className="mt-0.5">
          <ToastIcon tone={toast.tone} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[color:var(--text)]">{toast.title}</p>
          {toast.description ? (
            <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{toast.description}</p>
          ) : null}
          {toast.action ? (
            <button
              type="button"
              className="mt-3 text-xs font-semibold text-[color:var(--accent)] hover:text-[color:var(--text)]"
              onClick={() => {
                toast.action?.onSelect();
                dismissToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-8 w-8 shrink-0 rounded-full p-0"
          onClick={() => dismissToast(toast.id)}
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  );
}

export function ToastProvider() {
  const toasts = useUiStore((state) => state.toasts);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3 sm:right-6 sm:top-6">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} />
          </div>
        ))}
      </AnimatePresence>
      {shouldReduceMotion ? null : <span className="sr-only">Animated toast stack active</span>}
    </div>
  );
}
