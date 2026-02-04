import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './hooks/useAuthStore'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import AuditsPage from './pages/AuditsPage'
import AuditDetailPage from './pages/AuditDetailPage'
import MasterDataPage from './pages/MasterDataPage'
import SitesPage from './pages/SitesPage'
import ITAllocationPage from './pages/ITAllocationPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
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
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="audits" element={<AuditsPage />} />
          <Route path="audits/:auditId" element={<AuditDetailPage />} />
          <Route path="master-data" element={<MasterDataPage />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="it-allocation" element={<ITAllocationPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
