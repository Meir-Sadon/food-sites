import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { AccountProvider } from '../account/AccountContext'
import { Footer } from './Footer'
import { WhatsAppButton } from './WhatsAppButton'
import { LeaveGuardProvider } from './LeaveGuardProvider'
import { ScrollButtons } from './ScrollButtons'
import { TopBar } from './TopBar'
import { SiteProvider } from '../site/SiteContext'
import { useSite } from '../site/useSite'
import { trackUsage } from '../usage/track'

function Shell() {
  const background = useSite()?.backgroundImageUrl
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
          <Shell />
        </LeaveGuardProvider>
      </AccountProvider>
    </SiteProvider>
  )
}
