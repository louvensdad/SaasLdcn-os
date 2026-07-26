import { useTranslation } from 'react-i18next'
import { useInstances, useStartAllInstances } from '@/hooks/useInstanceStatus'
import { useAccounts } from '@/hooks/useAccounts'
import { useMacros } from '@/hooks/useMacros'
import { useLogs } from '@/hooks/useLogs'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Spinner } from '@/components/common/Spinner'
import { SkeletonCard } from '@/components/common/SkeletonCard'
import { EmptyState } from '@/components/common/EmptyState'
import { Badge } from '@/components/common/Badge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { InstanceResponse, WsMessage } from '@/types/api'
import { Play, Stop, Desktop, Users, Scroll, FileText } from '@phosphor-icons/react'

export function DashboardPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showStartAllConfirm, setShowStartAllConfirm] = useState(false)
  const { data: instances, isLoading: instancesLoading } = useInstances()
  const { data: accounts } = useAccounts()
  const { data: macros } = useMacros()
  const { data: logs } = useLogs({ limit: 5 } as any)
  const startAllMutation = useStartAllInstances()

  // WebSocket updates instances cache
  useWebSocket({
    onInstanceStatus: (msg: WsMessage) => {
      queryClient.setQueryData<InstanceResponse[]>(['instances'], (old) => {
        if (!old) return old
        return old.map((inst) =>
          inst.id === (msg as any).instance_id
            ? { ...inst, status: (msg as any).status, fps: (msg as any).fps, ram_mb: (msg as any).ram_mb, uptime_seconds: (msg as any).uptime_seconds, macro_running: (msg as any).macro_running }
            : inst,
        )
      })
    },
  })

  const onlineInstances = instances?.filter((i) => i.status === 'online') || []
  const offlineInstances = instances?.filter((i) => i.status === 'offline') || []

  if (instancesLoading) {
    return (
      <div className="space-y-lg">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-md">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-lg">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-md">
        <div className="card p-md">
          <div className="flex items-center gap-sm text-secondary mb-xs">
            <Desktop size={20} />
            <span className="text-body font-medium">{t('dashboard_active_instances')}</span>
          </div>
          <p className="text-display font-bold">{onlineInstances.length}</p>
        </div>
        <div className="card p-md">
          <div className="flex items-center gap-sm text-text-secondary mb-xs">
            <Desktop size={20} />
            <span className="text-body font-medium">{t('dashboard_total_instances')}</span>
          </div>
          <p className="text-display font-bold">{instances?.length || 0}</p>
        </div>
        <div className="card p-md">
          <div className="flex items-center gap-sm text-primary mb-xs">
            <Users size={20} />
            <span className="text-body font-medium">{t('dashboard_accounts_count')}</span>
          </div>
          <p className="text-display font-bold">{accounts?.length || 0}</p>
        </div>
        <div className="card p-md">
          <div className="flex items-center gap-sm text-accent mb-xs">
            <Scroll size={20} />
            <span className="text-body font-medium">{t('dashboard_macros_count')}</span>
          </div>
          <p className="text-display font-bold">{macros?.length || 0}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-sm items-center">
        <button
          className="btn-primary flex items-center gap-sm"
          onClick={() => setShowStartAllConfirm(true)}
          disabled={offlineInstances.length === 0 || startAllMutation.isPending}
        >
          {startAllMutation.isPending ? (
            <Spinner size="sm" />
          ) : (
            <Play size={16} />
          )}
          {t('dashboard_start_all')}
        </button>
      </div>

      {/* Instances summary */}
      <div>
        <h2 className="font-heading text-heading font-semibold text-text-primary mb-md">{t('instances_title')}</h2>
        {instances && instances.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {instances.slice(0, 6).map((inst) => (
              <div key={inst.id} className={`card p-md border-l-4 ${inst.status === 'online' ? 'border-l-secondary' : 'border-l-neutral'}`}>
                <div className="flex items-center justify-between mb-sm">
                  <span className="text-body font-medium text-text-primary">{inst.account_username}</span>
                  <Badge variant={inst.status === 'online' ? 'online' : 'offline'}>
                    {inst.status === 'online' ? t('instances_online') : t('instances_offline')}
                  </Badge>
                </div>
                {inst.status === 'online' && (
                  <div className="flex gap-md text-caption text-text-secondary">
                    <span>{t('common_fps')}: {inst.fps ?? '--'}</span>
                    <span>{t('common_ram')}: {inst.ram_mb ? `${inst.ram_mb}MB` : '--'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Desktop size={40} />}
            title={t('instances_empty')}
            action={
              <a href="/accounts" className="btn-primary">
                {t('instances_empty_action')}
              </a>
            }
          />
        )}
      </div>

      {/* Recent logs */}
      <div>
        <h2 className="font-heading text-heading font-semibold text-text-primary mb-md">{t('dashboard_recent_logs')}</h2>
        {logs && logs.length > 0 ? (
          <div className="card p-md space-y-sm">
            {logs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-xs border-b border-border last:border-0">
                <div className="flex items-center gap-sm">
                  <FileText size={16} className="text-text-muted" />
                  <span className="text-body text-text-secondary">{log.macro_name}</span>
                  <span className="text-caption text-text-muted">{log.account_username}</span>
                </div>
                <Badge variant={log.result === 'success' ? 'success' : 'failure'}>
                  {log.result === 'success' ? t('logs_result_success') : t('logs_result_failure')}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText size={40} />}
            title={t('logs_empty')}
            action={
              <a href="/macros" className="btn-primary">
                {t('logs_empty_action')}
              </a>
            }
          />
        )}
      </div>

      <ConfirmDialog
        open={showStartAllConfirm}
        onOpenChange={setShowStartAllConfirm}
        title={t('instances_start_all')}
        description={t('instances_start_all_confirm')}
        variant="primary"
        confirmLabel={t('common_yes')}
        onConfirm={() => {
          startAllMutation.mutate()
          setShowStartAllConfirm(false)
        }}
        loading={startAllMutation.isPending}
      />
    </div>
  )
}