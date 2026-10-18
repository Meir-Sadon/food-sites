import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { AccountProvider } from '../account/AccountContext'
import { AccessibilityMenu } from '../accessibility/AccessibilityMenu'
import { CartNavProvider } from './CartNavProvider'
import { Footer } from './Footer'
import { WhatsAppButton } from './WhatsAppButton'
import { LeaveGuardProvider } from './LeaveGuardProvider'
import { ScrollButtons } from './ScrollButtons'
import { TopBar } from './TopBar'
import { SiteProvider } from '../site/SiteContext'
import { useApplyColors } from '../site/useApplyColors'
import { useColors, useCorners, useFinish, useSite, useSiteStyle } from '../site/useSite'
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
  const { font, shadows, spacing, tileGroups } = useFinish()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.style = style
    root.dataset.corners = corners
    root.dataset.font = font
    root.dataset.shadows = shadows
    root.dataset.spacing = spacing
    root.dataset.tileGroups = tileGroups
    return () => {
      delete root.dataset.style
      delete root.dataset.corners
      delete root.dataset.font
      delete root.dataset.shadows
      delete root.dataset.spacing
      delete root.dataset.tileGroups
    }
  }, [style, corners, font, shadows, spacing, tileGroups])
  useApplyColors(palette, customColors, lineWidth)
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

function Shell() {
  const background = useSite()?.backgroundImageUrl
  useStyleAttribute()
  useMarketing()
  return (
    <div className="client-shell" style={background ? { backgroundImage: `url("${background}")` } : undefined}>
      <TopBar />
      <main className="page">
        <Outlet />
      </main>
      <Footer />
      <AccessibilityMenu />
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
            <Shell />
          </CartNavProvider>
        </LeaveGuardProvider>
      </AccountProvider>
    </SiteProvider>
  )
}
