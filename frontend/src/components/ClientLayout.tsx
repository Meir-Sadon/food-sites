import { Outlet } from 'react-router'
import { AccountProvider } from '../account/AccountContext'
import { Footer } from './Footer'
import { LeaveGuardProvider } from './LeaveGuardProvider'
import { TopBar } from './TopBar'
import { SiteProvider } from '../site/SiteContext'
import { useSite } from '../site/useSite'

function Shell() {
  const background = useSite()?.backgroundImageUrl
  return (
    <div className="client-shell" style={background ? { backgroundImage: `url("${background}")` } : undefined}>
      <TopBar />
      <main className="page">
        <Outlet />
      </main>
      <Footer />
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
