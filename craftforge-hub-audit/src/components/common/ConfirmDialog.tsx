import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useTranslation } from 'react-i18next'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-fade-in" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface border border-border rounded-lg shadow-card p-xl max-w-md w-full data-[state=open]:animate-slide-in">
          <AlertDialog.Title className="font-heading text-heading font-semibold text-text-primary">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-sm text-body text-text-secondary">
            {description}
          </AlertDialog.Description>
          <div className="mt-lg flex justify-end gap-sm">
            <AlertDialog.Cancel asChild>
              <button className="btn-secondary" disabled={loading}>
                {cancelLabel || t('common_cancel')}
              </button>
            </AlertDialog.Cancel>
            <button
              className={variant === 'danger' ? 'btn-danger' : 'btn-primary'}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-xs">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {confirmLabel || t('common_confirm')}
                </span>
              ) : (
                confirmLabel || t('common_confirm')
              )}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}