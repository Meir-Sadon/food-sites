import { Navigate, Route, Routes } from 'react-router'
import { AdminLayout } from './admin/AdminLayout'
import { AdminLoginPage } from './admin/AdminLoginPage'
import { AuditPage } from './admin/audit/AuditPage'
import { ClientsPage } from './admin/clients/ClientsPage'
import { RequireAdmin } from './admin/RequireAdmin'
import { CategoriesPage } from './admin/categories/CategoriesPage'
import { DishGroupsPage } from './admin/dish-groups/DishGroupsPage'
import { ContactsPage } from './admin/contacts/ContactsPage'
import { DishFormPage } from './admin/dishes/DishFormPage'
import { DishesPage } from './admin/dishes/DishesPage'
import { FeedbackPage } from './admin/feedback/FeedbackPage'
import { OrderViewPage } from './admin/orders/OrderViewPage'
import { OrdersPage } from './admin/orders/OrdersPage'
import { MessagesPage } from './admin/messages/MessagesPage'
import { ReportsPage } from './admin/reports/ReportsPage'
import { ReviewsPage } from './admin/reviews/ReviewsPage'
import { RoutePage } from './admin/route/RoutePage'
import { AppearancePage } from './admin/settings/AppearancePage'
import { SocialPage } from './admin/settings/SocialPage'
import { PopupPage } from './admin/settings/PopupPage'
import { SettingsPage } from './admin/settings/SettingsPage'
import { UsagePage } from './admin/usage/UsagePage'
import { ClientLayout } from './components/ClientLayout'
import { RequireFeature } from './components/RequireFeature'
import { useScrollToInvalid } from './components/scrollToInvalid'
import { ToastProvider } from './components/ToastProvider'
import { DriverPage, DriverStops } from './driver/DriverPage'
import { DriverStopPage } from './driver/DriverStopPage'
import { AboutPage } from './pages/AboutPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { AccessibilityStatementPage } from './pages/AccessibilityStatementPage'
import { LoginPage } from './pages/LoginPage'
import { OrderPage } from './pages/OrderPage'
import { ProfilePage } from './pages/ProfilePage'
import { RecommendationsPage } from './pages/RecommendationsPage'
import { ReviewPage } from './pages/ReviewPage'

export function App() {
  useScrollToInvalid()
  return (
    <ToastProvider>
      <Routes>
        <Route element={<ClientLayout />}>
          <Route index element={<OrderPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route
            path="recommendations"
            element={
              <RequireFeature feature="recommendations">
                <RecommendationsPage />
              </RequireFeature>
            }
          />
          <Route
            path="r/:token"
            element={
              <RequireFeature feature="reviews">
                <ReviewPage />
              </RequireFeature>
            }
          />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="accessibility" element={<AccessibilityStatementPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
        </Route>

        {/* The driver's page behind the link from the driver's report: the link is its only key. */}
        <Route path="d/:token" element={<DriverPage />}>
          <Route index element={<DriverStops />} />
          <Route path=":orderId" element={<DriverStopPage />} />
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
          <Route path="appearance" element={<AppearancePage />} />
          <Route path="popup" element={<PopupPage />} />
          <Route path="social" element={<SocialPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="dish-groups" element={<DishGroupsPage />} />
          <Route path="dishes" element={<DishesPage />} />
          <Route path="dishes/new" element={<DishFormPage key="new" />} />
          <Route path="dishes/:id" element={<DishFormPage key="edit" />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/route" element={<RoutePage />} />
          <Route path="orders/:id" element={<OrderViewPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="feedback" element={<FeedbackPage />} />
          <Route
            path="reviews"
            element={
              <RequireFeature feature="reviews" to="/admin/orders">
                <ReviewsPage />
              </RequireFeature>
            }
          />
          <Route path="*" element={<Navigate to="settings" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}
