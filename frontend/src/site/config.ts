import siteJson from '@site/site.json'
import type { Feature } from '../api/site'

/** The active site's `site.json` (`sites/<SITE>/`, chosen at build time). Text lives in its `i18n/he.json`. */
export interface SiteConfig {
  id: string
  emoji: string
  /** Which features the site has by default; the API's answer (`/api/site` → `features`) wins once loaded. */
  features?: Partial<Record<Feature, boolean>>
  /**
   * The admin settings a new site starts with, plus its default look (`style`), order page layout
   * (`orderTotalPosition`, `orderFlow`), `corners` and `palette`; the API's answer (`/api/site`) wins once loaded.
   */
  settings?: Record<string, string>
}

export const site: SiteConfig = siteJson

// The logo may be any of these formats; a site folder has exactly one (scripts/check-sites.mjs checks).
const logos = import.meta.glob<string>('@site/logo.{svg,jpg,jpeg,png,webp}', { eager: true, import: 'default' })

export const siteLogo: string | undefined = Object.values(logos)[0]
