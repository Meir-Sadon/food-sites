import { useLayoutEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { adminLogout } from '../api/admin'
import { useFeatures } from '../site/useSite'
import { sections, sectionOf, type Tab } from './sections'
import { useAdminSession } from './session'
import { useAdminLook } from './useAdminLook'
import { UnsavedChangesProvider } from './UnsavedChangesProvider'
import { useAdminLeave } from './unsaved'

export function AdminLayout() {
  return (
    <UnsavedChangesProvider>
      <AdminFrame />
    </UnsavedChangesProvider>
  )
}

function AdminFrame() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const hasFeature = useFeatures()
  const session = useAdminSession()
  const leave = useAdminLeave()
  useAdminLook()
  const bar = useRef<HTMLElement>(null)
  // The side menu pins itself right under the sticky top bar, whatever height it wraps to.
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--admin-bars-height', `${el.offsetHeight}px`)
    set()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(set)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const current = sectionOf(pathname)
  const visible = (tab: Tab) => !tab.feature || hasFeature(tab.feature)

  async function handleLogout() {
    await adminLogout().catch(() => undefined)
    navigate('/admin/login', { replace: true })
  }

  return (
    <>
      <header className="top-bar admin-bar" ref={bar}>
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
              <button type="button" className="button-quiet" onClick={() => leave(handleLogout)}>
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
