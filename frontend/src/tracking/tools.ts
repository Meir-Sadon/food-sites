import type { TrackingIds } from '../api/site'

/** The names of the connected tools, as the privacy text lists them. */
export function connectedTools(ids: TrackingIds | null | undefined, t: (key: string) => string): string[] {
  if (!ids) return []
  return [
    ids.metaPixelId && t('footer.terms.tools.meta'),
    ids.googleAnalyticsId && t('footer.terms.tools.analytics'),
    ids.googleTagManagerId && t('footer.terms.tools.tagManager'),
    ids.googleAdsId && t('footer.terms.tools.ads'),
    ids.tikTokPixelId && t('footer.terms.tools.tikTok'),
  ].filter((name): name is string => !!name)
}
