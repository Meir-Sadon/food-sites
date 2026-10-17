import { apiJson, send } from './client'

/** The platforms with an icon of their own (FoodSite.Api `SocialLinks.Platforms`), shown first and in this order. */
export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube'] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]
export type SocialKind = SocialPlatform | 'custom'

/** The most custom links the admin can add. */
export const MAX_CUSTOM_LINKS = 10

/** A link to one of the business's pages elsewhere; `label` is set only for a custom link. */
export interface SocialLink {
  kind: SocialKind
  label: string | null
  url: string
}

export const socialLinksApi = {
  get: () => apiJson<SocialLink[]>('/api/admin/social-links'),
  /** The list sent replaces the stored one. */
  save: (links: SocialLink[]) => apiJson<SocialLink[]>('/api/admin/social-links', send('PUT', { links })),
}
