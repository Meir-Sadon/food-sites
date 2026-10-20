import { apiJson, send } from './client'

/** The sizes of the entry pop-up (FoodSite.Api `EntryPopup.Sizes`). */
export const POPUP_SIZES = ['small', 'medium', 'large'] as const
export type PopupSize = (typeof POPUP_SIZES)[number]

/** `always`: on every page load; `session`: once until the browser tab is closed. */
export const POPUP_FREQUENCIES = ['always', 'session'] as const
export type PopupFrequency = (typeof POPUP_FREQUENCIES)[number]

export const POPUP_LIMITS = { title: 80, body: 600, buttonText: 30, buttonUrl: 500 } as const

/** The window shown when the site opens. In `GET /api/site` it is there only while it is on and has something to say. */
export interface Popup {
  enabled: boolean
  size: PopupSize
  frequency: PopupFrequency
  title: string | null
  body: string | null
  imageUrl: string | null
  buttonText: string | null
  buttonUrl: string | null
}

export type PopupInput = Pick<Popup, 'enabled' | 'size' | 'frequency' | 'title' | 'body' | 'buttonText' | 'buttonUrl'>

function upload(file: File): RequestInit {
  const form = new FormData()
  form.append('file', file)
  return { method: 'PUT', body: form }
}

export const popupApi = {
  get: () => apiJson<Popup>('/api/admin/popup'),
  save: (input: PopupInput) => apiJson<Popup>('/api/admin/popup', send('PUT', input)),
  uploadImage: (file: File) => apiJson<Popup>('/api/admin/popup/image', upload(file)),
  removeImage: () => apiJson<Popup>('/api/admin/popup/image', send('DELETE')),
}
