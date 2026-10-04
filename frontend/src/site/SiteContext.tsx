import { useEffect, useState, type ReactNode } from 'react'
import { siteApi } from '../api/site'
import { SiteContext, type SiteState } from './useSite'

/** Loads the public site info (contact, delivery text, background) once for every client page. */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SiteState>({ site: null, failed: false })

  useEffect(() => {
    let active = true
    siteApi
      .get()
      .then((site) => active && setState({ site, failed: false }))
      .catch(() => active && setState({ site: null, failed: true }))
    return () => {
      active = false
    }
  }, [])

  return <SiteContext.Provider value={state}>{children}</SiteContext.Provider>
}
