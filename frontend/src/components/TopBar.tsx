import { NavLink, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAccount } from '../account/useAccount'
import { useLeaveCheck } from './leaveGuard'

const links = [
  { to: '/', key: 'nav.order', end: true },
  { to: '/login', key: 'nav.login', end: false },
  { to: '/recommendations', key: 'nav.recommendations', end: false },
  { to: '/profile', key: 'nav.profile', end: false },
  { to: '/about', key: 'nav.about', end: false },
] as const

export function TopBar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const checkLeave = useLeaveCheck()
  const { user, logout } = useAccount()
  return (
    <header className="top-bar">
      <span className="top-bar__brand">{t('app.name')}</span>
      <nav aria-label={t('nav.label')}>
        <ul className="top-bar__links">
          {links.map((link) => (
            <li key={link.to}>
              {link.to === '/login' && user ? (
                // Logged in: the login button becomes the way out.
                <button
                  type="button"
                  className="top-bar__link"
                  onClick={async () => {
                    if (checkLeave('/')) return
                    await logout()
                    navigate('/')
                  }}
                >
                  {t('account.logout')}
                </button>
              ) : (
                <NavLink
                  to={link.to}
                  end={link.end}
                  className="top-bar__link"
                  onClick={(event) => {
                    if (checkLeave(link.to)) event.preventDefault()
                  }}
                >
                  {t(link.key)}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
