import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { Spinner } from '@/components/common/Spinner'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout'

// Lazy-loaded pages
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const AccountsListPage = lazy(() => import('./pages/AccountsListPage').then((m) => ({ default: m.AccountsListPage })))
const AccountDetailPage = lazy(() => import('./pages/AccountDetailPage').then((m) => ({ default: m.AccountDetailPage })))
const InstanceDetailPage = lazy(() => import('./pages/InstanceDetailPage').then((m) => ({ default: m.InstanceDetailPage })))
const MacrosListPage = lazy(() => import('./pages/MacrosListPage').then((m) => ({ default: m.MacrosListPage })))
const MacroDetailPage = lazy(() => import('./pages/MacroDetailPage').then((m) => ({ default: m.MacroDetailPage })))
const LogsListPage = lazy(() => import('./pages/LogsListPage').then((m) => ({ default: m.LogsListPage })))
const LogDetailPage = lazy(() => import('./pages/LogDetailPage').then((m) => ({ default: m.LogDetailPage })))
const AdminUsersListPage = lazy(() => import('./pages/AdminUsersListPage').then((m) => ({ default: m.AdminUsersListPage })))
const AdminUserDetailPage = lazy(() => import('./pages/AdminUserDetailPage').then((m) => ({ default: m.AdminUserDetailPage })))
const InstanceDashboard = lazy(() => import('./pages/InstanceDashboard').then((m) => ({ default: m.InstanceDashboard })))

const PageLoader = () => (
  <div className="flex items-center justify-center py-xl">
    <Spinner size="lg" />
  </div>
)

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Authenticated routes */}
        <Route
          element={
            <ProtectedRoute>
              <AuthenticatedLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/accounts" element={<AccountsListPage />} />
          <Route path="/accounts/:accountId" element={<AccountDetailPage />} />
          <Route path="/instances" element={<InstanceDashboard />} />
          <Route path="/instances/:instanceId" element={<InstanceDetailPage />} />
          <Route path="/macros" element={<MacrosListPage />} />
          <Route path="/macros/:macroId" element={<MacroDetailPage />} />
          <Route path="/logs" element={<LogsListPage />} />
          <Route path="/logs/:logId" element={<LogDetailPage />} />
        </Route>

        {/* Admin routes */}
        <Route
          element={
            <ProtectedRoute requireAdmin>
              <AuthenticatedLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/admin/users" element={<AdminUsersListPage />} />
          <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
        </Route>

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}