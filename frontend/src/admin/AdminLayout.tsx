import { NavLink, Outlet, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { adminLogout } from '../api/admin'

const tabs = [
  { to: '/admin/settings', key: 'admin.nav.settings' },
  { to: '/admin/categories', key: 'admin.nav.categories' },
  { to: '/admin/dishes', key: 'admin.nav.dishes' },
] as const

export function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()

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
            {tabs.map((tab) => (
              <li key={tab.to}>
                <NavLink to={tab.to} className="top-bar__link">
                  {t(tab.key)}
                </NavLink>
              </li>
            ))}
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
