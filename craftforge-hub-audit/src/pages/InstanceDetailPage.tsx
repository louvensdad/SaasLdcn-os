import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useInstance, useStartInstance, useStopInstance } from '@/hooks/useInstanceStatus'
import { Spinner } from '@/components/common/Spinner'
import { Badge } from '@/components/common/Badge'
import { ArrowLeft, Play, Stop, Desktop } from '@phosphor-icons/react'

export function InstanceDetailPage() {
  const { instanceId } = useParams<{ instanceId: string }>()
  const { t } = useTranslation()
  const { data: instance, isLoading } = useInstance(instanceId!)
  const startMutation = useStartInstance()
  const stopMutation = useStopInstance()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-xl">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!instance) {
    return <p className="text-text-secondary">{t('common_error')}</p>
  }

  const isOnline = instance.status === 'online'
  const isTransitioning = instance.status === 'starting' || instance.status === 'stopping'

  return (
    <div className="max-w-2xl mx-auto space-y-lg">
      <Link to="/dashboard" className="flex items-center gap-xs text-text-secondary hover:text-primary transition-colors text-body">
        <ArrowLeft size={16} />
        {t('common_back')}
      </Link>

      <div className="card p-lg">
        <div className="flex items-center justify-between mb-md">
          <div className="flex items-center gap-sm">
            <Desktop size={24} className={isOnline ? 'text-secondary' : 'text-text-muted'} />
            <h1 className="font-heading text-heading font-bold text-text-primary">{t('instances_detail_title')}</h1>
          </div>
          <Badge variant={isOnline ? 'online' : 'offline'}>
            {isOnline ? t('instances_online') : t('instances_offline')}
          </Badge>
        </div>

        <div className="space-y-sm mb-lg">
          <div className="flex gap-md">
            <span className="text-text-secondary text-body w-32">Conta:</span>
            <span className="text-text-primary">{instance.account_username}</span>
          </div>
          <div className="flex gap-md">
            <span className="text-text-secondary text-body w-32">Jogo:</span>
            <span className="text-text-primary">{instance.game}</span>
          </div>
          {isOnline && (
            <>
              <div className="flex gap-md">
                <span className="text-text-secondary text-body w-32">{t('common_fps')}:</span>
                <span className="text-text-primary font-mono">{instance.fps ?? '--'}</span>
              </div>
              <div className="flex gap-md">
                <span className="text-text-secondary text-body w-32">{t('common_ram')}:</span>
                <span className="text-text-primary font-mono">{instance.ram_mb ? `${instance.ram_mb} MB` : '--'}</span>
              </div>
              <div className="flex gap-md">
                <span className="text-text-secondary text-body w-32">{t('common_uptime')}:</span>
                <span className="text-text-primary font-mono">
                  {instance.uptime_seconds ? `${Math.floor(instance.uptime_seconds / 60)}min` : '--'}
                </span>
              </div>
              <div className="flex gap-md">
                <span className="text-text-secondary text-body w-32">{t('instances_detail_macros')}:</span>
                <Badge variant={instance.macro_running ? 'info' : 'offline'}>
                  {instance.macro_running ? 'Em execução' : 'Nenhuma'}
                </Badge>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-sm">
          {!isOnline && (
            <button
              className="btn-primary flex items-center gap-sm"
              onClick={() => startMutation.mutate(instance.id)}
              disabled={isTransitioning || startMutation.isPending}
            >
              {startMutation.isPending ? <Spinner size="sm" /> : <Play size={16} />}
              {t('instances_start')}
            </button>
          )}
          {isOnline && (
            <button
              className="btn-danger flex items-center gap-sm"
              onClick={() => stopMutation.mutate(instance.id)}
              disabled={isTransitioning || stopMutation.isPending}
            >
              {stopMutation.isPending ? <Spinner size="sm" /> : <Stop size={16} />}
              {t('instances_stop')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}