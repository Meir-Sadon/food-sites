import { createContext, useContext } from 'react'
import type { Feature, Site } from '../api/site'
import { site as siteConfig } from './config'

export interface SiteState {
  site: Site | null
  failed: boolean
}

export const SiteContext = createContext<SiteState>({ site: null, failed: false })

export const useSite = () => useContext(SiteContext).site

export const useSiteFailed = () => useContext(SiteContext).failed

/** The site info has loaded, or failed to: what `useFeature` answers won't change any more. */
export const useSiteSettled = () => {
  const { site, failed } = useContext(SiteContext)
  return site !== null || failed
}

/** Tells whether a feature is on: what `/api/site` says, or the site's site.json until (or unless) it answers. */
export function useFeatures(): (feature: Feature) => boolean {
  const site = useSite()
  return (feature) => (site ? site.features.includes(feature) : siteConfig.features?.[feature] === true)
}

export const useFeature = (feature: Feature) => useFeatures()(feature)
