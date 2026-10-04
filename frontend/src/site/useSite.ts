import { createContext, useContext } from 'react'
import type { Site } from '../api/site'

export interface SiteState {
  site: Site | null
  failed: boolean
}

export const SiteContext = createContext<SiteState>({ site: null, failed: false })

export const useSite = () => useContext(SiteContext).site

export const useSiteFailed = () => useContext(SiteContext).failed
