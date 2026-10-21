import type { ColorSet, Corners, FontPair, Palette, Shadows, Site, SiteStyle, Spacing, TileGroups } from '../api/site'
import { colorVariables } from './palettes'

/** Where the last look of the site is kept; `index.html` reads the same key before the first paint. */
export const THEME_CACHE_KEY = 'foodSiteTheme'

/** The parts of `/api/site` that decide how the client site looks, as the server last sent them. */
export interface CachedTheme {
  palette: Palette
  customColors: ColorSet
  lineWidth: number | null
  style: SiteStyle
  corners: Corners
  font: FontPair
  shadows: Shadows
  spacing: Spacing
  tileGroups: TileGroups
  /** The CSS variables and `<html data-*>` values these make, for the script in `index.html` to apply at once. */
  vars: Record<string, string>
  attrs: Record<string, string>
}

let cached: CachedTheme | null | undefined

/** The look saved by an earlier visit, so the page can start with it instead of the site.json defaults. */
export function readCachedTheme(): CachedTheme | null {
  if (cached !== undefined) return cached
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY)
    cached = raw ? (JSON.parse(raw) as CachedTheme) : null
  } catch {
    cached = null
  }
  return cached
}

/** Remembers the look `/api/site` just sent, for the next visit's first paint. */
export function saveTheme(site: Site) {
  const theme: CachedTheme = {
    palette: site.palette,
    customColors: site.customColors,
    lineWidth: site.lineWidth,
    style: site.style,
    corners: site.corners,
    font: site.font,
    shadows: site.shadows,
    spacing: site.spacing,
    tileGroups: site.tileGroups,
    vars: colorVariables(site.palette, site.customColors, site.lineWidth),
    attrs: {
      style: site.style,
      corners: site.corners,
      font: site.font,
      shadows: site.shadows,
      spacing: site.spacing,
      tileGroups: site.tileGroups,
    },
  }
  cached = theme
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(theme))
  } catch {
    // Storage blocked or full: the next visit just starts from the site.json look.
  }
}
