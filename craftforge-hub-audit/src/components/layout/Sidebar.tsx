import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Desktop,
  Scroll,
  FileText,
  ShieldCheck,
  SignOut,
  GameController,
} from '@phosphor-icons/react'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'

const navItems = [
  { path: '/dashboard', labelKey: 'nav_dashboard', icon: LayoutDashboard },
  { path: '/accounts', labelKey: 'nav_accounts', icon: Users },
  { path: '/instances', labelKey: 'nav_instances', icon: Desktop },
  { path: '/macros', labelKey: 'nav_macros', icon: Scroll },
  { path: '/logs', labelKey: 'nav_logs', icon: FileText },
]

const adminItems = [
  { path: '/admin/users', labelKey: 'nav_admin_users', icon: ShieldCheck },
]

interface SidebarProps {
  onLogout: () => void
}

export function Sidebar({ onLogout }: SidebarProps) {
  const { isAdmin } = useAuthStore()
  const { t } = useTranslation()

  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col h-screen">
      <div className="p-md flex items-center gap-sm border-b border-border">
        <GameController size={24} className="text-primary" />
        <span className="font-heading text-subheading font-bold text-text-primary">GameHub</span>
      </div>
      <nav className="flex-1 p-sm space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-sm px-sm py-xs rounded-md text-body transition-colors duration-150 ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:bg-neutral/20 hover:text-text-primary'
              }`
            }
          >
            <item.icon size={18} />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <div className="my-sm border-t border-border" />
            {adminItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-sm px-sm py-xs rounded-md text-body transition-colors duration-150 ${
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-text-secondary hover:bg-neutral/20 hover:text-text-primary'
                  }`
                }
              >
                <item.icon size={18} />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>
      <div className="p-sm border-t border-border">
        <button
          onClick={onLogout}
          className="flex items-center gap-sm w-full px-sm py-xs rounded-md text-body text-text-secondary hover:text-error hover:bg-error/10 transition-colors duration-150"
        >
          <SignOut size={18} />
          <span>{t('nav_logout')}</span>
        </button>
      </div>
    </aside>
  )
}