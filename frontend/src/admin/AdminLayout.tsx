import { NavLink, Outlet, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { adminLogout } from '../api/admin'
import type { Feature } from '../api/site'
import { useFeatures } from '../site/useSite'

const tabs: { to: string; key: string; feature?: Feature }[] = [
  { to: '/admin/orders', key: 'admin.nav.orders' },
  { to: '/admin/messages', key: 'admin.nav.messages' },
  { to: '/admin/reviews', key: 'admin.nav.reviews', feature: 'reviews' },
  { to: '/admin/settings', key: 'admin.nav.settings' },
  { to: '/admin/categories', key: 'admin.nav.categories' },
  { to: '/admin/dishes', key: 'admin.nav.dishes' },
  { to: '/admin/contacts', key: 'admin.nav.contacts' },
  { to: '/admin/reports', key: 'admin.nav.reports' },
  { to: '/admin/usage', key: 'admin.nav.usage' },
]

export function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const hasFeature = useFeatures()

  async function handleLogout() {
    await adminLogout().catch(() => undefined)
    navigate('/admin/login', { replace: true })
  }

  return (
    <>
      <header className="top-bar admin-bar">
        <span className="top-bar__brand">
          {t('app.name')} · {t('admin.title')}
        </span>
        <nav aria-label={t('admin.nav.label')}>
          <ul className="top-bar__links">
            {tabs.filter((tab) => !tab.feature || hasFeature(tab.feature)).map((tab) => (
              <li key={tab.to}>
                <NavLink to={tab.to} className="top-bar__link">
                  {t(tab.key)}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink to="/" className="top-bar__link">
                {t('admin.home')}
              </NavLink>
            </li>
            <li>
              <button type="button" className="button-quiet" onClick={handleLogout}>
                {t('admin.logout')}
              </button>
            </li>
          </ul>
        </nav>
      </header>
      <main className="page admin-page">
        <Outlet />
      </main>
    </>
  )
}
