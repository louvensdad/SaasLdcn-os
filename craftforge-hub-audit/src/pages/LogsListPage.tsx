import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLogs } from '@/hooks/useLogs'
import { useInstances } from '@/hooks/useInstanceStatus'
import { useMacros } from '@/hooks/useMacros'
import { Spinner } from '@/components/common/Spinner'
import { SkeletonTable } from '@/components/common/SkeletonCard'
import { EmptyState } from '@/components/common/EmptyState'
import { Badge } from '@/components/common/Badge'
import { FileText, MagnifyingGlass, X } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import type { LogFilters } from '@/services/logService'
import { useDebounce } from '@/hooks/useDebounce'

export function LogsListPage() {
  const { t } = useTranslation()
  const { data: instances } = useInstances()
  const { data: macros } = useMacros()
  const [filters, setFilters] = useState<LogFilters>({})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 400)

  const effectiveFilters = { ...filters, search: debouncedSearch || undefined }
  const { data: logs, isLoading } = useLogs(effectiveFilters)

  const clearFilters = useCallback(() => {
    setFilters({})
    setSearch('')
  }, [])

  const hasFilters = !!filters.instance_id || !!filters.macro_id || !!filters.result || !!debouncedSearch

  if (isLoading) {
    return (
      <div>
        <h1 className="font-heading text-heading font-bold text-text-primary mb-lg">{t('logs_title')}</h1>
        <SkeletonTable rows={6} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-lg">
        <h1 className="font-heading text-heading font-bold text-text-primary">{t('logs_title')}</h1>
      </div>

      {/* Filters */}
      <div className="card p-md mb-lg">
        <div className="flex flex-wrap gap-md items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-caption text-text-secondary mb-xs">{t('common_search')}</label>
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-sm top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                className="input-field w-full pl-xl"
                placeholder={t('logs_filter_search_placeholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-caption text-text-secondary mb-xs">{t('logs_filter_instance')}</label>
            <select
              className="input-field"
              value={filters.instance_id || ''}
              onChange={(e) => setFilters((f) => ({ ...f, instance_id: e.target.value || undefined }))}
            >
              <option value="">Todos</option>
              {instances?.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.account_username}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-caption text-text-secondary mb-xs">{t('logs_filter_macro')}</label>
            <select
              className="input-field"
              value={filters.macro_id || ''}
              onChange={(e) => setFilters((f) => ({ ...f, macro_id: e.target.value || undefined }))}
            >
              <option value="">Todos</option>
              {macros?.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-caption text-text-secondary mb-xs">{t('logs_filter_result')}</label>
            <select
              className="input-field"
              value={filters.result || ''}
              onChange={(e) => setFilters((f) => ({ ...f, result: (e.target.value as 'success' | 'failure') || undefined }))}
            >
              <option value="">Todos</option>
              <option value="success">{t('logs_result_success')}</option>
              <option value="failure">{t('logs_result_failure')}</option>
            </select>
          </div>
          {hasFilters && (
            <button className="btn-secondary flex items-center gap-xs" onClick={clearFilters}>
              <X size={14} />
              {t('logs_filter_clear')}
            </button>
          )}
        </div>
      </div>

      {/* Logs list */}
      {logs && logs.length > 0 ? (
        <div className="space-y-sm">
          {logs.map((log) => (
            <Link
              key={log.id}
              to={`/logs/${log.id}`}
              className="card-hover p-md flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-sm">
                  <FileText size={16} className="text-text-muted" />
                  <span className="text-body font-medium text-text-primary">{log.macro_name}</span>
                  <span className="text-caption text-text-muted">{log.account_username}</span>
                </div>
                <p className="text-caption text-text-muted mt-xs">
                  {new Date(log.started_at).toLocaleString('pt-BR')}
                </p>
              </div>
              <Badge variant={log.result === 'success' ? 'success' : 'failure'}>
                {log.result === 'success' ? t('logs_result_success') : t('logs_result_failure')}
              </Badge>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FileText size={48} />}
          title={t('logs_empty')}
          description={hasFilters ? t('common_no_results').replace('{{term}}', '') : undefined}
          action={
            !hasFilters ? (
              <a href="/macros" className="btn-primary">
                {t('logs_empty_action')}
              </a>
            ) : undefined
          }
        />
      )}
    </div>
  )
}