'use client';

import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useDeleteProject } from '@/hooks/use-projects';
import { useLocale } from '@/hooks/use-locale';
import { getApiErrorMessage } from '@/lib/api/errors';

interface Props { readonly projectId: string; readonly projectName: string; readonly onDeleted?: () => void }

export function ProjectDeleteButton({ projectId, projectName, onDeleted }: Props) {
  const { t } = useLocale();
  const mutation = useDeleteProject(projectId);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => cancelRef.current?.focus(), 20);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !mutation.isPending) setOpen(false);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [mutation.isPending, open]);

  useEffect(() => { if (!open) triggerRef.current?.focus(); }, [open]);
  const close = () => { if (!mutation.isPending) setOpen(false); };

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
    try {
      await mutation.mutateAsync();
      setOpen(false);
      onDeleted?.();
    } catch { /* Error remains visible in the dialog. */ }
  }

  const dialog = open ? (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md" onMouseDown={close}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={`delete-title-${projectId}`} aria-describedby={`delete-description-${projectId}`} className="glass-panel-strong cinematic-surface w-full max-w-lg rounded-[var(--radius-xl)] border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] p-5 shadow-[var(--shadow-cinematic)]" onMouseDown={(event) => event.stopPropagation()} onKeyDown={trapFocus}>
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"><AlertTriangle className="h-5 w-5 text-[color:var(--danger)]" /></span>
          <div className="min-w-0 flex-1"><h2 id={`delete-title-${projectId}`} className="text-lg font-semibold text-[color:var(--text)]">{t('projects.delete.title')}</h2><p id={`delete-description-${projectId}`} className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('projects.delete.description', { name: projectName })}</p></div>
          <Button type="button" variant="ghost" className="h-9 w-9 rounded-full p-0" onClick={close} disabled={mutation.isPending} aria-label={t('projects.delete.close')}><X className="h-4 w-4" /></Button>
        </div>
        <div className="mt-5 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3 text-xs leading-5 text-[color:var(--muted)]">{t('projects.delete.warning')}</div>
        {mutation.isError ? <p role="alert" className="mt-4 text-sm text-[color:var(--danger)]">{getApiErrorMessage(mutation.error, t('projects.delete.error'))}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button ref={cancelRef} type="button" variant="secondary" onClick={close} disabled={mutation.isPending}>{t('projects.delete.cancel')}</Button><Button type="button" variant="danger" loading={mutation.isPending} onClick={() => void confirmDelete()}><Trash2 className="h-4 w-4" />{mutation.isPending ? t('projects.delete.deleting') : t('projects.delete.confirm')}</Button></div>
      </div>
    </div>
  ) : null;

  return <><Button ref={triggerRef} type="button" variant="ghost" className="text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[color:var(--danger)]" onClick={() => { mutation.reset(); setOpen(true); }}><Trash2 className="h-4 w-4" />{t('projects.delete.trigger')}</Button>{typeof document !== 'undefined' && dialog ? createPortal(dialog, document.body) : null}</>;
}
