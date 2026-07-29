'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { IconButton } from '@/components/ui/icon-button';
import { useLocale } from '@/hooks/use-locale';

interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Blocks closing (Escape / backdrop / X) while an action is in flight. */
  readonly busy?: boolean;
  readonly maxWidthClassName?: string;
}

/** Accessible portal dialog: backdrop, focus trap, Escape-to-close, restore
 * focus on unmount. Extracted from DeleteResourceButton's inline dialog so the
 * settings dialogs (sessions / 2FA / workspace members) share one implementation
 * instead of re-rolling the focus-trap boilerplate each time. */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  busy = false,
  maxWidthClassName = 'max-w-lg',
}: ModalProps) {
  const { t } = useLocale();
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    window.setTimeout(() => {
      const focusable = dialogRef.current?.querySelector<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 20);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) previouslyFocused.current?.focus();
  }, [open]);

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const items = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!items?.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open || typeof document === 'undefined') return null;

  const dialog = (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md"
      onMouseDown={() => { if (!busy) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`modal-title-${id}`}
        aria-describedby={description ? `modal-description-${id}` : undefined}
        className={`glass-panel-strong cinematic-surface w-full ${maxWidthClassName} rounded-[var(--radius-xl)] p-5 shadow-[var(--shadow-cinematic)]`}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={trapFocus}
      >
        <div className="flex items-start gap-4">
          {icon ? (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={`modal-title-${id}`} className="text-lg font-semibold text-[color:var(--text)]">{title}</h2>
            {description ? (
              <p id={`modal-description-${id}`} className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{description}</p>
            ) : null}
          </div>
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
            aria-label={t('common.delete.close')}
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="mt-5">{children}</div>
        {footer ? <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{footer}</div> : null}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
