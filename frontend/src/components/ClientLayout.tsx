import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { useAccount } from '../account/useAccount'
import { AccountProvider } from '../account/AccountContext'
import { OrderSignalsProvider } from '../order/orderSignals'
import { AccessibilityMenu } from '../accessibility/AccessibilityMenu'
import { CartNavProvider } from './CartNavProvider'
import { InstallPrompt } from '../pwa/InstallPrompt'
import { EmergencyDialog } from './EmergencyDialog'
import { EntryPopup } from './EntryPopup'
import { Footer } from './Footer'
import { WhatsAppButton } from './WhatsAppButton'
import { LeaveGuardProvider } from './LeaveGuardProvider'
import { ScrollButtons } from './ScrollButtons'
import { TopBar } from './TopBar'
import { SiteProvider } from '../site/SiteContext'
import { useApplyColors } from '../site/useApplyColors'
import { saveTheme } from '../site/themeCache'
import { useColors, useCorners, useFinish, useSite, useSiteSettled, useSiteStyle } from '../site/useSite'
import { initMarketing, trackMarketing } from '../tracking/marketing'
import { trackUsage } from '../usage/track'

/**
 * Marks the page with the site's style, corners and finish (`<html data-style data-corners data-font data-shadows data-spacing>`), which `styles/*.css` and
 * `--corner-scale` in index.css select on; the admin keeps its own look. The palette and the admin's colours are set
 * as CSS variables on the same element (`site/palettes.ts`) and removed when the client pages unmount.
 */
function useStyleAttribute() {
  const style = useSiteStyle()
  const corners = useCorners()
  const { palette, customColors, lineWidth } = useColors()
  const { font, shadows, spacing, tileGroups, imageSize, rectPicture, mobileCards } = useFinish()
  const site = useSite()
  const settled = useSiteSettled()
  // Kept for the next visit, whose first paint (index.html) then already has the look the admin chose.
  useEffect(() => {
    if (site) saveTheme(site)
  }, [site])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.style = style
    root.dataset.corners = corners
    root.dataset.font = font
    root.dataset.shadows = shadows
    root.dataset.spacing = spacing
    root.dataset.tileGroups = tileGroups
    root.dataset.imageSize = imageSize
    root.dataset.rectPicture = rectPicture
    root.dataset.mobileCards = mobileCards
    return () => {
      delete root.dataset.style
      delete root.dataset.corners
      delete root.dataset.font
      delete root.dataset.shadows
      delete root.dataset.spacing
      delete root.dataset.tileGroups
      delete root.dataset.imageSize
      delete root.dataset.rectPicture
      delete root.dataset.mobileCards
    }
  }, [style, corners, font, shadows, spacing, tileGroups, imageSize, rectPicture, mobileCards])
  useApplyColors(palette, customColors, lineWidth)
  // A first visit has no saved look, so index.html keeps the page hidden until the real one is on <html> (see its script).
  useEffect(() => {
    if (settled) document.getElementById('theme-pending')?.remove()
  }, [settled])
}

/** Loads the marketing tools the owner connected (only those with an id) and tells them about each page the client opens. */
function useMarketing() {
  const tracking = useSite()?.tracking
  const { pathname } = useLocation()
  useEffect(() => {
    if (!tracking) return
    initMarketing(tracking)
    trackMarketing({ name: 'PageView', path: pathname })
  }, [tracking, pathname])
}

/** Shown while the business owner orders as a client: who the order is for, and a way to stop. */
function OwnerOrderBanner() {
  const { t } = useTranslation()
  const { user, logout } = useAccount()
  const navigate = useNavigate()
  if (!user?.openedByOwner) return null
  return (
    <div role="status" className="notice notice--warning owner-order-banner">
      <span>{t('order.ownerBanner', { name: user.fullName || user.phone })}</span>{' '}
      <button
        type="button"
        onClick={() => {
          void logout().then(() => navigate('/admin/clients'))
        }}
      >
        {t('order.ownerBannerDone')}
      </button>
    </div>
  )
}

function Shell() {
  const background = useSite()?.backgroundImageUrl
  useStyleAttribute()
  useMarketing()
  return (
    <div className="client-shell" style={background ? { backgroundImage: `url("${background}")` } : undefined}>
      <TopBar />
      <OwnerOrderBanner />
      <main className="page">
        <Outlet />
      </main>
      <Footer />
      <AccessibilityMenu />
      <EmergencyDialog />
      <EntryPopup />
      <InstallPrompt />
      <div className="fabs">
        <ScrollButtons />
        <WhatsAppButton />
      </div>
    </div>
  )
}

export function ClientLayout() {
  useEffect(() => trackUsage('Visit'), [])
  return (
    <SiteProvider>
      <AccountProvider>
        <LeaveGuardProvider>
          <CartNavProvider>
            <OrderSignalsProvider>
              <Shell />
            </OrderSignalsProvider>
          </CartNavProvider>
        </LeaveGuardProvider>
      </AccountProvider>
    </SiteProvider>
  )
}
