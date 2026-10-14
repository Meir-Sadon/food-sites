import { createContext, useContext } from 'react'
import { FONTS, PALETTES, CORNERS, SHADOWS, SPACINGS, ORDER_FLOWS, ORDER_TOTAL_POSITIONS, SITE_STYLES, type ColorSet, type Corners, type Feature, type FontPair, type Palette, type Shadows, type Spacing, type OrderFlow, type OrderTotalPosition, type Site, type SiteStyle } from '../api/site'
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

/** The site's look: what `/api/site` says, or the site's site.json until (or unless) it answers. */
export function useSiteStyle(): SiteStyle {
  const site = useSite()
  if (site) return site.style
  const style = siteConfig.settings?.style
  return SITE_STYLES.find((known) => known === style) ?? 'classic'
}

/** How the order page is laid out: what `/api/site` says, or the site's site.json until (or unless) it answers. */
export function useOrderLayout(): { totalPosition: OrderTotalPosition; flow: OrderFlow } {
  const site = useSite()
  if (site) return { totalPosition: site.orderTotalPosition, flow: site.orderFlow }
  const { orderTotalPosition, orderFlow } = siteConfig.settings ?? {}
  return {
    totalPosition: ORDER_TOTAL_POSITIONS.find((known) => known === orderTotalPosition) ?? 'bottom',
    flow: ORDER_FLOWS.find((known) => known === orderFlow) ?? 'page',
  }
}

/** How round the client site's corners are: what `/api/site` says, or the site's site.json until (or unless) it answers. */
export function useCorners(): Corners {
  const site = useSite()
  if (site) return site.corners
  const corners = siteConfig.settings?.corners
  return CORNERS.find((known) => known === corners) ?? 'rounded'
}

/** The ready-made palette, the admin's own colours over it and the line thickness: what `/api/site` says, or the site's site.json palette until it answers. */
export function useColors(): { palette: Palette; customColors: ColorSet; lineWidth: number | null } {
  const site = useSite()
  if (site) return { palette: site.palette, customColors: site.customColors, lineWidth: site.lineWidth }
  const palette = siteConfig.settings?.palette
  return { palette: PALETTES.find((known) => known === palette) ?? 'site', customColors: {}, lineWidth: null }
}

/** The font pair, shadow strength and spacing of the client site; `standard` (the style's own) until `/api/site` answers. */
export function useFinish(): { font: FontPair; shadows: Shadows; spacing: Spacing } {
  const site = useSite()
  return {
    font: FONTS.find((known) => known === site?.font) ?? 'standard',
    shadows: SHADOWS.find((known) => known === site?.shadows) ?? 'standard',
    spacing: SPACINGS.find((known) => known === site?.spacing) ?? 'standard',
  }
}
