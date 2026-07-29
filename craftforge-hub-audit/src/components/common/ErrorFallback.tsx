import { useTranslation } from 'react-i18next'

interface ErrorFallbackProps {
  error: Error
  resetErrorBoundary?: () => void
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center p-xl text-center">
      <div className="text-error text-display mb-md">⚠</div>
      <h2 className="font-heading text-heading text-text-primary mb-sm">{t('common_error')}</h2>
      <p className="text-text-secondary text-body mb-lg max-w-md">{error.message}</p>
      {resetErrorBoundary && (
        <button className="btn-primary" onClick={resetErrorBoundary}>
          {t('common_retry')}
        </button>
      )}
    </div>
  )
}