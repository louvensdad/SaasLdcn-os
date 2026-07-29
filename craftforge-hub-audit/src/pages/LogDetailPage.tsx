import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLog } from '@/hooks/useLogs'
import { Spinner } from '@/components/common/Spinner'
import { Badge } from '@/components/common/Badge'
import { ArrowLeft, FileText } from '@phosphor-icons/react'

export function LogDetailPage() {
  const { logId } = useParams<{ logId: string }>()
  const { t } = useTranslation()
  const { data: log, isLoading } = useLog(logId!)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-xl">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!log) {
    return <p className="text-text-secondary">{t('common_error')}</p>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/logs" className="flex items-center gap-xs text-text-secondary hover:text-primary transition-colors text-body mb-lg">
        <ArrowLeft size={16} />
        {t('common_back')}
      </Link>

      <div className="card p-lg">
        <div className="flex items-center gap-sm mb-md">
          <FileText size={24} className="text-text-muted" />
          <h1 className="font-heading text-heading font-bold text-text-primary">{t('logs_detail_title')}</h1>
        </div>
        <div className="space-y-sm">
          <div className="flex gap-md">
            <span className="text-text-secondary text-body w-32">{t('logs_detail_macro')}:</span>
            <span className="text-text-primary">{log.macro_name}</span>
          </div>
          <div className="flex gap-md">
            <span className="text-text-secondary text-body w-32">{t('logs_detail_instance')}:</span>
            <span className="text-text-primary">{log.account_username}</span>
          </div>
          <div className="flex gap-md">
            <span className="text-text-secondary text-body w-32">{t('logs_detail_timestamp')}:</span>
            <span className="text-text-primary">{new Date(log.started_at).toLocaleString('pt-BR')}</span>
          </div>
          <div className="flex gap-md">
            <span className="text-text-secondary text-body w-32">{t('logs_detail_result')}:</span>
            <Badge variant={log.result === 'success' ? 'success' : 'failure'}>
              {log.result === 'success' ? t('logs_result_success') : t('logs_result_failure')}
            </Badge>
          </div>
          {log.output && (
            <div>
              <span className="text-text-secondary text-body block mb-xs">{t('logs_detail_output')}:</span>
              <pre className="bg-surface-alt border border-border rounded-md p-sm text-caption text-text-secondary overflow-x-auto max-h-48">
                {log.output}
              </pre>
            </div>
          )}
          {log.error_message && (
            <div>
              <span className="text-text-secondary text-body block mb-xs">{t('logs_detail_error')}:</span>
              <pre className="bg-error/10 border border-error/30 rounded-md p-sm text-caption text-error overflow-x-auto max-h-48">
                {log.error_message}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}