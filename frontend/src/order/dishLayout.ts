import { createContext, useContext } from 'react'
import { isTileStyle, type DishLayout, type SectionLook, type SiteStyle } from '../api/site'
import { useSiteStyle } from '../site/useSite'

/** The layout a category or group asked for, for the dishes inside it; null outside one (the site's own). */
export const DishLayoutContext = createContext<DishLayout | null>(null)

/** What the site's style means for a dish card: tiles and rectangles are their own layouts, anything else is the regular card. */
export const layoutOfStyle = (style: SiteStyle): DishLayout => (isTileStyle(style) ? (style as DishLayout) : 'list')

/** How the dishes here are laid out: the section's own choice, else the site's style. */
export function useDishLayout(): DishLayout {
  const own = useContext(DishLayoutContext)
  const style = useSiteStyle()
  return own ?? layoutOfStyle(style)
}

/**
 * The attributes a category or group section carries: `data-layout` (always, the CSS of tiles and rectangles is scoped
 * to it) and `data-image-size` (only when the section has its own, so the site's `<html>` value applies otherwise).
 */
export function sectionAttributes(look: SectionLook | undefined, style: SiteStyle) {
  const layout = look?.layout ?? layoutOfStyle(style)
  return { layout, attrs: { 'data-layout': layout, 'data-image-size': look?.imageSize ?? undefined } }
}
