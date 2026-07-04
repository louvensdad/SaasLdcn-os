'use client';

import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';

interface Props {
  /** Dialog heading, e.g. "Excluir sala de projeto". */
  readonly title: string;
  /** Dialog body explaining what is permanently removed. */
  readonly description: string;
  /** Trigger text; omit for an icon-only trigger (ariaLabel still names it). */
  readonly triggerLabel?: string;
  readonly ariaLabel?: string;
  readonly onConfirm: () => Promise<void>;
  readonly className?: string;
}

/** Trash trigger + confirmation dialog for destructive removals. Generic sibling
 * of ProjectDeleteButton for resources that don't carry their own mutation hook. */
export function DeleteResourceButton({ title, description, triggerLabel, ariaLabel, onConfirm, className }: Props) {
  const { t } = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => cancelRef.current?.focus(), 20);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) setOpen(false);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, pending]);

  useEffect(() => { if (!open) triggerRef.current?.focus(); }, [open]);
  const close = () => { if (!pending) setOpen(false); };

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])');
    if (!items?.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function confirmDelete() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('common.delete.error'));
    } finally {
      setPending(false);
    }
  }

  const dialog = open ? (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md" onMouseDown={close}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={`delete-title-${id}`} aria-describedby={`delete-description-${id}`} className="glass-panel-strong cinematic-surface w-full max-w-lg rounded-[var(--radius-xl)] border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] p-5 shadow-[var(--shadow-cinematic)]" onMouseDown={(event) => event.stopPropagation()} onKeyDown={trapFocus}>
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"><AlertTriangle className="h-5 w-5 text-[color:var(--danger)]" /></span>
          <div className="min-w-0 flex-1"><h2 id={`delete-title-${id}`} className="text-lg font-semibold text-[color:var(--text)]">{title}</h2><p id={`delete-description-${id}`} className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{description}</p></div>
          <Button type="button" variant="ghost" className="h-9 w-9 rounded-full p-0" onClick={close} disabled={pending} aria-label={t('common.delete.close')}><X className="h-4 w-4" /></Button>
        </div>
        {error ? <p role="alert" className="mt-4 text-sm text-[color:var(--danger)]">{error}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button ref={cancelRef} type="button" variant="secondary" onClick={close} disabled={pending}>{t('common.delete.cancel')}</Button><Button type="button" variant="danger" loading={pending} onClick={() => void confirmDelete()}><Trash2 className="h-4 w-4" />{pending ? t('common.delete.deleting') : t('common.delete.confirm')}</Button></div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        className={`text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[color:var(--danger)] ${className ?? ''}`}
        onClick={() => { setError(null); setOpen(true); }}
        aria-label={ariaLabel ?? triggerLabel ?? title}
        title={ariaLabel ?? triggerLabel ?? title}
      >
        <Trash2 className="h-4 w-4" />
        {triggerLabel}
      </Button>
      {typeof document !== 'undefined' && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
