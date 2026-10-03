import { Navigate, Route, Routes } from 'react-router'
import { AdminLayout } from './admin/AdminLayout'
import { AdminLoginPage } from './admin/AdminLoginPage'
import { RequireAdmin } from './admin/RequireAdmin'
import { CategoriesPage } from './admin/categories/CategoriesPage'
import { DishFormPage } from './admin/dishes/DishFormPage'
import { DishesPage } from './admin/dishes/DishesPage'
import { SettingsPage } from './admin/settings/SettingsPage'
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
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<Navigate to="settings" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="dishes" element={<DishesPage />} />
        <Route path="dishes/new" element={<DishFormPage key="new" />} />
        <Route path="dishes/:id" element={<DishFormPage key="edit" />} />
        <Route path="*" element={<Navigate to="settings" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
