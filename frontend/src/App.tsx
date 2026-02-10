import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './hooks/useAuthStore'
import { usePermissions } from './hooks/usePermissions'
import { normalizeRole } from './config/permissions'
import { getDefaultRouteForRole } from './config/navigation'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import AuditsPage from './pages/AuditsPage'
import AuditDetailPage from './pages/AuditDetailPage'
import MasterDataPage from './pages/MasterDataPage'
import SitesPage from './pages/SitesPage'
import ITAllocationPage from './pages/ITAllocationPage'
import ScanAuditPage from './pages/ScanAuditPage'
import PBIImportPage from './pages/PBIImportPage'
import AuditorWizardPage from './pages/auditor/AuditorWizardPage'
import VariancesPage from './pages/VariancesPage'
import UserManagementPage from './pages/UserManagementPage'
import SettingsPage from './pages/SettingsPage'

/**
 * Protected route that requires authentication.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

/**
 * Route guard that checks role-based permissions.
 */
function RoleGuard({
  children,
  allowedRoles,
}: {
  children: React.ReactNode
  allowedRoles: ('admin' | 'super_user' | 'auditor')[]
}) {
  const { user } = useAuthStore()
  const { getDefaultRoute } = usePermissions()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const normalizedRole = normalizeRole(user.role)

  if (!allowedRoles.includes(normalizedRole)) {
    // Redirect to user's default page if not authorized
    return <Navigate to={getDefaultRoute()} replace />
  }

  return <>{children}</>
}

/**
 * Redirect to the appropriate default route based on user role.
 */
function RoleBasedRedirect() {
  const { user } = useAuthStore()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const defaultRoute = getDefaultRouteForRole(user.role)
  return <Navigate to={defaultRoute} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Role-based default redirect */}
          <Route index element={<RoleBasedRedirect />} />

          {/* Admin + Super User routes */}
          <Route
            path="dashboard"
            element={
              <RoleGuard allowedRoles={['admin', 'super_user']}>
                <DashboardPage />
              </RoleGuard>
            }
          />
          <Route
            path="upload"
            element={
              <RoleGuard allowedRoles={['admin', 'super_user']}>
                <UploadPage />
              </RoleGuard>
            }
          />
          <Route
            path="audits"
            element={
              <RoleGuard allowedRoles={['admin', 'super_user']}>
                <AuditsPage />
              </RoleGuard>
            }
          />
          <Route
            path="audits/:auditId"
            element={
              <RoleGuard allowedRoles={['admin', 'super_user', 'auditor']}>
                <AuditDetailPage />
              </RoleGuard>
            }
          />
          <Route
            path="master-data"
            element={
              <RoleGuard allowedRoles={['admin', 'super_user']}>
                <MasterDataPage />
              </RoleGuard>
            }
          />
          <Route
            path="it-allocation"
            element={
              <RoleGuard allowedRoles={['admin', 'super_user']}>
                <ITAllocationPage />
              </RoleGuard>
            }
          />
          <Route
            path="pbi-import"
            element={
              <RoleGuard allowedRoles={['admin', 'super_user']}>
                <PBIImportPage />
              </RoleGuard>
            }
          />

          {/* Admin only routes */}
          <Route
            path="sites"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <SitesPage />
              </RoleGuard>
            }
          />
          <Route
            path="users"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <UserManagementPage />
              </RoleGuard>
            }
          />
          <Route
            path="settings"
            element={
              <RoleGuard allowedRoles={['admin']}>
                <SettingsPage />
              </RoleGuard>
            }
          />

          {/* All authenticated users (scan audit) */}
          <Route
            path="scan-audit"
            element={
              <RoleGuard allowedRoles={['admin', 'super_user', 'auditor']}>
                <ScanAuditPage />
              </RoleGuard>
            }
          />

          {/* Auditor wizard routes */}
          <Route
            path="my-audits"
            element={
              <RoleGuard allowedRoles={['admin', 'super_user', 'auditor']}>
                <AuditorWizardPage />
              </RoleGuard>
            }
          />
          <Route
            path="variances"
            element={
              <RoleGuard allowedRoles={['admin', 'super_user', 'auditor']}>
                <VariancesPage />
              </RoleGuard>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
