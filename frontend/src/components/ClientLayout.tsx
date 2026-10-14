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
import { colorVariables } from '../site/palettes'
import { useColors, useCorners, useSite, useSiteStyle } from '../site/useSite'
import { trackUsage } from '../usage/track'

/**
 * Marks the page with the site's style and corners (`<html data-style data-corners>`), which `styles/*.css` and
 * `--corner-scale` in index.css select on; the admin keeps its own look. The palette and the admin's colours are set
 * as CSS variables on the same element (`site/palettes.ts`) and removed when the client pages unmount.
 */
function useStyleAttribute() {
  const style = useSiteStyle()
  const corners = useCorners()
  const { palette, customColors, lineWidth } = useColors()
  const colorsKey = JSON.stringify([palette, customColors, lineWidth])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.style = style
    root.dataset.corners = corners
    return () => {
      delete root.dataset.style
      delete root.dataset.corners
    }
  }, [style, corners])
  useEffect(() => {
    const root = document.documentElement
    const [palette, customColors, lineWidth] = JSON.parse(colorsKey) as Parameters<typeof colorVariables>
    const vars = colorVariables(palette, customColors, lineWidth)
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
    return () => {
      for (const name of Object.keys(vars)) root.style.removeProperty(name)
    }
  }, [colorsKey])
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
