import { NavLink, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAccount } from '../account/useAccount'
import type { Feature } from '../api/site'
import { site } from '../site/config'
import { useFeatures } from '../site/useSite'
import { useLeaveCheck } from './leaveGuard'
import { NavIcon, type NavIconName } from './NavIcons'

const links: readonly { to: string; key: string; icon: NavIconName; end: boolean; feature?: Feature }[] = [
  { to: '/', key: 'nav.order', icon: 'order', end: true },
  { to: '/login', key: 'nav.login', icon: 'login', end: false },
  { to: '/recommendations', key: 'nav.recommendations', icon: 'recommendations', end: false, feature: 'recommendations' },
  { to: '/profile', key: 'nav.profile', icon: 'profile', end: false },
  { to: '/about', key: 'nav.about', icon: 'about', end: false },
]

export function TopBar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const checkLeave = useLeaveCheck()
  const { user, logout } = useAccount()
  const isOn = useFeatures()
  async function signOut() {
    await logout()
    navigate('/')
  }
  return (
    <header className="top-bar">
      <NavLink to="/" className="top-bar__brand" onClick={(event) => { if (checkLeave('/')) event.preventDefault() }}>
        <span className="top-bar__logo" aria-hidden="true">{site.emoji}</span>
        {t('app.name')}
      </NavLink>
      <nav aria-label={t('nav.label')}>
        <ul className="top-bar__links">
          {links.filter((link) => !link.feature || isOn(link.feature)).map((link) => (
            <li key={link.to}>
              {link.to === '/login' && user ? (
                // Logged in: the login button becomes the way out.
                <button
                  type="button"
                  className="top-bar__link top-bar__link--logout"
                  aria-label={t('account.logout')}
                  title={t('account.logout')}
                  onClick={() => {
                    if (checkLeave('/', signOut)) return
                    void signOut()
                  }}
                >
                  <NavIcon name="logout" />
                </button>
              ) : (
                <NavLink
                  to={link.to}
                  end={link.end}
                  className="top-bar__link"
                  aria-label={t(link.key)}
                  title={t(link.key)}
                  onClick={(event) => {
                    if (checkLeave(link.to)) event.preventDefault()
                  }}
                >
                  <NavIcon name={link.icon} />
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
