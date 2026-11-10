import { apiJson, send } from './client'

/** The limits of the order page banner (FoodSite.Api `OrderBannerRules`). */
export const BANNER_LIMITS = { title: 60, tagline: 160, chip: 30, chips: 6, frames: 40, minScreens: 2, maxScreens: 10 } as const

export interface BannerFrame {
  id: number
  url: string
}

/**
 * The order page's top banner and the scroll animation under it. A missing `title`, `tagline` or colour means the standard
 * one, empty `chips` the standard ovals and a null `logoUrl` the site's main logo. In `GET /api/site` it is there only
 * while the banner is on, or the animation is on and has two pictures at least.
 */
export interface OrderBanner {
  /** Show this banner instead of the standard one. */
  enabled: boolean
  title: string | null
  tagline: string | null
  chips: string[]
  background: string | null
  textColor: string | null
  logoUrl: string | null
  animationEnabled: boolean
  /** How many screen heights of scrolling the animation takes. */
  animationScreens: number
  /** The animation's pictures, in the order scrolling moves through them. */
  frames: BannerFrame[]
}

export type BannerInput = Pick<OrderBanner, 'enabled' | 'title' | 'tagline' | 'chips' | 'background' | 'textColor' | 'animationEnabled' | 'animationScreens'>

function upload(method: 'PUT' | 'POST', file: File): RequestInit {
  const form = new FormData()
  form.append('file', file)
  return { method, body: form }
}

export const bannerApi = {
  get: () => apiJson<OrderBanner>('/api/admin/banner'),
  save: (input: BannerInput) => apiJson<OrderBanner>('/api/admin/banner', send('PUT', input)),
  uploadLogo: (file: File) => apiJson<OrderBanner>('/api/admin/banner/logo', upload('PUT', file)),
  removeLogo: () => apiJson<OrderBanner>('/api/admin/banner/logo', send('DELETE')),
  addFrame: (file: File) => apiJson<OrderBanner>('/api/admin/banner/frames', upload('POST', file)),
  removeFrame: (id: number) => apiJson<OrderBanner>(`/api/admin/banner/frames/${id}`, send('DELETE')),
  moveFrame: (id: number, direction: 'Up' | 'Down') => apiJson<OrderBanner>(`/api/admin/banner/frames/${id}/move`, send('POST', { direction })),
}
