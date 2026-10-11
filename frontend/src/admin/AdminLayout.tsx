import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { adminLogout } from '../api/admin'
import type { Feature } from '../api/site'
import { useFeatures } from '../site/useSite'
import { useAdminSession } from './session'

type Tab = { to: string; key: string; feature?: Feature }

/** The admin's pages in three sections: the top bar picks a section, the row under it a page in that section. */
const sections: { key: string; tabs: Tab[] }[] = [
  {
    key: 'reports',
    tabs: [
      { to: '/admin/orders', key: 'admin.nav.orders' },
      { to: '/admin/reports', key: 'admin.nav.reports' },
      { to: '/admin/usage', key: 'admin.nav.usage' },
      { to: '/admin/audit', key: 'admin.nav.audit' },
    ],
  },
  {
    key: 'display',
    tabs: [
      { to: '/admin/dishes', key: 'admin.nav.dishes' },
      { to: '/admin/categories', key: 'admin.nav.categories' },
      { to: '/admin/appearance', key: 'admin.nav.appearance' },
      { to: '/admin/contacts', key: 'admin.nav.contacts' },
      { to: '/admin/reviews', key: 'admin.nav.reviews', feature: 'reviews' },
    ],
  },
  {
    key: 'site',
    tabs: [
      { to: '/admin/settings', key: 'admin.nav.settings' },
      { to: '/admin/messages', key: 'admin.nav.messages' },
    ],
  },
]

/** The section a page belongs to, by its path or the path of the page it opens from (such as /admin/dishes/12). */
function sectionOf(pathname: string) {
  return sections.find((section) => section.tabs.some((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`)))
}

export function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const hasFeature = useFeatures()
  const session = useAdminSession()
  const current = sectionOf(pathname)
  const visible = (tab: Tab) => !tab.feature || hasFeature(tab.feature)

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
            {sections.map((section) => (
              <li key={section.key}>
                <Link
                  to={section.tabs[0].to}
                  className={`top-bar__link${section === current ? ' active' : ''}`}
                  aria-current={section === current ? 'page' : undefined}
                >
                  {t(`admin.nav.sections.${section.key}`)}
                </Link>
              </li>
            ))}
            <li>
              <NavLink to="/" className="top-bar__link">
                {t('admin.home')}
              </NavLink>
            </li>
            <li className="admin-bar__who">{t(`admin.actors.${session.actor}`)}</li>
            <li>
              <button type="button" className="button-quiet" onClick={handleLogout}>
                {t('admin.logout')}
              </button>
            </li>
          </ul>
        </nav>
      </header>
      {current && (
        <nav className="admin-subnav" aria-label={t(`admin.nav.sections.${current.key}`)}>
          <ul>
            {current.tabs.filter(visible).map((tab) => (
              <li key={tab.to}>
                <NavLink to={tab.to} className="admin-subnav__link">
                  {t(tab.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <main className="page admin-page">
        <Outlet />
      </main>
    </>
  )
}
