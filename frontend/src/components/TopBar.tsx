import { useLayoutEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAccount } from '../account/useAccount'
import type { Feature } from '../api/site'
import { site } from '../site/config'
import { useFeatures } from '../site/useSite'
import { useCartNav } from './cartNav'
import { useLeaveCheck } from './leaveGuard'
import { formatMoney } from '../order/format'
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
  const cart = useCartNav()
  const header = useRef<HTMLElement>(null)
  // Publishes the bar's height so things pinned below it (a dish group's pictures) start under it, not behind it.
  useLayoutEffect(() => {
    const element = header.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const update = () => root.style.setProperty('--top-bar-height', `${element.offsetHeight}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--top-bar-height')
    }
  }, [])
  async function signOut() {
    await logout()
    navigate('/')
  }
  return (
    <header className="top-bar" ref={header}>
      <NavLink to="/" className="top-bar__brand" onClick={(event) => { if (checkLeave('/')) event.preventDefault() }}>
        <span className="top-bar__logo" aria-hidden="true">{site.emoji}</span>
        {t('app.name')}
      </NavLink>
      <nav aria-label={t('nav.label')}>
        <ul className="top-bar__links">
          {cart && (
            <li>
              <button
                type="button"
                className="top-bar__cart"
                aria-label={cart.count > 0 ? t('order.cart.buttonCount', { count: cart.count }) : t('order.cart.button')}
                onClick={cart.open}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="9" cy="20" r="1.5" />
                  <circle cx="18" cy="20" r="1.5" />
                  <path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 7H6" />
                </svg>
                {cart.count > 0 && (
                  <>
                    <span key={cart.count} className="top-bar__cart-badge numeric" aria-hidden="true">
                      {cart.count}
                    </span>
                    <span className="top-bar__cart-total numeric" aria-hidden="true">
                      {formatMoney(cart.total)}
                    </span>
                  </>
                )}
              </button>
            </li>
          )}
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
