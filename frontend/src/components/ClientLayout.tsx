import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { AccountProvider } from '../account/AccountContext'
import { CartNavProvider } from './CartNavProvider'
import { Footer } from './Footer'
import { WhatsAppButton } from './WhatsAppButton'
import { LeaveGuardProvider } from './LeaveGuardProvider'
import { ScrollButtons } from './ScrollButtons'
import { TopBar } from './TopBar'
import { SiteProvider } from '../site/SiteContext'
import { useCorners, useSite, useSiteStyle } from '../site/useSite'
import { trackUsage } from '../usage/track'

/**
 * Marks the page with the site's style and corners (`<html data-style data-corners>`), which `styles/*.css` and
 * `--corner-scale` in index.css select on; the admin keeps its own look.
 */
function useStyleAttribute() {
  const style = useSiteStyle()
  const corners = useCorners()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.style = style
    root.dataset.corners = corners
    return () => {
      delete root.dataset.style
      delete root.dataset.corners
    }
  }, [style, corners])
}

function Shell() {
  const background = useSite()?.backgroundImageUrl
  useStyleAttribute()
  return (
    <div className="client-shell" style={background ? { backgroundImage: `url("${background}")` } : undefined}>
      <TopBar />
      <main className="page">
        <Outlet />
      </main>
      <Footer />
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
