import { useAuthStore } from '@/store/authStore'
import { useWebSocketStore } from '@/store/webSocketStore'
import { useTranslation } from 'react-i18next'
import { WifiHigh, WifiSlash, UserCircle } from '@phosphor-icons/react'

export function Header() {
  const { user } = useAuthStore()
  const { connected } = useWebSocketStore()
  const { t } = useTranslation()

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-lg">
      <div className="flex items-center gap-md">
        <span className="font-heading text-subheading font-semibold text-text-primary">
          {t('dashboard_title')}
        </span>
        {connected ? (
          <span className="flex items-center gap-xs text-secondary text-caption">
            <WifiHigh size={14} />
            Online
          </span>
        ) : (
          <span className="flex items-center gap-xs text-error text-caption">
            <WifiSlash size={14} />
            {t('websocket_disconnected')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-sm">
        <UserCircle size={22} className="text-text-muted" />
        <span className="text-body text-text-secondary">{user?.name || user?.email || ''}</span>
        {user?.role === 'admin' && (
          <span className="badge-admin text-caption ml-xs">{t('common_role_admin')}</span>
        )}
      </div>
    </header>
  )
}