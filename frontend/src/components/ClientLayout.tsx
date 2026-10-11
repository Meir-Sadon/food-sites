import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { AccountProvider } from '../account/AccountContext'
import { Footer } from './Footer'
import { WhatsAppButton } from './WhatsAppButton'
import { LeaveGuardProvider } from './LeaveGuardProvider'
import { ScrollButtons } from './ScrollButtons'
import { TopBar } from './TopBar'
import { SiteProvider } from '../site/SiteContext'
import { useSite, useSiteStyle } from '../site/useSite'

/** Marks the page with the site's style (`<html data-style>`), which `styles/*.css` select on; the admin keeps its own look. */
function useStyleAttribute() {
  const style = useSiteStyle()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.style = style
    return () => {
      delete root.dataset.style
    }
  }, [style])
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
  return (
    <SiteProvider>
      <AccountProvider>
        <LeaveGuardProvider>
          <Shell />
        </LeaveGuardProvider>
      </AccountProvider>
    </SiteProvider>
  )
}
