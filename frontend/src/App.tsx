import { Navigate, Route, Routes } from 'react-router'
import { AdminHomePage } from './admin/AdminHomePage'
import { AdminLoginPage } from './admin/AdminLoginPage'
import { RequireAdmin } from './admin/RequireAdmin'
import { ClientLayout } from './components/ClientLayout'
import { LoginPage } from './pages/LoginPage'
import { OrderPage } from './pages/OrderPage'
import { ProfilePage } from './pages/ProfilePage'
import { RecommendationsPage } from './pages/RecommendationsPage'

export function App() {
  return (
    <Routes>
      <Route element={<ClientLayout />}>
        <Route index element={<OrderPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="recommendations" element={<RecommendationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* Admin area: not linked from the client site. */}
      <Route path="admin/login" element={<AdminLoginPage />} />
      <Route
        path="admin"
        element={
          <RequireAdmin>
            <AdminHomePage />
          </RequireAdmin>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
