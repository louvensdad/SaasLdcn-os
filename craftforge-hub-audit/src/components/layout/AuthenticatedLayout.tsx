import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useLogout } from '@/hooks/useAuth'
import { ErrorBoundary } from 'react-error-boundary'
import { ErrorFallback } from '@/components/common/ErrorFallback'

export function AuthenticatedLayout() {
  const logout = useLogout()
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar onLogout={logout} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-lg bg-surface-alt">
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}